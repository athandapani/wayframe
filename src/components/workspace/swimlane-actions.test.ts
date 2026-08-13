import { describe, expect, it } from "vitest";
import { reduce, type CorrectionBoxState } from "@/components/correction-box/use-correction-box";
import type { Milestone, RoadmapData } from "@/components/timeline/types";

function milestone(id: string, laneId: string, deps: string[] = []): Milestone {
  return {
    id,
    laneId,
    title: id,
    date: "2026-01-01",
    status: "not-started",
    dependsOn: deps.map((d) => ({ id: d, showConnector: true })),
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
  };
}

function baseData(): RoadmapData {
  return {
    schemaVersion: "1.0",
    programName: "P",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "o",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [
      { id: "lane-a", order: 0, type: "lane", name: "Alpha" },
      { id: "lane-b", order: 1, type: "lane", name: "Bravo" },
      { id: "sep", order: 2, type: "separator", name: "Group" },
      { id: "lane-c", order: 3, type: "lane", name: "Charlie" },
    ],
    topLevelItems: [],
    milestones: [milestone("a1", "lane-a"), milestone("b1", "lane-b", ["a1"]), milestone("c1", "lane-c", ["b1"])],
  };
}

const state = (): CorrectionBoxState => ({ data: baseData(), history: [], pending: null, error: null, loading: false });

describe("swimlane actions", () => {
  it("appends a new lane after the last row", () => {
    const next = reduce(state(), { type: "addSwimlane", swimlaneType: "lane", newId: "new-1" });
    const added = next.data.swimlanes.find((l) => l.id === "new-1")!;
    expect(added.type).toBe("lane");
    expect(added.order).toBe(4);
    expect(next.history).toHaveLength(1);
  });

  it("adds a group band as a separator", () => {
    const next = reduce(state(), { type: "addSwimlane", swimlaneType: "separator", newId: "g" });
    expect(next.data.swimlanes.find((l) => l.id === "g")!.type).toBe("separator");
  });

  it("renames without touching anything else", () => {
    const next = reduce(state(), { type: "renameSwimlane", id: "lane-b", name: "Renamed" });
    expect(next.data.swimlanes.find((l) => l.id === "lane-b")!.name).toBe("Renamed");
    expect(next.data.milestones).toHaveLength(3);
  });

  it("deletes a lane along with the milestones it owns", () => {
    const next = reduce(state(), { type: "removeSwimlane", id: "lane-b" });
    expect(next.data.swimlanes.find((l) => l.id === "lane-b")).toBeUndefined();
    expect(next.data.milestones.map((m) => m.id)).toEqual(["a1", "c1"]);
  });

  it("strips dependencies that pointed at the deleted milestones", () => {
    // c1 depended on b1, which lived in lane-b. Leaving that edge behind
    // would produce exactly the dangling reference the file loader refuses
    // to open.
    const next = reduce(state(), { type: "removeSwimlane", id: "lane-b" });
    const c1 = next.data.milestones.find((m) => m.id === "c1")!;
    expect(c1.dependsOn).toEqual([]);
  });

  it("renumbers order after a delete so there are no gaps", () => {
    const next = reduce(state(), { type: "removeSwimlane", id: "lane-b" });
    expect(next.data.swimlanes.map((l) => l.order)).toEqual([0, 1, 2]);
  });

  it("moves a row up and renumbers", () => {
    const next = reduce(state(), { type: "moveSwimlane", id: "lane-b", delta: -1 });
    const byOrder = [...next.data.swimlanes].sort((a, b) => a.order - b.order).map((l) => l.id);
    expect(byOrder).toEqual(["lane-b", "lane-a", "sep", "lane-c"]);
  });

  it("moves a row down", () => {
    const next = reduce(state(), { type: "moveSwimlane", id: "lane-a", delta: 1 });
    const byOrder = [...next.data.swimlanes].sort((a, b) => a.order - b.order).map((l) => l.id);
    expect(byOrder).toEqual(["lane-b", "lane-a", "sep", "lane-c"]);
  });

  it("refuses to move past either end", () => {
    const s = state();
    expect(reduce(s, { type: "moveSwimlane", id: "lane-a", delta: -1 })).toBe(s);
    expect(reduce(s, { type: "moveSwimlane", id: "lane-c", delta: 1 })).toBe(s);
  });

  it("makes every swimlane change undoable", () => {
    for (const action of [
      { type: "addSwimlane", swimlaneType: "lane", newId: "n" } as const,
      { type: "renameSwimlane", id: "lane-a", name: "x" } as const,
      { type: "removeSwimlane", id: "lane-a" } as const,
      { type: "moveSwimlane", id: "lane-a", delta: 1 } as const,
      { type: "setRagOverride", id: "lane-a", rag: "red" } as const,
    ]) {
      expect(reduce(state(), action).history).toHaveLength(1);
    }
  });

  it("sets and clears a RAG override", () => {
    const withOverride = reduce(state(), { type: "setRagOverride", id: "lane-a", rag: "red" });
    expect(withOverride.data.swimlanes.find((l) => l.id === "lane-a")!.ragOverride).toBe("red");
    const cleared = reduce(withOverride, { type: "setRagOverride", id: "lane-a", rag: "auto" });
    expect(cleared.data.swimlanes.find((l) => l.id === "lane-a")!.ragOverride).toBeUndefined();
  });
});

