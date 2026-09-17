import { describe, expect, it } from "vitest";
import type { Milestone, Program } from "@/components/timeline/types";
import {
  addSwimlaneGroupOp,
  addSwimlaneOp,
  applyDeletes,
  applySwimlaneOps,
  moveSwimlaneGroupOp,
  moveSwimlaneOp,
  removeMilestoneOp,
  removeSwimlaneGroupOp,
  removeSwimlaneOp,
  removeTopLevelItemOp,
  renameSwimlaneGroupOp,
  renameSwimlaneOp,
  resolveNamedLaneColor,
  setLaneColorOp,
  setLaneDensityOp,
  setLaneHiddenOp,
  setRagOverrideOp,
  setSwimlaneGroupColorOp,
  setSwimlaneGroupCollapsedOp,
  setSwimlaneGroupIdOp,
  setSwimlaneGroupParentIdOp,
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
    ...overrides,
  };
}

function baseData(): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
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

/**
 * Top-level order space: lane-a(0), g1(1), g2(2). g1's members are
 * lane-x(0)/lane-y(1); g2's sole member is lane-z(0) — each group's member
 * `order` is scoped to its own siblings, deliberately overlapping with the
 * other group's and with the top-level space, to prove moves stay scoped.
 */
function groupedData(): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "P",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "o",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [
      { id: "lane-a", order: 0, type: "lane", name: "Alpha" },
      { id: "lane-x", order: 0, type: "lane", name: "Xray", groupId: "g1" },
      { id: "lane-y", order: 1, type: "lane", name: "Yankee", groupId: "g1" },
      { id: "lane-z", order: 0, type: "lane", name: "Zulu", groupId: "g2" },
    ],
    swimlaneGroups: [
      { id: "g1", order: 1, name: "Group 1" },
      { id: "g2", order: 2, name: "Group 2" },
    ],
    topLevelItems: [],
    milestones: [milestone("x1", "lane-x")],
  };
}

/**
 * t26: one top-level group (g1) that itself nests two child groups (g1a,
 * g1b) alongside two member lanes (lane-x, lane-y) — all four sharing one
 * order space scoped to g1, mirroring topLevelEntries' own lane+group order
 * space one level up. g1a has its own single member lane (lane-p). g2 is a
 * second top-level group with no nesting, and lane-a is a plain top-level
 * ungrouped lane — both exist to prove a nested group's move never touches
 * anything outside its own parent's scope, and a top-level group's move
 * never touches anything inside a nested scope.
 */
function nestedGroupedData(): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "P",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "o",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [
      { id: "lane-a", order: 0, type: "lane", name: "Alpha" },
      { id: "lane-x", order: 0, type: "lane", name: "Xray", groupId: "g1" },
      { id: "lane-y", order: 1, type: "lane", name: "Yankee", groupId: "g1" },
      { id: "lane-p", order: 0, type: "lane", name: "Papa", groupId: "g1a" },
      { id: "lane-z", order: 0, type: "lane", name: "Zulu", groupId: "g2" },
    ],
    swimlaneGroups: [
      { id: "g1", order: 1, name: "Group 1" },
      { id: "g1a", order: 2, name: "Group 1a", parentGroupId: "g1" },
      { id: "g1b", order: 3, name: "Group 1b", parentGroupId: "g1" },
      { id: "g2", order: 2, name: "Group 2" },
    ],
    topLevelItems: [],
    milestones: [],
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

  it("sets a lane's hidden flag", () => {
    const next = setLaneHiddenOp(baseData(), "lane-a", true);
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.hidden).toBe(true);
    expect(next.swimlanes.find((l) => l.id === "lane-b")!.hidden).toBeUndefined();
  });

  it("un-hides a lane", () => {
    const hidden = setLaneHiddenOp(baseData(), "lane-a", true);
    const next = setLaneHiddenOp(hidden, "lane-a", false);
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.hidden).toBe(false);
  });
});

