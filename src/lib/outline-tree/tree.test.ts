import { describe, expect, it } from "vitest";
import type { Milestone, Program } from "@/components/timeline/types";
import { buildMultiProgramOutlineTree, buildOutlineTree, canReparentGroupOrLane, canReparentLeaf, canToggleCollapsed, canToggleHidden, descendantLeafIds, type OutlineNode } from "./tree";

function milestone(id: string, laneId: string, overrides: Partial<Milestone> = {}): Milestone {
  return { id, laneId, title: id, date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, ...overrides };
}

/**
 * Mirrors the prototype's "Atlas Platform" fixture (prototypes/outline-tree-106.html)
 * adapted to this repo's real types: a grouped pair of lanes (Backend/Data
 * under "Core Platform"), one ungrouped lane (Design), a two-row Backend
 * lane (m1 on Row 1, m2 on Row 2), one Program-band phase (p1, no laneId at
 * all) and one Program-band annotation (a1) — added for wayframe#t33 to
 * cover the one Program-band kind that stays non-selectable even after this
 * ticket's generalization.
 */
function atlasProgram(): Program {
  return {
    id: "atlas",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Atlas Platform",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "o",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [
      { id: "lane-be", order: 0, type: "lane", name: "Backend", groupId: "g-core" },
      { id: "lane-data", order: 1, type: "lane", name: "Data", groupId: "g-core" },
      { id: "lane-design", order: 1, type: "lane", name: "Design" },
    ],
    swimlaneGroups: [{ id: "g-core", order: 0, name: "Core Platform" }],
    topLevelItems: [
      { id: "p1", type: "phase", title: "Design system v2", startDate: "2026-01-01", endDate: "2026-02-01", status: "not-started" },
      { id: "a1", type: "annotation", title: "Board review", date: "2026-01-15", message: "Checkpoint" },
    ],
    milestones: [
      milestone("m1", "lane-be", { laneRow: 1 }),
      milestone("m2", "lane-be", { laneRow: 2, date: "2026-02-01" }),
      milestone("m3", "lane-data"),
    ],
  };
}

function findNode(nodes: OutlineNode[], id: string): OutlineNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return undefined;
}

describe("buildOutlineTree", () => {
  it("builds Program -> Group -> Lane -> Row -> leaf, with Program-band items appended under the Program", () => {
    const [root] = buildOutlineTree(atlasProgram(), new Set());
    expect(root.kind).toBe("program");
    expect(root.id).toBe("atlas");

    const group = findNode([root], "g-core")!;
    expect(group.kind).toBe("group");
    const laneBe = findNode([group], "lane-be")!;
    expect(laneBe.kind).toBe("lane");
    expect(laneBe.children.map((r) => r.kind)).toEqual(["row", "row"]); // Row 1 and Row 2

    const laneDesign = findNode([root], "lane-design")!;
    expect(laneDesign.kind).toBe("lane");
    expect(laneDesign.depth).toBe(1); // ungrouped lane sits directly under the Program, same depth as g-core

    // Program-band phase has no lane to live inside — appears directly under the Program root.
    const phase = findNode([root], "p1")!;
    expect(phase.kind).toBe("phase");
    expect(phase.depth).toBe(1);
  });

  it("scenario 1 — clicking a leaf toggles its selected flag, reading straight off the shared selectedIds set", () => {
    const selected = new Set(["m1"]);
    const [root] = buildOutlineTree(atlasProgram(), selected);
    const m1 = findNode([root], "m1")!;
    const m2 = findNode([root], "m2")!;
    expect(m1.selectable).toBe(true);
    expect(m1.selected).toBe(true);
    expect(m2.selected).toBe(false);
  });

  it("wayframe#t33 — a Program-band 'phase'/'milestone' TopLevelItem leaf is now selectable (no laneId needed for selection); an 'annotation' leaf never is", () => {
    const selected = new Set(["p1"]);
    const [root] = buildOutlineTree(atlasProgram(), selected);

    const phase = findNode([root], "p1")!;
    expect(phase.selectable).toBe(true);
    expect(phase.selected).toBe(true);
    // laneAddressable stays false regardless — no laneId concept applies to a Program-band item, selectable or not.
    expect(phase.laneAddressable).toBe(false);

    const annotation = findNode([root], "a1")!;
    expect(annotation.selectable).toBe(false);
    expect(annotation.selected).toBe(false); // never true even if its id were (wrongly) in selectedIds — see buildTopLevelLeaf
    expect(annotation.laneAddressable).toBe(false);
  });
});

