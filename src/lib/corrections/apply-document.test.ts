import { describe, expect, it } from "vitest";
import type { Milestone, RoadmapData } from "@/components/timeline/types";
import {
  addSwimlaneOp,
  applyDeletes,
  applySwimlaneOps,
  moveSwimlaneOp,
  removeMilestoneOp,
  removeSwimlaneOp,
  removeTopLevelItemOp,
  renameSwimlaneOp,
  resolveNamedLaneColor,
  setLaneColorOp,
  setLaneDensityOp,
  setRagOverrideOp,
} from "./apply-document";
import type { DeleteOp, SwimlaneOp } from "./schema";

function milestone(id: string, laneId: string, overrides: Partial<Milestone> = {}): Milestone {
  return {
    id,
    laneId,
    title: id,
    date: "2026-01-01",
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
    ...overrides,
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
    ],
    topLevelItems: [{ id: "t1", type: "milestone", title: "Kickoff", date: "2026-01-01", status: "not-started" }],
    milestones: [
      milestone("a1", "lane-a", { linksToTopLevelMilestone: "t1" }),
      milestone("b1", "lane-b", { dependsOn: [{ id: "a1", showConnector: true }] }),
    ],
  };
}

describe("removeMilestoneOp", () => {
  it("strips dependsOn edges that pointed at the deleted milestone", () => {
    const next = removeMilestoneOp(baseData(), "a1");
    expect(next.milestones.map((m) => m.id)).toEqual(["b1"]);
    expect(next.milestones[0].dependsOn).toEqual([]);
  });
});

describe("removeTopLevelItemOp", () => {
  it("deletes the item and clears any linksToTopLevelMilestone reference to it", () => {
    const next = removeTopLevelItemOp(baseData(), "t1");
    expect(next.topLevelItems).toHaveLength(0);
    expect(next.milestones.find((m) => m.id === "a1")!.linksToTopLevelMilestone).toBeNull();
  });

  it("leaves unrelated milestones' links untouched", () => {
    const next = removeTopLevelItemOp(baseData(), "t1");
    expect(next.milestones.find((m) => m.id === "b1")!.linksToTopLevelMilestone).toBeNull();
  });
});

describe("removeSwimlaneOp", () => {
  it("deletes the lane's milestones and strips dangling dependsOn edges, renumbering order", () => {
    const next = removeSwimlaneOp(baseData(), "lane-a");
    expect(next.swimlanes.map((l) => l.id)).toEqual(["lane-b", "sep"]);
    expect(next.swimlanes.map((l) => l.order)).toEqual([0, 1]);
    expect(next.milestones.map((m) => m.id)).toEqual(["b1"]);
    expect(next.milestones[0].dependsOn).toEqual([]);
  });

  it("deletes a separator without touching milestones", () => {
    const next = removeSwimlaneOp(baseData(), "sep");
    expect(next.swimlanes.map((l) => l.id)).toEqual(["lane-a", "lane-b"]);
    expect(next.milestones).toHaveLength(2);
  });
});

describe("addSwimlaneOp / renameSwimlaneOp / moveSwimlaneOp", () => {
  it("appends a new swimlane after the last row", () => {
    const next = addSwimlaneOp(baseData(), "lane", "Charlie", "lane-c");
    const added = next.swimlanes.find((l) => l.id === "lane-c")!;
    expect(added).toMatchObject({ type: "lane", name: "Charlie", order: 3 });
  });

  it("renames without touching anything else", () => {
    const next = renameSwimlaneOp(baseData(), "lane-a", "Renamed");
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.name).toBe("Renamed");
  });

  it("moves a row and renumbers", () => {
    const next = moveSwimlaneOp(baseData(), "lane-b", -1);
    expect([...next.swimlanes].sort((a, b) => a.order - b.order).map((l) => l.id)).toEqual(["lane-b", "lane-a", "sep"]);
  });

  it("returns the same reference when a move would go past either end", () => {
    const data = baseData();
    expect(moveSwimlaneOp(data, "lane-a", -1)).toBe(data);
  });
});

describe("setLaneColorOp / setRagOverrideOp", () => {
  it("sets a lane's color", () => {
    const next = setLaneColorOp(baseData(), "lane-a", "#123456");
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.color).toBe("#123456");
  });

  it("sets a rag override", () => {
    const next = setRagOverrideOp(baseData(), "lane-a", "red");
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.ragOverride).toBe("red");
  });

  it("'auto' clears the override", () => {
    const withOverride = setRagOverrideOp(baseData(), "lane-a", "red");
    const next = setRagOverrideOp(withOverride, "lane-a", "auto");
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.ragOverride).toBeUndefined();
  });

  it("sets a lane's density", () => {
    const next = setLaneDensityOp(baseData(), "lane-a", "lean");
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.density).toBe("lean");
    expect(next.swimlanes.find((l) => l.id === "lane-b")!.density).toBeUndefined();
  });

  it("switches a lane back to normal", () => {
    const lean = setLaneDensityOp(baseData(), "lane-a", "lean");
    const next = setLaneDensityOp(lean, "lane-a", "normal");
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.density).toBe("normal");
  });
});

describe("resolveNamedLaneColor", () => {
  it("resolves every curated name to a distinct real hex value", () => {
    const names = ["red", "amber", "green", "blue", "purple", "gray"] as const;
    const hexes = names.map(resolveNamedLaneColor);
    expect(hexes.every((h) => /^#[0-9a-f]{6}$/.test(h))).toBe(true);
    expect(new Set(hexes).size).toBe(names.length);
  });
});

describe("applyDeletes", () => {
  it("folds a mixed batch of milestone/topLevelItem/swimlane deletes over the document", () => {
    const deletes: DeleteOp[] = [
      { targetId: "t1", entityType: "topLevelItem", reason: "r" },
      { targetId: "sep", entityType: "swimlane", reason: "r" },
    ];
    const next = applyDeletes(baseData(), deletes);
    expect(next.topLevelItems).toHaveLength(0);
    expect(next.swimlanes.map((l) => l.id)).toEqual(["lane-a", "lane-b"]);
    expect(next.milestones).toHaveLength(2);
  });
});

describe("applySwimlaneOps", () => {
  it("applies add/rename/reorder/recolor/ragOverride in order", () => {
    const ops: { op: SwimlaneOp; newId: string }[] = [
      { op: { kind: "add", swimlaneType: "lane", name: "Charlie", reason: "r" }, newId: "lane-c" },
      { op: { kind: "rename", targetId: "lane-a", name: "Renamed", reason: "r" }, newId: "" },
      { op: { kind: "reorder", targetId: "lane-b", delta: -1, reason: "r" }, newId: "" },
      { op: { kind: "recolor", targetId: "lane-a", color: "blue", reason: "r" }, newId: "" },
      { op: { kind: "ragOverride", targetId: "lane-a", rag: "amber", reason: "r" }, newId: "" },
    ];
    const next = applySwimlaneOps(baseData(), ops);
    expect(next.swimlanes.find((l) => l.id === "lane-c")).toBeDefined();
    const laneA = next.swimlanes.find((l) => l.id === "lane-a")!;
    expect(laneA.name).toBe("Renamed");
    expect(laneA.color).toBe(resolveNamedLaneColor("blue"));
    expect(laneA.ragOverride).toBe("amber");
    expect([...next.swimlanes].sort((a, b) => a.order - b.order)[0].id).toBe("lane-b");
  });
});