describe("addSwimlaneGroupOp / renameSwimlaneGroupOp / setSwimlaneGroupColorOp / setSwimlaneGroupCollapsedOp", () => {
  it("appends a new group at the end of the top-level order space (zero-group document)", () => {
    // baseData's swimlanes top out at order 2 (the "sep" row) and there are no groups yet.
    const next = addSwimlaneGroupOp(baseData(), "New group", "g-new");
    expect(next.swimlaneGroups).toEqual([{ id: "g-new", order: 3, name: "New group" }]);
  });

  it("appends past both existing groups' and grouped lanes' orders (already-grouped document)", () => {
    // groupedData's swimlane orders top out at 1 (lane-y, inside g1) and group orders top out at 2 (g2).
    const next = addSwimlaneGroupOp(groupedData(), "Group 3", "g3");
    expect(next.swimlaneGroups!.at(-1)).toEqual({ id: "g3", order: 3, name: "Group 3" });
    // Existing groups/lanes untouched.
    expect(next.swimlaneGroups!.slice(0, 2)).toEqual(groupedData().swimlaneGroups);
    expect(next.swimlanes).toEqual(groupedData().swimlanes);
  });

  it("renames without touching anything else", () => {
    const next = renameSwimlaneGroupOp(groupedData(), "g1", "Renamed");
    expect(next.swimlaneGroups!.find((g) => g.id === "g1")!.name).toBe("Renamed");
    expect(next.swimlaneGroups!.find((g) => g.id === "g2")).toEqual(groupedData().swimlaneGroups![1]);
  });

  it("sets and clears a group's color", () => {
    const colored = setSwimlaneGroupColorOp(groupedData(), "g1", "#123456");
    expect(colored.swimlaneGroups!.find((g) => g.id === "g1")!.color).toBe("#123456");
    const cleared = setSwimlaneGroupColorOp(colored, "g1", undefined);
    expect(cleared.swimlaneGroups!.find((g) => g.id === "g1")!.color).toBeUndefined();
  });

  it("collapses and expands a group", () => {
    const collapsed = setSwimlaneGroupCollapsedOp(groupedData(), "g1", true);
    expect(collapsed.swimlaneGroups!.find((g) => g.id === "g1")!.collapsed).toBe(true);
    const expanded = setSwimlaneGroupCollapsedOp(collapsed, "g1", false);
    expect(expanded.swimlaneGroups!.find((g) => g.id === "g1")!.collapsed).toBe(false);
  });
});

describe("removeSwimlaneGroupOp", () => {
  it("ungroups (not deletes) its member lanes, and never touches their milestones", () => {
    const next = removeSwimlaneGroupOp(groupedData(), "g1");
    expect(next.swimlaneGroups!.map((g) => g.id)).toEqual(["g2"]);
    // Members survive, ungrouped.
    expect(next.swimlanes.find((l) => l.id === "lane-x")!.groupId).toBeUndefined();
    expect(next.swimlanes.find((l) => l.id === "lane-y")!.groupId).toBeUndefined();
    // A lane in the OTHER group, and the ungrouped lane, are untouched.
    expect(next.swimlanes.find((l) => l.id === "lane-z")).toEqual(groupedData().swimlanes[3]);
    expect(next.swimlanes.find((l) => l.id === "lane-a")).toEqual(groupedData().swimlanes[0]);
    // No milestone or dependency cleanup — that's a lane-deletion concern, not a group-removal one.
    expect(next.milestones).toEqual(groupedData().milestones);
  });

  it("gives the orphaned lanes valid, non-colliding top-level orders", () => {
    const next = removeSwimlaneGroupOp(groupedData(), "g1");
    const x = next.swimlanes.find((l) => l.id === "lane-x")!;
    const y = next.swimlanes.find((l) => l.id === "lane-y")!;
    // Top-level order space before removal tops out at 2 (g2) — the orphans
    // must land strictly above every existing top-level order, and not collide with each other.
    expect(x.order).toBeGreaterThan(2);
    expect(y.order).toBeGreaterThan(2);
    expect(x.order).not.toBe(y.order);
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.order).toBe(0);
  });
});

