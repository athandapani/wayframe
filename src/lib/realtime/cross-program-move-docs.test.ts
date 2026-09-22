import { describe, expect, it } from "vitest";
import type { Milestone, Program } from "@/components/timeline/types";
import { planMilestoneMove } from "@/lib/corrections/cross-program-move";
import { applyCrossProgramMoveToDocs } from "./cross-program-move-docs";
import { createSimulatedClient, joinSimulatedClient, readNormalized, syncAll, type SimulatedClient } from "./multi-client-harness";

/** `normalizeProgramForComparison` turns `milestones` into an id-keyed record (array order isn't meaningful) — this reads just the id set back out for a `.map(id).toEqual([...])`-style assertion. */
function milestoneIds(client: SimulatedClient): string[] {
  const normalized = readNormalized(client) as { milestones: Record<string, unknown> };
  return Object.keys(normalized.milestones).sort();
}

function milestone(id: string, laneId: string, overrides: Partial<Milestone> = {}): Milestone {
  return { id, laneId, title: id, date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, ...overrides };
}

function sourceProgram(): Program {
  return {
    id: "prog-source",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Source",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "o",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-a", order: 0, type: "lane", name: "Alpha" }],
    topLevelItems: [],
    milestones: [milestone("m1", "lane-a")],
  };
}

function destProgram(): Program {
  return {
    id: "prog-dest",
    portfolioId: "portfolio-1",
    order: 1,
    programName: "Dest",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "o",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-x", order: 0, type: "lane", name: "Xray" }],
    topLevelItems: [],
    milestones: [],
  };
}

/**
 * Two simulated rooms (one per Program, per multi-client-harness.ts's own
 * doc), each with two clients: "-a" is the mover (whichever client's
 * useCorrectionBox actually dispatched the move) and "-b" is a peer who only
 * ever receives — mirrors a second collaborator's browser tab.
 */
function makeRooms() {
  const sourceA = createSimulatedClient("source-a", sourceProgram());
  const sourceB = joinSimulatedClient("source-b", sourceA);
  const destA = createSimulatedClient("dest-a", destProgram());
  const destB = joinSimulatedClient("dest-b", destA);
  return { sourceA, sourceB, destA, destB };
}

describe("applyCrossProgramMoveToDocs (wayframe#124 convergence)", () => {
  it("moves the milestone with no loss and no duplicate once both rooms fully sync", () => {
    const { sourceA, sourceB, destA, destB } = makeRooms();
    const plan = planMilestoneMove(sourceProgram(), destProgram(), "m1", "lane-x", "new-m1")!;
    expect(plan).not.toBeNull();

    applyCrossProgramMoveToDocs(sourceA.doc, destA.doc, sourceProgram(), destProgram(), plan, "mover");
    syncAll([sourceA, sourceB]);
    syncAll([destA, destB]);

    expect(milestoneIds(sourceB)).toEqual([]);
    expect(milestoneIds(destB)).toEqual(["new-m1"]);

    // Every other client in each room agrees — full convergence, not just the peer.
    expect(readNormalized(sourceA)).toEqual(readNormalized(sourceB));
    expect(readNormalized(destA)).toEqual(readNormalized(destB));
  });

  it("documents the honest guarantee: a destination room that syncs before the source room does makes the duplicate briefly observable, and it resolves once the source room catches up", () => {
    const { sourceA, sourceB, destA, destB } = makeRooms();
    const plan = planMilestoneMove(sourceProgram(), destProgram(), "m1", "lane-x", "new-m1")!;

    applyCrossProgramMoveToDocs(sourceA.doc, destA.doc, sourceProgram(), destProgram(), plan, "mover");

    // Only the destination room's peer catches up so far — models the
    // window this primitive can't close: the insert reached other clients
    // before the removal did (e.g. the source room's connection was
    // momentarily down).
    syncAll([destA, destB]);

    expect(milestoneIds(destB)).toEqual(["new-m1"]);
    // The peer hasn't seen the removal yet — briefly, the milestone exists in both rooms at once.
    expect(milestoneIds(sourceB)).toEqual(["m1"]);

    // The source room catching up resolves it — never in neither, and the
    // only-possible-duplicate window closes as soon as that room syncs.
    syncAll([sourceA, sourceB]);
    expect(milestoneIds(sourceB)).toEqual([]);
  });
});
