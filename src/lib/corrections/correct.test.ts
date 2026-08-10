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
