import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { RoadmapData } from "@/components/timeline/types";
import { reduce, useCorrectionBox, type CorrectionBoxState } from "./use-correction-box";

const STORAGE_KEY = "wayframe:document";

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

  it("hydrated replaces data without pushing history — a refresh reload isn't an undoable edit", () => {
    const state: CorrectionBoxState = {
      ...initialState(),
      pending: { inputText: "x", ops: [], skipped: [] },
      error: "stale error",
    };
    const persisted = { ...baseData(), programName: "Persisted" };

    // hydrated recomputes critical path (wayframe#34/#35), so next.data is a
    // new object even when nothing about the critical-path result changes —
    // compare by value, not reference.
    const next = reduce(state, { type: "hydrated", data: persisted });
    expect(next.data).toEqual(persisted);
    expect(next.history).toHaveLength(0);
    expect(next.pending).toBeNull();
    expect(next.error).toBeNull();
  });
});

describe("snapshotRollups reducer action (wayframe#33)", () => {
  // baseData's m1 is not-started with date 2026-01-01, so as of 2026-06-10
  // it's overdue -> rag "red" per ragForLane's date-aware refinement.
  it("appends today's rollup snapshot to a lane with no history yet, without pushing undo history", () => {
    const state = initialState();
    const next = reduce(state, { type: "snapshotRollups", today: new Date("2026-06-10") });
    expect(next.data.swimlanes[0].rollupHistory).toEqual([{ date: "2026-06-10", rag: "red", atRiskCount: 0, delayedCount: 0 }]);
    expect(next.history).toHaveLength(0);
  });

  it("is a no-op (same state reference) when today's entry already exists for every lane", () => {
    const state = initialState();
    state.data.swimlanes[0].rollupHistory = [{ date: "2026-06-10", rag: "red", atRiskCount: 0, delayedCount: 0 }];
    const next = reduce(state, { type: "snapshotRollups", today: new Date("2026-06-10") });
    expect(next).toBe(state);
  });

  it("appends a new day's entry alongside prior history rather than replacing it", () => {
    const state = initialState();
    state.data.swimlanes[0].rollupHistory = [{ date: "2026-06-09", rag: "amber", atRiskCount: 1, delayedCount: 0 }];
    const next = reduce(state, { type: "snapshotRollups", today: new Date("2026-06-10") });
    expect(next.data.swimlanes[0].rollupHistory).toEqual([
      { date: "2026-06-09", rag: "amber", atRiskCount: 1, delayedCount: 0 },
      { date: "2026-06-10", rag: "red", atRiskCount: 0, delayedCount: 0 },
    ]);
  });
});

describe("useCorrectionBox rollup snapshot wiring (wayframe#33)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("writes today's rollup snapshot once, after rehydration", async () => {
    const { result } = renderHook(() => useCorrectionBox(baseData(), false, new Date("2026-06-10")));

    await waitFor(() => {
      expect(result.current.data.swimlanes[0].rollupHistory).toEqual([{ date: "2026-06-10", rag: "red", atRiskCount: 0, delayedCount: 0 }]);
    });
    expect(result.current.historyLength).toBe(0);
  });
});

describe("useCorrectionBox localStorage persistence (wayframe#22)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists data to localStorage as it changes", async () => {
    const { result } = renderHook(() => useCorrectionBox(baseData()));

    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    act(() => {
      result.current.editMilestone([{ targetId: "m1", field: "status", newValue: "complete", reason: "r" }]);
    });

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!) as RoadmapData;
      expect(saved.milestones[0].status).toBe("complete");
    });
  });

  it("rehydrates from a previously persisted document on mount instead of the initial data", async () => {
    const persisted = { ...baseData(), programName: "Persisted Program" };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    const { result } = renderHook(() => useCorrectionBox(baseData()));

    await waitFor(() => {
      expect(result.current.data.programName).toBe("Persisted Program");
    });
    expect(result.current.historyLength).toBe(0);
  });

  it("does not clobber a persisted document with initialData before rehydrating", async () => {
    const persisted = { ...baseData(), programName: "Persisted Program" };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    renderHook(() => useCorrectionBox(baseData()));

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!) as RoadmapData;
      expect(saved.programName).toBe("Persisted Program");
    });
  });
});
