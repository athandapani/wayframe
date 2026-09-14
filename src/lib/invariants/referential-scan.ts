import type { Program } from "@/components/timeline/types";

/**
 * A Program-scoped referential edge (laneId/dependsOn/linksToTopLevelMilestone)
 * pointing at something that no longer exists (t14, wayframe#89). Generalizes
 * t13/#87's Scenario-orphan doctrine — "surfaced, never silently dropped and
 * never silently resurrected" — from Scenario overrides to the Program's own
 * referential edges.
 *
 * WHY THIS CAN'T JUST REJECT THE BAD OP THE WAY Zod's schema-level
 * `referentialProblems` (src/lib/document-file/schema.ts) rejects a whole
 * document today. That gate works because a file-open/localStorage-rehydrate
 * document has exactly one writer at a time — there's a single point in time
 * to check "is this whole document internally consistent" before it's ever
 * used. Once concurrent Yjs writes are possible, that single write boundary
 * doesn't exist: a peer deleting a lane and another peer (unaware, at the
 * same moment) setting a different milestone's laneId to it are each
 * individually valid ops — only the *merged* result is inconsistent, and
 * there's no op left to reject by the time that's detectable. The same is
 * true of a concurrent delete-milestone + add-dependsOn-edge-to-it. So,
 * exactly like Scenario's `orphaned`/`dangling-reference` conflicts, a
 * dangling edge here can only be surfaced after the fact, never prevented —
 * this function never mutates `program` and never rejects anything, it only
 * reports what it finds.
 *
 * Portfolio-scoped edges (categoryId, Program id/portfolioId uniqueness) are
 * explicitly out of scope here — Portfolio is a different CRDT unit than
 * Program (see t14's gist), so schema.ts's existing `referentialProblems`
 * keeps owning those, unchanged, as part of file-open's shape-integrity
 * gate.
 *
 * Unconsumed today, same "scaffolded but unconsumed" treatment as
 * `resolveScenario` (src/lib/scenario/resolve.ts), t36's presence rendering
 * primitive, and t4's realtime provider: there's no live-CRDT-collaboration
 * UI yet to run this mid-session. Whichever future ticket wires up real
 * Yjs-backed live editing owns surfacing this in a UI.
 */
export type ReferentialProblem =
  | { kind: "dangling-lane"; milestoneId: string; laneId: string; message: string }
  | { kind: "dangling-dependency"; milestoneId: string; dependencyId: string; message: string }
  | { kind: "dangling-top-level-link"; milestoneId: string; topLevelItemId: string; message: string };

export function scanReferentialProblems(program: Program): ReferentialProblem[] {
  const problems: ReferentialProblem[] = [];
  const laneIds = new Set(program.swimlanes.map((l) => l.id));
  const milestoneIds = new Set(program.milestones.map((m) => m.id));
  const topLevelItemIds = new Set(program.topLevelItems.map((t) => t.id));

  for (const m of program.milestones) {
    if (!laneIds.has(m.laneId)) {
      problems.push({
        kind: "dangling-lane",
        milestoneId: m.id,
        laneId: m.laneId,
        message: `"${m.title}" is in lane "${m.laneId}", which doesn't exist`,
      });
    }
    for (const dep of m.dependsOn) {
      if (!milestoneIds.has(dep.id)) {
        problems.push({
          kind: "dangling-dependency",
          milestoneId: m.id,
          dependencyId: dep.id,
          message: `"${m.title}" depends on "${dep.id}", which doesn't exist`,
        });
      }
    }
    if (m.linksToTopLevelMilestone && !topLevelItemIds.has(m.linksToTopLevelMilestone)) {
      problems.push({
        kind: "dangling-top-level-link",
        milestoneId: m.id,
        topLevelItemId: m.linksToTopLevelMilestone,
        message: `"${m.title}" links to top-level item "${m.linksToTopLevelMilestone}", which doesn't exist`,
      });
    }
  }
  return problems;
}
