import { nanoid } from "nanoid";
import type { UseCorrectionBoxResult } from "./use-correction-box";
import { planMilestoneMove, planSwimlaneMove, type MilestoneMovePlan, type SwimlaneMovePlan } from "@/lib/corrections/cross-program-move";

/** Per-side write access, checked before a cross-Program move is attempted at all — see this file's own doc comment for why. */
export interface CrossProgramMoveAccess {
  sourceCanEdit: boolean;
  destCanEdit: boolean;
}

/**
 * The box-dispatch orchestrator for the cross-Program move primitive
 * (wayframe#124, extended #131) — what #126's milestone-editor
 * Program/Swimlane dropdowns and swimlane-editor per-lane Program dropdown
 * actually call. Wraps src/lib/corrections/cross-program-move.ts's pure
 * planners with the three things a plan alone can't do:
 *
 *  - Refuse the whole move up front if either side isn't writable. A move
 *    into a Program the user can only view would have its destination
 *    insert rejected (server-side, or simply never granted a room
 *    connection) while the source removal still lands locally — exactly
 *    the data loss this primitive exists to prevent. #126's dropdown UI
 *    should already only offer Programs the user can edit; this is defense
 *    in depth against a caller wiring that filter wrong.
 *  - Apply BOTH sides through their OWN `useCorrectionBox` instance — the
 *    only sanctioned path to a Program's live Yjs doc (see
 *    use-program-room.ts's local->remote sync effect, which diffs
 *    `box.data` itself and would fight any direct doc write it never saw).
 *  - Carry the moved item's Scenario overrides over to its new id (#131).
 *    Those live on the shared Portfolio, not on either Program's Yjs doc, so
 *    a planner working purely in Program state can't reach them — see
 *    `repointScenarios` at the bottom of this file.
 *
 * Guarantee: dispatches the destination-side insert BEFORE the source-side
 * release, back-to-back with no I/O or user input in between, so the only
 * possible failure residue is the item existing in BOTH Programs — a
 * visible, user-fixable duplicate — never in NEITHER. It is NOT guaranteed
 * the item can never transiently exist in both: each Program's Yjs doc
 * flushes over its own independent websocket/room connection, this app has
 * no offline persistence (no y-indexeddb), so a destination-flushed/
 * source-unflushed disconnect leaves a durable duplicate until the extra
 * copy is deleted by hand. See CONTEXT.md's Cross-Program id namespacing
 * section for the full reasoning, and
 * src/lib/realtime/cross-program-move-docs.test.ts for a test that encodes
 * this exact window rather than leaving it as prose.
 *
 * Both functions return the computed plan (or `null` if the move was
 * refused or a no-op) so a caller can surface `droppedDependsOn`/
 * `clearedTopLevelLinks` to the user instead of that information silently
 * vanishing.
 */
export function moveMilestoneBetweenPrograms(
  source: UseCorrectionBoxResult,
  dest: UseCorrectionBoxResult,
  milestoneId: string,
  destLaneId: string,
  access: CrossProgramMoveAccess,
): MilestoneMovePlan | null {
  if (!access.sourceCanEdit || !access.destCanEdit) return null;

  if (source.data.id === dest.data.id) {
    // Same-Program lane reassignment — a plain field patch, never a clone
    // (see planMilestoneMove's own doc for why). No-op if the id isn't
    // actually in this Program.
    if (!source.data.milestones.some((m) => m.id === milestoneId)) return null;
    source.setMilestoneLane(milestoneId, destLaneId);
    return null;
  }

  const plan = planMilestoneMove(source.data, dest.data, milestoneId, destLaneId, nanoid());
  if (!plan) return null;

  dest.receiveMovedMilestone(plan.clonedMilestone);
  source.releaseMovedMilestone(milestoneId);
  repointScenarios(source, dest, { [milestoneId]: plan.clonedMilestone.id });
  return plan;
}

export function moveSwimlaneBetweenPrograms(
  source: UseCorrectionBoxResult,
  dest: UseCorrectionBoxResult,
  laneId: string,
  access: CrossProgramMoveAccess,
): SwimlaneMovePlan | null {
  if (!access.sourceCanEdit || !access.destCanEdit) return null;
  // No same-Program swimlane "move" — reordering a lane within its own
  // Program is the swimlane editor's existing reorder/group controls, not
  // this primitive.
  if (source.data.id === dest.data.id) return null;

  const newIds = {
    lane: nanoid(),
    milestones: Object.fromEntries(source.data.milestones.filter((m) => m.laneId === laneId).map((m) => [m.id, nanoid()])),
  };

  const plan = planSwimlaneMove(source.data, dest.data, laneId, newIds);
  if (!plan) return null;

  dest.receiveMovedSwimlane(plan.clonedSwimlane, plan.clonedMilestones);
  source.releaseMovedSwimlane(laneId);
  repointScenarios(source, dest, plan.idMap);
  return plan;
}

/**
 * The move's Portfolio-side half (wayframe#131) — carries every Scenario
 * override on the moved milestone(s) over to their new destination ids, so an
 * override survives the move instead of being left pointing at an id no
 * Program holds any more. `resolveScenario`'s `orphaned` reporting is the
 * safety net for anything this doesn't catch and stays exactly as it is;
 * src/lib/scenario/apply.ts's `repointScenarioOverrides` documents what is
 * and isn't rewritten.
 *
 * Dispatched to BOTH boxes, and only after both Program halves are in
 * flight, for two reasons. Both boxes, because a Scenario is Portfolio-scoped
 * (types.ts's `Portfolio.scenarios`) and each box holds its own copy of the
 * shared Portfolio — re-pointing on one side alone would leave the
 * destination's copy keyed by an id only the source used to have, and the
 * source's copy reporting `orphaned` for an item that legitimately left.
 * After, because this writes no Program content and so has no bearing on the
 * insert-before-release ordering guarantee above; keeping it out of that
 * window keeps the window exactly as narrow as it was.
 *
 * Known gap, not introduced here: the combined multi-Program editor — today's
 * only caller — has no Portfolio-level persistence at all (see
 * CombinedProgramEditor's header, seam 3: each box holds its own Portfolio
 * copy and `useProgramRoom` syncs only the Program half). So this rewrite is
 * box-local and does not outlive the session there, the same as every other
 * Portfolio-level edit on that surface. It becomes durable for free when a
 * Portfolio-scoped room lands; until then the alternative was leaving the
 * override pointing at a dead id in memory too, which is strictly worse.
 */
function repointScenarios(source: UseCorrectionBoxResult, dest: UseCorrectionBoxResult, idMap: Record<string, string>): void {
  source.repointScenarioOverrides(idMap);
  dest.repointScenarioOverrides(idMap);
}