describe("moveSwimlaneGroupOp", () => {
  it("swaps two top-level peers without touching grouped-lane orders", () => {
    const data = groupedData();
    // Top-level order: lane-a(0), g1(1), g2(2) — move g1 up past lane-a.
    const next = moveSwimlaneGroupOp(data, "g1", -1);
    expect(next.swimlaneGroups!.find((g) => g.id === "g1")!.order).toBe(0);
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.order).toBe(1);
    expect(next.swimlaneGroups!.find((g) => g.id === "g2")!.order).toBe(2);
    // g1's own members (scoped order space) are provably untouched.
    expect(next.swimlanes.find((l) => l.id === "lane-x")).toEqual(data.swimlanes[1]);
    expect(next.swimlanes.find((l) => l.id === "lane-y")).toEqual(data.swimlanes[2]);
    // g2's member likewise untouched.
    expect(next.swimlanes.find((l) => l.id === "lane-z")).toEqual(data.swimlanes[3]);
  });

  it("no-ops (same reference) at the top-level boundary", () => {
    const data = groupedData();
    expect(moveSwimlaneGroupOp(data, "g2", 1)).toBe(data);
  });

  it("no-ops (same reference) for an unknown id", () => {
    const data = groupedData();
    expect(moveSwimlaneGroupOp(data, "does-not-exist", 1)).toBe(data);
  });
});

describe("moveSwimlaneGroupOp (t26 generalization: nested groups)", () => {
  it("a nested group's ▲/▼ swaps only among its own parent's other children, never among the top-level list", () => {
    const data = nestedGroupedData();
    // g1's own scope: lane-x(0), lane-y(1), g1a(2), g1b(3) — move g1a up past lane-y.
    const next = moveSwimlaneGroupOp(data, "g1a", -1);
    expect(next.swimlaneGroups!.find((g) => g.id === "g1a")!.order).toBe(1);
    expect(next.swimlanes.find((l) => l.id === "lane-y")!.order).toBe(2);
    expect(next.swimlanes.find((l) => l.id === "lane-x")!.order).toBe(0);
    expect(next.swimlaneGroups!.find((g) => g.id === "g1b")!.order).toBe(3);
    // The top-level list (lane-a, g1, g2) is provably untouched by a nested move.
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.order).toBe(0);
    expect(next.swimlaneGroups!.find((g) => g.id === "g1")!.order).toBe(1);
    expect(next.swimlaneGroups!.find((g) => g.id === "g2")!.order).toBe(2);
    // Unrelated nested/sibling entries are untouched too.
    expect(next.swimlanes.find((l) => l.id === "lane-p")).toEqual(data.swimlanes.find((l) => l.id === "lane-p"));
    expect(next.swimlanes.find((l) => l.id === "lane-z")).toEqual(data.swimlanes.find((l) => l.id === "lane-z"));
  });

  it("a real top-level group's ▲/▼ is unaffected by the existence of nested groups elsewhere in the document", () => {
    const data = nestedGroupedData();
    // Top-level order: lane-a(0), g1(1), g2(2) — move g2 up past g1.
    const next = moveSwimlaneGroupOp(data, "g2", -1);
    expect(next.swimlaneGroups!.find((g) => g.id === "g2")!.order).toBe(1);
    expect(next.swimlaneGroups!.find((g) => g.id === "g1")!.order).toBe(2);
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.order).toBe(0);
    // g1's own nested scope (members + child groups) is provably untouched by a top-level swap.
    expect(next.swimlanes.find((l) => l.id === "lane-x")).toEqual(data.swimlanes.find((l) => l.id === "lane-x"));
    expect(next.swimlanes.find((l) => l.id === "lane-y")).toEqual(data.swimlanes.find((l) => l.id === "lane-y"));
    expect(next.swimlaneGroups!.find((g) => g.id === "g1a")).toEqual(data.swimlaneGroups!.find((g) => g.id === "g1a"));
    expect(next.swimlaneGroups!.find((g) => g.id === "g1b")).toEqual(data.swimlaneGroups!.find((g) => g.id === "g1b"));
    // g2's own member is untouched.
    expect(next.swimlanes.find((l) => l.id === "lane-z")).toEqual(data.swimlanes.find((l) => l.id === "lane-z"));
  });

  it("a zero-nested-group document (groupedData) behaves byte-identically to the pre-t26 flat implementation", () => {
    // Same assertions as the "moveSwimlaneGroupOp" describe block above,
    // repeated here to pin down that the t26 generalization doesn't change
    // any existing, already-tested behavior for a document with no real
    // parentGroupId anywhere.
    const data = groupedData();
    const next = moveSwimlaneGroupOp(data, "g1", -1);
    expect(next.swimlaneGroups!.find((g) => g.id === "g1")!.order).toBe(0);
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.order).toBe(1);
    expect(next.swimlaneGroups!.find((g) => g.id === "g2")!.order).toBe(2);
    expect(moveSwimlaneGroupOp(data, "g2", 1)).toBe(data);
    expect(moveSwimlaneGroupOp(data, "does-not-exist", 1)).toBe(data);
  });
});

