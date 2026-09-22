import type { DependencyEdge, Milestone, Program, Swimlane } from "@/components/timeline/types";
import { removeMilestoneOp, removeSwimlaneOp, topOrderSpaceNextOrder } from "./apply-document";

/**
 * The shared cross-Program move primitive (wayframe#124) — the mechanism the
 * combined multi-Program editor (#126) depends on for relocating a milestone,
 * or an entire swimlane and everything it owns, from one Program's document
 * into another's. Pure planning only, no React and no Yjs: given both
 * Programs' current plain-object state (whatever a `useCorrectionBox.data`
 * happens to hold) and caller-supplied fresh ids, computes both Programs'
 * next state in one synchronous call.
 *
 * Two other modules build on this one, each for a different caller:
 *  - src/components/correction-box/cross-program-move.ts — the box-dispatch
 *    orchestrator #126's dropdowns actually call, wrapping a plan with the
 *    two things a plan alone can't do: refuse a move neither side can
 *    accept, and apply both sides through their own `useCorrectionBox`
 *    (the only sanctioned path to a Program's live Yjs doc).
 *  - src/lib/realtime/cross-program-move-docs.ts — a doc-level form used
 *    only by tests, applying an already-computed plan straight to two
 *    `Y.Doc`s so the primitive's ordering can be exercised without React.
 *
 * Ids are always caller-supplied parameters, never generated in here —
 * matches this codebase's "client resolves ids, reducer just commits them"
 * convention (`addSwimlaneOp`, `importMerge`) and keeps this module's own
 * tests fully deterministic without mocking nanoid.
 *
 * A cross-Program move can't preserve everything: `dependsOn` edges, Swimlane
 * Group membership, and `linksToTopLevelMilestone` are all Program-local
 * concepts with no cross-Program equivalent, so they're dropped rather than
 * left silently dangling — mirrors `removeMilestoneOp`/`removeSwimlaneOp`'s
 * own dangling-reference cleanup, just one Program further out. What gets
 * dropped is reported back on the returned plan so a caller can surface it
 * (a toast, a confirmation dialog) instead of the information just
 * vanishing. Scenario overrides (Portfolio-scoped, keyed by bare milestone
 * id) are deliberately NOT reconciled here — out of scope for #124, see
 * CONTEXT.md's Cross-Program id namespacing section for the follow-up.
 */

/**
 * A dependsOn edge dropped because the dependent and its predecessor ended
 * up in different Programs — cross-Program dependencies are unsupported.
 * Covers both directions: the moved item's own edge onto something that
 * stayed behind, and a staying item's edge onto something that just moved
 * away (the latter is exactly what `removeMilestoneOp`/`removeSwimlaneOp`
 * already strip from `sourceNext` silently — this just also reports it).
 */
export type DroppedDependsOn = { milestoneId: string; predecessorId: string };

export interface MilestoneMovePlan {
  /** The source Program with the milestone removed — apply this to the source box/doc. */
  sourceNext: Program;
  /** The destination Program with the cloned milestone appended — apply this to the destination box/doc. */
  destNext: Program;
  /** The fresh-id clone appended to `destNext.milestones` — hand this directly to `receiveMovedMilestone`. */
  clonedMilestone: Milestone;
  droppedDependsOn: DroppedDependsOn[];
  /** Non-empty (containing the SOURCE milestone id) iff the moved milestone's `linksToTopLevelMilestone` was cleared. */
  clearedTopLevelLinks: string[];
}

export interface SwimlaneMovePlan {
  /** The source Program with the swimlane and its milestones removed — apply this to the source box/doc. */
  sourceNext: Program;
  /** The destination Program with the cloned swimlane and milestones appended — apply this to the destination box/doc. */
  destNext: Program;
  /** The fresh-id clone appended to `destNext.swimlanes` — hand this directly to `receiveMovedSwimlane`. */
  clonedSwimlane: Swimlane;
  /** The fresh-id clones appended to `destNext.milestones` — hand this directly to `receiveMovedSwimlane`. */
  clonedMilestones: Milestone[];
  /** Old (source-local) id -> new (destination-local) id, for the lane and every milestone it owned. */
  idMap: Record<string, string>;
  droppedDependsOn: DroppedDependsOn[];
  /** SOURCE milestone ids whose `linksToTopLevelMilestone` was cleared. */
  clearedTopLevelLinks: string[];
}

/**
 * Moves a single milestone out of `source` and into `destLaneId` in `dest`.
 * Returns `null` if `milestoneId` doesn't resolve in `source`, or if `source`
 * and `dest` are the same Program — reassigning a milestone's lane within
 * one Program is a plain field patch (see `useCorrectionBox`'s
 * `setMilestoneLane`), never a clone: cloning would silently drop the
 * milestone's Scenario overrides, `rev` continuity, and every inbound
 * `dependsOn` edge for no reason, since none of those become invalid when
 * the milestone stays in the same Program.
 */
