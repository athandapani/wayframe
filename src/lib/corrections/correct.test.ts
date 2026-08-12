import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { proposeCorrection, type CallModel } from "./correct";
import type { CorrectionInput } from "./prompt";

function toolUseResponse(input: unknown): Anthropic.Message {
  return {
    content: [{ type: "tool_use", id: "tool_1", name: "propose_correction", input }],
  } as unknown as Anthropic.Message;
}

function noToolCallResponse(): Anthropic.Message {
  return { content: [{ type: "text", text: "I don't understand." }] } as unknown as Anthropic.Message;
}

const input: CorrectionInput = {
  milestones: [
    { id: "m1", title: "Pilot Site 3 Go-Live", laneName: "Field Pilot Deployments", date: "2026-11-01", status: "not-started" },
    { id: "m2", title: "Pilot Fleet Uptime", laneName: "Field Pilot Deployments", date: "2027-01-05", status: "not-started" },
  ],
  lanes: [{ id: "lane-pilot", name: "Field Pilot Deployments" }],
  swimlanes: [{ id: "lane-pilot", name: "Field Pilot Deployments", type: "lane" }],
  topLevelItems: [],
  correctionText: "mark pilot site 3 go-live complete",
};

describe("proposeCorrection", () => {
  it("rejects an empty correction request without calling the model", async () => {
    const callModel = vi.fn<CallModel>();
    const result = await proposeCorrection({ ...input, correctionText: "  " }, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no_input");
    expect(callModel).not.toHaveBeenCalled();
  });

  it("returns the validated response on a well-formed tool call", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({
        ops: [{ targetId: "m1", field: "status", newValue: "complete", reason: "matched Pilot Site 3 Go-Live" }],
        skipped: [],
      }),
    );

    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.ops).toHaveLength(1);
      expect(result.response.ops[0].targetId).toBe("m1");
    }
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it("surfaces api_error when the model call throws", async () => {
    const callModel: CallModel = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("api_error");
      expect(result.error.message).toBe("network down");
    }
  });

  it("fails closed with no_tool_call if the model never calls the tool, even after retry", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(noToolCallResponse());
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no_tool_call");
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it("retries once on a hallucinated targetId, then succeeds if the repair is valid", async () => {
    const callModel: CallModel = vi
      .fn()
      .mockResolvedValueOnce(
        toolUseResponse({ ops: [{ targetId: "does-not-exist", field: "status", newValue: "complete", reason: "bad" }], skipped: [] }),
      )
      .mockResolvedValueOnce(
        toolUseResponse({ ops: [{ targetId: "m1", field: "status", newValue: "complete", reason: "corrected" }], skipped: [] }),
      );

    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.ops[0].targetId).toBe("m1");
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("fails closed with unknown_target if the repair retry is still bad", async () => {
    const badResponse = toolUseResponse({
      ops: [{ targetId: "does-not-exist", field: "status", newValue: "complete", reason: "bad" }],
      skipped: [],
    });
    const callModel: CallModel = vi.fn().mockResolvedValue(badResponse);

    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_target");
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("returns empty ops/skipped when the model can't resolve any directive", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(toolUseResponse({ ops: [], skipped: [] }));
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.ops).toEqual([]);
      expect(result.response.skipped).toEqual([]);
    }
  });
});

describe("proposeCorrection deletes/swimlaneOps (wayframe#58)", () => {
  it("validates a delete against the swimlane it targets", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], deletes: [{ targetId: "lane-pilot", entityType: "swimlane", reason: "delete the pilot lane" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.deletes).toEqual([{ targetId: "lane-pilot", entityType: "swimlane", reason: "delete the pilot lane" }]);
  });

  it("fails closed with unknown_target when a delete references an id outside the given list", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], deletes: [{ targetId: "does-not-exist", entityType: "milestone", reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_target");
  });

  it("coerces a recolor swimlaneOp from the model's flat raw shape", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], swimlaneOps: [{ kind: "recolor", targetId: "lane-pilot", color: "blue", reason: "recolor it blue" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.swimlaneOps).toEqual([{ kind: "recolor", targetId: "lane-pilot", color: "blue", reason: "recolor it blue" }]);
  });

  it("rejects a recolor swimlaneOp with a color outside the curated named list", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], swimlaneOps: [{ kind: "recolor", targetId: "lane-pilot", color: "#ff0000", reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema_validation_failed");
  });

  it("coerces an add swimlaneOp, which needs no targetId", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], swimlaneOps: [{ kind: "add", swimlaneType: "lane", name: "Regulatory Affairs", reason: "add a new lane" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.swimlaneOps).toEqual([{ kind: "add", swimlaneType: "lane", name: "Regulatory Affairs", reason: "add a new lane" }]);
  });
});