describe("moveSwimlaneOp (t21 generalization)", () => {
  it("on a grouped lane, reorders only within that group's siblings", () => {
    const data = groupedData();
    // g1's members: lane-x(0), lane-y(1) — move lane-y up.
    const next = moveSwimlaneOp(data, "lane-y", -1);
    expect(next.swimlanes.find((l) => l.id === "lane-y")!.order).toBe(0);
    expect(next.swimlanes.find((l) => l.id === "lane-x")!.order).toBe(1);
    // A lane in a DIFFERENT group is provably unaffected.
    expect(next.swimlanes.find((l) => l.id === "lane-z")).toEqual(data.swimlanes[3]);
    // An ungrouped lane is provably unaffected.
    expect(next.swimlanes.find((l) => l.id === "lane-a")).toEqual(data.swimlanes[0]);
    // Groups themselves (and their orders) are untouched by an in-group move.
    expect(next.swimlaneGroups).toBe(data.swimlaneGroups);
  });

  it("on an ungrouped lane, treats groups as opaque top-level peers", () => {
    const data = groupedData();
    // Top-level order: lane-a(0), g1(1), g2(2) — move lane-a down past g1.
    const next = moveSwimlaneOp(data, "lane-a", 1);
    expect(next.swimlanes.find((l) => l.id === "lane-a")!.order).toBe(1);
    expect(next.swimlaneGroups!.find((g) => g.id === "g1")!.order).toBe(0);
    // g1's members are provably untouched by the swap crossing over the group.
    expect(next.swimlanes.find((l) => l.id === "lane-x")).toEqual(data.swimlanes[1]);
    expect(next.swimlanes.find((l) => l.id === "lane-y")).toEqual(data.swimlanes[2]);
    expect(next.swimlanes.find((l) => l.id === "lane-z")).toEqual(data.swimlanes[3]);
  });

  it("zero-group documents keep the exact pre-t21 behavior (regression guard)", () => {
    const next = moveSwimlaneOp(baseData(), "lane-b", -1);
    expect([...next.swimlanes].sort((a, b) => a.order - b.order).map((l) => l.id)).toEqual(["lane-b", "lane-a", "sep"]);
    // No swimlaneGroups key is introduced where none existed before.
    expect(next.swimlaneGroups).toBeUndefined();
  });
});