describe("removeTopLevelItem reducer action (wayframe#58)", () => {
  it("deletes the item and clears any linksToTopLevelMilestone reference to it", () => {
    const withTopLevel: CorrectionBoxState = {
      ...state(),
      data: {
        ...baseData(),
        topLevelItems: [{ id: "t1", type: "milestone", title: "Kickoff", date: "2026-01-01", status: "not-started" }],
        milestones: [{ ...milestone("a1", "lane-a"), linksToTopLevelMilestone: "t1" }],
      },
    };
    const next = reduce(withTopLevel, { type: "removeTopLevelItem", id: "t1" });
    expect(next.data.topLevelItems).toHaveLength(0);
    expect(next.data.milestones[0].linksToTopLevelMilestone).toBeNull();
    expect(next.history).toHaveLength(1);
  });
});

describe("apply with deletes and swimlaneOps (wayframe#58)", () => {
  it("applies pending deletes across entity types alongside milestone ops", () => {
    const withPending: CorrectionBoxState = {
      ...state(),
      pending: {
        inputText: "delete lane-a",
        ops: [],
        skipped: [],
        adds: [],
        deletes: [{ targetId: "lane-a", entityType: "swimlane", reason: "r" }],
        swimlaneOps: [],
        topLevelItemOps: [],
        addTopLevelItems: [],
        dependencyOps: [],
        attachmentOps: [],
        acceptBaselineOps: [],
        blufOp: null,
        documentOp: null,
        ambiguous: null,
      },
    };
    const next = reduce(withPending, { type: "apply", adds: [], resolvedSwimlaneOps: [], resolvedTopLevelAdds: [] });
    expect(next.data.swimlanes.find((l) => l.id === "lane-a")).toBeUndefined();
    expect(next.data.milestones.find((m) => m.id === "a1")).toBeUndefined();
    expect(next.pending).toBeNull();
  });

  it("applies pending swimlaneOps, resolving a fresh id for an 'add'", () => {
    const withPending: CorrectionBoxState = {
      ...state(),
      pending: {
        inputText: "add a lane and recolor Alpha",
        ops: [],
        skipped: [],
        adds: [],
        deletes: [],
        swimlaneOps: [
          { kind: "add", swimlaneType: "lane", name: "Delta", reason: "r" },
          { kind: "recolor", targetId: "lane-a", color: "blue", reason: "r" },
        ],
        topLevelItemOps: [],
        addTopLevelItems: [],
        dependencyOps: [],
        attachmentOps: [],
        acceptBaselineOps: [],
        blufOp: null,
        documentOp: null,
        ambiguous: null,
      },
    };
    const next = reduce(withPending, {
      type: "apply",
      adds: [],
      resolvedSwimlaneOps: [
        { op: { kind: "add", swimlaneType: "lane", name: "Delta", reason: "r" }, newId: "new-lane" },
        { op: { kind: "recolor", targetId: "lane-a", color: "blue", reason: "r" }, newId: "" },
      ],
      resolvedTopLevelAdds: [],
    });
    expect(next.data.swimlanes.find((l) => l.id === "new-lane")).toMatchObject({ name: "Delta", type: "lane" });
    expect(next.data.swimlanes.find((l) => l.id === "lane-a")!.color).toBeDefined();
  });
});
