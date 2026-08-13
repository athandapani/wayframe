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
  topLevelItems: [{ id: "t1", type: "milestone", title: "GA", date: "2027-03-01", status: "not-started" }],
  document: { programName: "Atlas", owner: "K. Simmons", bluf: { statement: "On track", bullets: [] } },
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

describe("proposeCorrection topLevelItemOps/addTopLevelItems/dependencyOps (wayframe#59)", () => {
  it("coerces a topLevelItemOp from the model's uniform-string raw shape", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], topLevelItemOps: [{ targetId: "t1", field: "title", newValue: "General Availability", reason: "rename GA" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.topLevelItemOps).toEqual([{ targetId: "t1", field: "title", newValue: "General Availability", reason: "rename GA" }]);
  });

  it("coerces a showReferenceLine topLevelItemOp's string newValue into a real boolean", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], topLevelItemOps: [{ targetId: "t1", field: "showReferenceLine", newValue: "true", reason: "show it" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.topLevelItemOps[0]).toEqual({ targetId: "t1", field: "showReferenceLine", newValue: true, reason: "show it" });
  });

  it("fails closed with unknown_target when a topLevelItemOp references an id outside the given list", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], topLevelItemOps: [{ targetId: "does-not-exist", field: "title", newValue: "X", reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_target");
  });

  it("coerces an annotation addTopLevelItems entry, requiring a message", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({
        ops: [],
        skipped: [],
        addTopLevelItems: [{ kind: "annotation", title: "Board Review", date: "2026-03-03", message: "funding decision", reason: "add annotation" }],
      }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.addTopLevelItems).toEqual([
        { kind: "annotation", title: "Board Review", date: "2026-03-03", message: "funding decision", reason: "add annotation" },
      ]);
    }
  });

  it("rejects an annotation addTopLevelItems entry with no message", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], addTopLevelItems: [{ kind: "annotation", title: "Board Review", date: "2026-03-03", reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema_validation_failed");
  });

  it("validates a dependencyOp against the milestone list, defaulting showConnector when unset", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], dependencyOps: [{ dependentId: "m2", dependencyId: "m1", add: true, reason: "make m2 depend on m1" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.dependencyOps).toEqual([{ dependentId: "m2", dependencyId: "m1", add: true, reason: "make m2 depend on m1" }]);
  });

  it("fails closed with unknown_target when a dependencyOp references an id outside the given list", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], dependencyOps: [{ dependentId: "m2", dependencyId: "does-not-exist", add: true, reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_target");
  });
});

describe("proposeCorrection attachmentOps/blufOp/documentOp (wayframe#55/#60)", () => {
  it("coerces an add attachmentOp from the model's flat raw shape", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], attachmentOps: [{ targetId: "m1", action: "add", type: "link", url: "https://example.com/survey.pdf", reason: "attach the survey" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.attachmentOps).toEqual([
        { targetId: "m1", action: "add", attachment: { type: "link", url: "https://example.com/survey.pdf" }, reason: "attach the survey" },
      ]);
    }
  });

  it("rejects an add attachmentOp missing a url", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], attachmentOps: [{ targetId: "m1", action: "add", type: "link", reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema_validation_failed");
  });

  it("fails closed with unknown_target when an attachmentOp references an id outside the given list", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], attachmentOps: [{ targetId: "does-not-exist", action: "remove", index: 0, reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_target");
  });

  it("passes through a blufOp touching only the statement", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], blufOp: { statement: "On track for GA", reason: "update the so-what" } }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.blufOp).toEqual({ statement: "On track for GA", reason: "update the so-what" });
  });

  it("passes through a documentOp touching programName and owner", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], documentOp: { programName: "Atlas v2", owner: "K. Simmons", reason: "rename and reassign" } }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.documentOp).toEqual({ programName: "Atlas v2", owner: "K. Simmons", reason: "rename and reassign" });
  });

  it("defaults blufOp/documentOp to null when the model omits them", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(toolUseResponse({ ops: [], skipped: [] }));
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.blufOp).toBeNull();
      expect(result.response.documentOp).toBeNull();
    }
  });
});

describe("proposeCorrection bulkShiftOps (wayframe#57)", () => {
  it("passes through a well-formed lane-selector bulkShiftOp", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], bulkShiftOps: [{ selector: { kind: "lane", laneId: "lane-pilot" }, deltaDays: 14, reason: "push the whole lane out two weeks" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.bulkShiftOps).toEqual([{ selector: { kind: "lane", laneId: "lane-pilot" }, deltaDays: 14, reason: "push the whole lane out two weeks" }]);
    }
  });

  it("accepts the reserved PROGRAM pseudo-lane even though it isn't a real lane id", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], bulkShiftOps: [{ selector: { kind: "lane", laneId: "PROGRAM" }, deltaDays: 3, reason: "shift the band" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
  });

  it("passes through an after-selector bulkShiftOp referencing a milestone id", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], bulkShiftOps: [{ selector: { kind: "after", afterId: "m1" }, deltaDays: -5, reason: "pull the back half in" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
  });

  it("passes through an ids-selector bulkShiftOp referencing a top-level-item id", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], bulkShiftOps: [{ selector: { kind: "ids", ids: ["m1", "t1"] }, deltaDays: 7, reason: "delay both" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
  });

  it("fails closed with unknown_target when a lane-selector bulkShiftOp names a non-PROGRAM lane outside the given list", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], bulkShiftOps: [{ selector: { kind: "lane", laneId: "does-not-exist" }, deltaDays: 5, reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_target");
  });

  it("fails closed with unknown_target when an after-selector bulkShiftOp references an id outside the given list", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], bulkShiftOps: [{ selector: { kind: "after", afterId: "does-not-exist" }, deltaDays: 5, reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_target");
  });

  it("fails closed with unknown_target when an ids-selector bulkShiftOp includes even one id outside the given lists", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], bulkShiftOps: [{ selector: { kind: "ids", ids: ["m1", "does-not-exist"] }, deltaDays: 5, reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_target");
  });

  it("defaults bulkShiftOps to an empty array when the model omits it", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(toolUseResponse({ ops: [], skipped: [] }));
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.bulkShiftOps).toEqual([]);
  });
});

describe("proposeCorrection acceptBaselineOps (wayframe#62)", () => {
  it("passes through a well-formed scope=one acceptBaselineOp", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], acceptBaselineOps: [{ scope: "one", targetId: "m1", reason: "accept the slip on m1" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.acceptBaselineOps).toEqual([{ scope: "one", targetId: "m1", reason: "accept the slip on m1" }]);
    }
  });

  it("passes through a scope=all acceptBaselineOp with no targetId", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], acceptBaselineOps: [{ scope: "all", reason: "accept every slip" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.acceptBaselineOps).toEqual([{ scope: "all", reason: "accept every slip" }]);
  });

  it("fails closed with unknown_target when a scope=one acceptBaselineOp names an id outside the given list", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(
      toolUseResponse({ ops: [], skipped: [], acceptBaselineOps: [{ scope: "one", targetId: "does-not-exist", reason: "bad" }] }),
    );
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_target");
  });

  it("defaults acceptBaselineOps to an empty array when the model omits it", async () => {
    const callModel: CallModel = vi.fn().mockResolvedValue(toolUseResponse({ ops: [], skipped: [] }));
    const result = await proposeCorrection(input, callModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.acceptBaselineOps).toEqual([]);
  });
});