describe("setSwimlaneGroupIdOp", () => {
  it("moves a lane into a different group, landing after that group's existing members", () => {
    const next = setSwimlaneGroupIdOp(groupedData(), "lane-z", "g1");
    const moved = next.swimlanes.find((l) => l.id === "lane-z")!;
    expect(moved.groupId).toBe("g1");
    expect(moved.order).toBe(2); // after lane-x(0)/lane-y(1)
  });

  it("moves a lane into an empty group at order 0", () => {
    const withG3 = addSwimlaneGroupOp(groupedData(), "Group 3", "g3");
    const next = setSwimlaneGroupIdOp(withG3, "lane-a", "g3");
    expect(next.swimlanes.find((l) => l.id === "lane-a")).toMatchObject({ groupId: "g3", order: 0 });
  });

  it("ungroups a lane into the top-level order space with no collision", () => {
    const data = groupedData();
    const next = setSwimlaneGroupIdOp(data, "lane-x", undefined);
    const moved = next.swimlanes.find((l) => l.id === "lane-x")!;
    expect(moved.groupId).toBeUndefined();
    expect(moved.order).toBeGreaterThan(2); // strictly past every existing top-level order (g2's order 2)
    // The other g1 member is untouched.
    expect(next.swimlanes.find((l) => l.id === "lane-y")).toEqual(data.swimlanes[2]);
  });

  it("no-ops for an unknown lane id", () => {
    const data = groupedData();
    expect(setSwimlaneGroupIdOp(data, "does-not-exist", "g1")).toBe(data);
  });

  it("no-ops for a groupId that doesn't resolve to a real group", () => {
    const data = groupedData();
    expect(setSwimlaneGroupIdOp(data, "lane-a", "not-a-real-group")).toBe(data);
  });
});

describe("setSwimlaneGroupParentIdOp", () => {
  it("legally reparents a top-level group under another group, landing after that scope's existing children", () => {
    // groupedData: g1's own scope has lane-x(0)/lane-y(1), no child groups yet.
    const next = setSwimlaneGroupParentIdOp(groupedData(), "g2", "g1");
    const moved = next.swimlaneGroups!.find((g) => g.id === "g2")!;
    expect(moved.parentGroupId).toBe("g1");
    expect(moved.order).toBe(2); // after lane-x(0)/lane-y(1)
    // g1 and g1's existing members are untouched.
    expect(next.swimlaneGroups!.find((g) => g.id === "g1")).toEqual(groupedData().swimlaneGroups![0]);
    expect(next.swimlanes.find((l) => l.id === "lane-x")).toEqual(groupedData().swimlanes[1]);
  });

  it("legally reparents a nested group back to top-level (newParentGroupId undefined)", () => {
    const data = nestedGroupedData();
    const next = setSwimlaneGroupParentIdOp(data, "g1a", undefined);
    const moved = next.swimlaneGroups!.find((g) => g.id === "g1a")!;
    expect(moved.parentGroupId).toBeUndefined();
    // Lands strictly above every existing top-level order (g2's order 2).
    expect(moved.order).toBeGreaterThan(2);
    // g1b, g1's other nested child, is untouched.
    expect(next.swimlaneGroups!.find((g) => g.id === "g1b")).toEqual(data.swimlaneGroups!.find((g) => g.id === "g1b"));
  });

  it("rejects a cycle — moving a group under its own descendant", () => {
    const data = nestedGroupedData();
    // g1a's parent is g1 — making g1a the parent of g1 would close a cycle.
    expect(setSwimlaneGroupParentIdOp(data, "g1", "g1a")).toBe(data);
  });

  it("rejects reparenting a group under itself", () => {
    const data = nestedGroupedData();
    expect(setSwimlaneGroupParentIdOp(data, "g1", "g1")).toBe(data);
  });

  it("no-ops for a nonexistent groupId", () => {
    const data = groupedData();
    expect(setSwimlaneGroupParentIdOp(data, "does-not-exist", "g1")).toBe(data);
  });

  it("no-ops for a newParentGroupId that doesn't resolve to a real group", () => {
    const data = groupedData();
    expect(setSwimlaneGroupParentIdOp(data, "g1", "not-a-real-group")).toBe(data);
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
