import { describe, expect, it } from "vitest";
import type { RoadmapData } from "@/components/timeline/types";
import { reduce, type CorrectionBoxState } from "./use-correction-box";

function baseData(): RoadmapData {
  return {
    schemaVersion: "1.0",
    programName: "Test",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [
      {
        id: "m1",
        laneId: "lane-1",
        title: "Milestone 1",
        date: "2026-01-01",
        status: "not-started",
        dependsOn: [],
        linksToTopLevelMilestone: null,
        isCriticalPath: false,
      },
    ],
  };
}

function initialState(): CorrectionBoxState {
  return { data: baseData(), history: [], pending: null, error: null, loading: false };
}

describe("correction box reducer", () => {
  it("apply commits pending ops, pushes history, and clears pending", () => {
    const state: CorrectionBoxState = {
      ...initialState(),
      pending: { inputText: "mark m1 complete", ops: [{ targetId: "m1", field: "status", newValue: "complete", reason: "r" }], skipped: [] },
    };

    const next = reduce(state, { type: "apply" });
    expect(next.data.milestones[0].status).toBe("complete");
    expect(next.pending).toBeNull();
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toBe(state.data);
  });

  it("undo restores the previous snapshot and pops history — this is the bug a browser test caught", () => {
    const original = baseData();
    const corrected: RoadmapData = { ...original, milestones: [{ ...original.milestones[0], status: "complete" }] };
    const state: CorrectionBoxState = { data: corrected, history: [original], pending: null, error: null, loading: false };

    const next = reduce(state, { type: "undo" });
    expect(next.data).toBe(original);
    expect(next.data.milestones[0].status).toBe("not-started");
    expect(next.history).toHaveLength(0);
  });

  it("undo is a no-op with an error when history is empty", () => {
    const state = initialState();
    const next = reduce(state, { type: "undo" });
    expect(next.data).toBe(state.data);
    expect(next.error).toBe("Nothing to undo");
  });

  it("supports multi-step undo across two applied patches", () => {
    let state = initialState();
    // Apply patch 1
    state = { ...state, pending: { inputText: "p1", ops: [{ targetId: "m1", field: "status", newValue: "at-risk", reason: "r" }], skipped: [] } };
    state = reduce(state, { type: "apply" });
    const afterFirstApply = state.data;
    expect(state.data.milestones[0].status).toBe("at-risk");

    // Apply patch 2
    state = { ...state, pending: { inputText: "p2", ops: [{ targetId: "m1", field: "status", newValue: "complete", reason: "r" }], skipped: [] } };
    state = reduce(state, { type: "apply" });
    expect(state.data.milestones[0].status).toBe("complete");
    expect(state.history).toHaveLength(2);

    // First undo -> back to "at-risk"
    state = reduce(state, { type: "undo" });
    expect(state.data).toBe(afterFirstApply);
    expect(state.data.milestones[0].status).toBe("at-risk");
    expect(state.history).toHaveLength(1);

    // Second undo -> back to the original
    state = reduce(state, { type: "undo" });
    expect(state.data.milestones[0].status).toBe("not-started");
    expect(state.history).toHaveLength(0);
  });

  it("discard clears pending without touching data or history", () => {
    const state: CorrectionBoxState = {
      ...initialState(),
      pending: { inputText: "x", ops: [{ targetId: "m1", field: "status", newValue: "complete", reason: "r" }], skipped: [] },
    };
    const next = reduce(state, { type: "discard" });
    expect(next.pending).toBeNull();
    expect(next.data).toBe(state.data);
  });

  it("requestFailed clears any pending patch and sets the error", () => {
    const state: CorrectionBoxState = {
      ...initialState(),
      loading: true,
      pending: { inputText: "x", ops: [], skipped: [] },
    };
    const next = reduce(state, { type: "requestFailed", error: "boom" });
    expect(next.loading).toBe(false);
    expect(next.pending).toBeNull();
    expect(next.error).toBe("boom");
  });
});