export function planMilestoneMove(source: Program, dest: Program, milestoneId: string, destLaneId: string, newId: string): MilestoneMovePlan | null {
  if (source.id === dest.id) return null;
  const milestone = source.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return null;

  const clearedLink = milestone.linksToTopLevelMilestone !== null;
  const clonedMilestone: Milestone = {
    ...milestone,
    id: newId,
    laneId: destLaneId,
    dependsOn: [],
    linksToTopLevelMilestone: null,
    rev: undefined,
  };
  // Outbound: edges the moved milestone itself carried (its predecessors,
  // now unreachable). Inbound: edges any OTHER (staying) milestone had onto
  // this one — removeMilestoneOp already strips these from sourceNext
  // silently; reported here too so a caller can surface both directions,
  // not just the one the moved item's own object happened to carry.
  const outboundDropped: DroppedDependsOn[] = milestone.dependsOn.map((edge) => ({ milestoneId, predecessorId: edge.id }));
  const inboundDropped: DroppedDependsOn[] = source.milestones
    .filter((m) => m.id !== milestoneId)
    .flatMap((m) => m.dependsOn.filter((edge) => edge.id === milestoneId).map(() => ({ milestoneId: m.id, predecessorId: milestoneId })));

  return {
    sourceNext: removeMilestoneOp(source, milestoneId),
    destNext: { ...dest, milestones: [...dest.milestones, clonedMilestone] },
    clonedMilestone,
    droppedDependsOn: [...outboundDropped, ...inboundDropped],
    clearedTopLevelLinks: clearedLink ? [milestoneId] : [],
  };
}

/**
 * Moves an entire swimlane — and every milestone it owns — out of `source`
 * and into `dest`. `newIds.milestones` must carry a fresh id for every
 * milestone currently in that lane (extra entries are ignored). Returns
 * `null` if `laneId` doesn't resolve in `source`, if `source`/`dest` are the
 * same Program, or if `newIds.milestones` is missing an id for any of the
 * lane's own milestones.
 */
export function planSwimlaneMove(
  source: Program,
  dest: Program,
  laneId: string,
  newIds: { lane: string; milestones: Record<string, string> },
): SwimlaneMovePlan | null {
  if (source.id === dest.id) return null;
  const lane = source.swimlanes.find((l) => l.id === laneId);
  if (!lane) return null;

  const owned = source.milestones.filter((m) => m.laneId === laneId);
  if (owned.some((m) => !newIds.milestones[m.id])) return null;

  const idMap: Record<string, string> = { [laneId]: newIds.lane };
  for (const m of owned) idMap[m.id] = newIds.milestones[m.id];
  const movedMilestoneIds = new Set(owned.map((m) => m.id));

  // Outbound: edges a moved milestone had onto something that didn't move
  // with it (an external predecessor, or one this Program has no record of).
  const droppedDependsOn: DroppedDependsOn[] = [];
  const clearedTopLevelLinks: string[] = [];

  const clonedMilestones: Milestone[] = owned.map((m) => {
    const dependsOn: DependencyEdge[] = [];
    for (const edge of m.dependsOn) {
      const remapped = idMap[edge.id];
      if (remapped) dependsOn.push({ ...edge, id: remapped });
      else droppedDependsOn.push({ milestoneId: m.id, predecessorId: edge.id });
    }
    if (m.linksToTopLevelMilestone !== null) clearedTopLevelLinks.push(m.id);
    return { ...m, id: idMap[m.id], laneId: newIds.lane, dependsOn, linksToTopLevelMilestone: null, rev: undefined };
  });

  // Inbound: edges a STAYING milestone had onto one that just moved away —
  // removeSwimlaneOp already strips these from sourceNext silently; reported
  // here too so a caller can surface both directions, not just the outbound
  // one the moved lane's own milestones happened to carry.
  for (const m of source.milestones) {
    if (movedMilestoneIds.has(m.id)) continue;
    for (const edge of m.dependsOn) {
      if (movedMilestoneIds.has(edge.id)) droppedDependsOn.push({ milestoneId: m.id, predecessorId: edge.id });
    }
  }

  // groupId dropped: the destination Program's SwimlaneGroups are a
  // different id space, and #118 specifies only a per-lane *Program*
  // dropdown, no group picker. Placed at the end of dest's own top-level
  // order space, exactly like a freshly-added swimlane (addSwimlaneOp).
  const clonedSwimlane: Swimlane = { ...lane, id: newIds.lane, groupId: undefined, order: topOrderSpaceNextOrder(dest) };

  return {
    sourceNext: removeSwimlaneOp(source, laneId),
    destNext: { ...dest, swimlanes: [...dest.swimlanes, clonedSwimlane], milestones: [...dest.milestones, ...clonedMilestones] },
    clonedSwimlane,
    clonedMilestones,
    idMap,
    droppedDependsOn,
    clearedTopLevelLinks,
  };
}