describe("descendantLeafIds", () => {
  it("scenario 2 — select-all-in-a-lane returns every selectable leaf id under it", () => {
    const [root] = buildOutlineTree(atlasProgram(), new Set());
    const laneBe = findNode([root], "lane-be")!;
    expect(new Set(descendantLeafIds(laneBe))).toEqual(new Set(["m1", "m2"]));
  });

  it("wayframe#t33 — select-all on the Program root includes every lane-scoped leaf AND the Program-band phase, but never the annotation", () => {
    const [root] = buildOutlineTree(atlasProgram(), new Set());
    expect(new Set(descendantLeafIds(root))).toEqual(new Set(["m1", "m2", "m3", "p1"]));
  });
});

describe("canReparentGroupOrLane / canReparentLeaf", () => {
  it("scenario 3 — legal reparent: an ungrouped lane can move into a real group", () => {
    const program = atlasProgram();
    expect(canReparentGroupOrLane(program, { kind: "lane", id: "lane-design" }, "g-core")).toEqual({ ok: true });
  });

  it("legal reparent: a lane can move to the Program itself (ungroup to top-level)", () => {
    const program = atlasProgram();
    expect(canReparentGroupOrLane(program, { kind: "lane", id: "lane-be" }, program.id)).toEqual({ ok: true });
  });

  it("scenario 4 — illegal reparent: a group can't move under itself", () => {
    const program = atlasProgram();
    const check = canReparentGroupOrLane(program, { kind: "group", id: "g-core" }, "g-core");
    expect(check.ok).toBe(false);
  });

  it("illegal reparent: a group can't move onto a nonexistent target", () => {
    const program = atlasProgram();
    const check = canReparentGroupOrLane(program, { kind: "group", id: "g-core" }, "not-a-real-group");
    expect(check.ok).toBe(false);
  });

  it("illegal reparent: a group can't move under its own descendant (cycle)", () => {
    const program = atlasProgram();
    program.swimlaneGroups!.push({ id: "g-nested", order: 1, name: "Nested", parentGroupId: "g-core" });
    const check = canReparentGroupOrLane(program, { kind: "group", id: "g-core" }, "g-nested");
    expect(check.ok).toBe(false);
  });

  it("legal reparent: a lane-scoped Milestone can move onto a different real Lane", () => {
    const program = atlasProgram();
    expect(canReparentLeaf(program, "m1", "lane-data")).toEqual({ ok: true });
  });

  it("illegal reparent: a Program-band leaf (no laneId at all) can never move onto a Lane", () => {
    const program = atlasProgram();
    const check = canReparentLeaf(program, "p1", "lane-data");
    expect(check.ok).toBe(false);
  });

  it("illegal reparent: a Milestone can't move onto a nonexistent lane", () => {
    const program = atlasProgram();
    const check = canReparentLeaf(program, "m1", "not-a-real-lane");
    expect(check.ok).toBe(false);
  });
});

describe("canToggleHidden / canToggleCollapsed (scenario 5 — hide vs. collapse aren't interchangeable)", () => {
  it("Hide is legal only on a lane", () => {
    expect(canToggleHidden("lane").ok).toBe(true);
    expect(canToggleHidden("group").ok).toBe(false);
    expect(canToggleHidden("program").ok).toBe(false);
    expect(canToggleHidden("milestone").ok).toBe(false);
  });

  it("Collapse is legal only on a group", () => {
    expect(canToggleCollapsed("group").ok).toBe(true);
    expect(canToggleCollapsed("lane").ok).toBe(false);
    // Narrowed from the prototype's "program or group": this repo's real
    // Program has no `collapsed` field at all (see tree.ts's own doc).
    expect(canToggleCollapsed("program").ok).toBe(false);
  });
});

describe("buildMultiProgramOutlineTree", () => {
  it("returns one Program root per Program, sorted by order, ids left un-namespaced", () => {
    const atlas = atlasProgram();
    const comet: Program = { ...atlasProgram(), id: "comet", programName: "Comet Mobile", order: 1, swimlaneGroups: [], swimlanes: [], topLevelItems: [], milestones: [] };
    const portfolio = { id: "portfolio-1", schemaVersion: 1 };
    const roots = buildMultiProgramOutlineTree([comet, atlas], portfolio);
    expect(roots.map((r) => r.id)).toEqual(["atlas", "comet"]); // order-sorted, not input-array order
    // ids are the Program's own real ids — never namespaced (that's merge-programs.ts's concern, not this one).
    expect(findNode(roots, "lane-be")).toBeDefined();
    expect(findNode(roots, "atlas::__program__")).toBeUndefined();
  });
});
