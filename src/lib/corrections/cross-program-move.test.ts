import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Milestone, Program } from "@/components/timeline/types";
import { planMilestoneMove, planSwimlaneMove } from "./cross-program-move";

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

function baseProgram(id: string, overrides: Partial<Program> = {}): Program {
  return {
    id,
    portfolioId: "portfolio-1",
    order: 0,
    programName: id,
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "o",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

/**
 * lane-a: m1 (no deps), m2 (depends on m1, linksToTopLevelMilestone t1).
 * lane-b: m3 (depends on m1 — a cross-lane dependency that survives a plain
 * milestone move but is dropped/reported by a swimlane move that takes m1
 * along and leaves m3 behind).
 */
function sourceProgram(): Program {
  return baseProgram("prog-source", {
    swimlanes: [
      { id: "lane-a", order: 0, type: "lane", name: "Alpha" },
      { id: "lane-b", order: 1, type: "lane", name: "Bravo" },
    ],
    topLevelItems: [{ id: "t1", type: "milestone", title: "Kickoff", date: "2026-01-01", status: "not-started" }],
    milestones: [
      milestone("m1", "lane-a", { rev: 5 }),
      milestone("m2", "lane-a", { dependsOn: [{ id: "m1", showConnector: true }], linksToTopLevelMilestone: "t1" }),
      milestone("m3", "lane-b", { dependsOn: [{ id: "m1", showConnector: true }] }),
    ],
  });
}

function destProgram(): Program {
  return baseProgram("prog-dest", { swimlanes: [{ id: "lane-x", order: 0, type: "lane", name: "Xray" }] });
}

describe("planMilestoneMove", () => {
  it("returns null when the milestone id doesn't resolve in source", () => {
    expect(planMilestoneMove(sourceProgram(), destProgram(), "nope", "lane-x", "new-id")).toBeNull();
  });

  it("returns null for a same-Program call — the caller must use setMilestoneLane instead", () => {
    const p = sourceProgram();
    expect(planMilestoneMove(p, p, "m1", "lane-b", "new-id")).toBeNull();
  });

  it("clones the milestone under the new id into the destination lane, dropping cross-Program state", () => {
    const source = sourceProgram();
    const dest = destProgram();
    const plan = planMilestoneMove(source, dest, "m2", "lane-x", "new-m2")!;
    expect(plan).not.toBeNull();

    expect(plan.clonedMilestone).toEqual(
      milestone("new-m2", "lane-x", {
        title: "m2",
        dependsOn: [],
        linksToTopLevelMilestone: null,
      }),
    );
    expect(plan.destNext.milestones).toEqual([plan.clonedMilestone]);
    expect(plan.droppedDependsOn).toEqual([{ milestoneId: "m2", predecessorId: "m1" }]);
    expect(plan.clearedTopLevelLinks).toEqual(["m2"]);
  });

  it("removes the milestone from source and strips dangling dependsOn edges left pointing at it (removeMilestoneOp reuse)", () => {
    const source = sourceProgram();
    const plan = planMilestoneMove(source, destProgram(), "m1", "lane-x", "new-m1")!;
    const ids = plan.sourceNext.milestones.map((m) => m.id);
    expect(ids).toEqual(["m2", "m3"]);
    // m2 and m3 both depended on m1 — the now-doomed id — so both edges are stripped source-side.
    expect(plan.sourceNext.milestones.find((m) => m.id === "m2")!.dependsOn).toEqual([]);
    expect(plan.sourceNext.milestones.find((m) => m.id === "m3")!.dependsOn).toEqual([]);
  });

  it("resets rev on the clone but preserves originalDate/categoryId", () => {
    const source = sourceProgram();
    source.milestones[0] = { ...source.milestones[0], originalDate: "2025-12-01", categoryId: "cat-1" };
    const plan = planMilestoneMove(source, destProgram(), "m1", "lane-x", "new-m1")!;
    expect(plan.clonedMilestone.rev).toBeUndefined();
    expect(plan.clonedMilestone.originalDate).toBe("2025-12-01");
    expect(plan.clonedMilestone.categoryId).toBe("cat-1");
  });
});

describe("planSwimlaneMove", () => {
  it("returns null when the lane id doesn't resolve in source", () => {
    expect(planSwimlaneMove(sourceProgram(), destProgram(), "nope", { lane: "l", milestones: {} })).toBeNull();
  });

  it("returns null for a same-Program call", () => {
    const p = sourceProgram();
    expect(planSwimlaneMove(p, p, "lane-a", { lane: "l", milestones: { m1: "x", m2: "y" } })).toBeNull();
  });

  it("returns null when newIds.milestones is missing an entry for one of the lane's own milestones", () => {
    expect(planSwimlaneMove(sourceProgram(), destProgram(), "lane-a", { lane: "new-lane-a", milestones: { m1: "new-m1" } })).toBeNull();
  });

  it("clones the lane and its milestones with remapped internal edges, dropping/reporting external ones", () => {
    const source = sourceProgram();
    const dest = destProgram();
    const plan = planSwimlaneMove(source, dest, "lane-a", { lane: "new-lane-a", milestones: { m1: "new-m1", m2: "new-m2" } })!;
    expect(plan).not.toBeNull();

    // dest already has lane-x at order 0, so the arriving lane lands at order 1 — same "append at the end" placement addSwimlaneOp uses.
    expect(plan.clonedSwimlane).toEqual({ id: "new-lane-a", order: 1, type: "lane", name: "Alpha", groupId: undefined });
    expect(plan.idMap).toEqual({ "lane-a": "new-lane-a", m1: "new-m1", m2: "new-m2" });

    const byId = Object.fromEntries(plan.clonedMilestones.map((m) => [m.id, m]));
    expect(byId["new-m1"]).toEqual(milestone("new-m1", "new-lane-a", { title: "m1" }));
    expect(byId["new-m2"]).toEqual(
      milestone("new-m2", "new-lane-a", { title: "m2", dependsOn: [{ id: "new-m1", showConnector: true }], linksToTopLevelMilestone: null }),
    );

    // m3 (lane-b, staying in source) depended on m1 (moved) — an external edge, dropped and reported, never remapped.
    expect(plan.droppedDependsOn).toEqual([{ milestoneId: "m3", predecessorId: "m1" }]);
    expect(plan.clearedTopLevelLinks).toEqual(["m2"]);
  });

  it("removes the lane and its milestones from source via removeSwimlaneOp, renumbering remaining lanes", () => {
    const plan = planSwimlaneMove(sourceProgram(), destProgram(), "lane-a", { lane: "new-lane-a", milestones: { m1: "new-m1", m2: "new-m2" } })!;
    expect(plan.sourceNext.swimlanes).toEqual([{ id: "lane-b", order: 0, type: "lane", name: "Bravo" }]);
    expect(plan.sourceNext.milestones.map((m) => m.id)).toEqual(["m3"]);
    // m3 stayed, but its edge onto the now-doomed m1 is stripped source-side too.
    expect(plan.sourceNext.milestones[0].dependsOn).toEqual([]);
  });

  it("drops groupId — the destination Program's SwimlaneGroups are a different id space", () => {
    const source = sourceProgram();
    source.swimlanes[0] = { ...source.swimlanes[0], groupId: "g1" };
    source.swimlaneGroups = [{ id: "g1", order: 0, name: "Group 1" }];
    const plan = planSwimlaneMove(source, destProgram(), "lane-a", { lane: "new-lane-a", milestones: { m1: "new-m1", m2: "new-m2" } })!;
    expect(plan.clonedSwimlane.groupId).toBeUndefined();
  });
});

// Property test (wayframe#124's own test plan): for any randomly-generated
// dependency graph split across two lanes, moving one lane never loses a
// milestone and never leaves a dependsOn edge dangling on either side.
describe("planSwimlaneMove (property)", () => {
  it("preserves every milestone exactly once and leaves no dangling dependsOn edge", () => {
    const idsArb = fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,4}$/), { minLength: 2, maxLength: 8 });

    fc.assert(
      fc.property(idsArb, fc.integer({ min: 0, max: 2 ** 31 - 1 }), (ids, seed) => {
        // Deterministic pseudo-random split/edges from `seed` — fast-check
        // shrinks on `ids`/`seed` themselves, no separate PRNG dependency needed.
        let state = seed;
        const rand = () => {
          state = (state * 1103515245 + 12345) & 0x7fffffff;
          return state / 0x7fffffff;
        };

        const laneOf = new Map(ids.map((id) => [id, rand() < 0.5 ? "lane-a" : "lane-b"]));
        // Ensure lane-a is never empty so the move itself is meaningful.
        if (![...laneOf.values()].includes("lane-a")) laneOf.set(ids[0], "lane-a");

        const milestones = ids.map((id) => {
          const candidates = ids.filter((other) => other !== id);
          const dependsOn = candidates.filter(() => rand() < 0.3).map((depId) => ({ id: depId, showConnector: true }));
          return milestone(id, laneOf.get(id)!, { dependsOn });
        });

        const source = baseProgram("prog-source", {
          swimlanes: [
            { id: "lane-a", order: 0, type: "lane", name: "Alpha" },
            { id: "lane-b", order: 1, type: "lane", name: "Bravo" },
          ],
          milestones,
        });
        const dest = destProgram();

        const movedIds = ids.filter((id) => laneOf.get(id) === "lane-a");
        const newIds = { lane: "new-lane-a", milestones: Object.fromEntries(movedIds.map((id) => [id, `new-${id}`])) };
        const plan = planSwimlaneMove(source, dest, "lane-a", newIds);
        expect(plan).not.toBeNull();
        if (!plan) return;

        // No milestone lost or duplicated.
        expect(plan.sourceNext.milestones.length + plan.clonedMilestones.length).toBe(source.milestones.length);

        // No dangling dependsOn on the source side.
        const sourceIds = new Set(plan.sourceNext.milestones.map((m) => m.id));
        for (const m of plan.sourceNext.milestones) {
          for (const edge of m.dependsOn) expect(sourceIds.has(edge.id)).toBe(true);
        }

        // No dangling dependsOn among the clones (every remaining edge was remapped to another clone).
        const clonedIds = new Set(plan.clonedMilestones.map((m) => m.id));
        for (const m of plan.clonedMilestones) {
          for (const edge of m.dependsOn) expect(clonedIds.has(edge.id)).toBe(true);
        }
      }),
    );
  });
});
