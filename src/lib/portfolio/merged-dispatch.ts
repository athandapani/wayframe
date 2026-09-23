// The editing-dispatch half of the merge boundary (wayframe#126).
//
// CONTEXT.md's "Cross-Program id namespacing" doctrine already flagged this
// gap: t26 built the merge/namespace half for real, but "the editing-dispatch
// half stays unbuilt since there's no live merged-view editing UI yet to need
// it." The combined multi-Program editor is that UI, and this module is that
// half — it takes an id as the MERGED canvas reports it (`programId::localId`)
// and routes the edit to the owning Program's own `useCorrectionBox`, with
// that Program's own local id.
//
// Two things this is emphatically NOT:
//
//  - It is not the cross-Program MOVE primitive. Relocating a Milestone or a
//    Swimlane means minting a genuinely new, storage-durable id in the
//    destination Program and rewiring every internal reference — a content
//    transformation, not a display-layer decode. That's
//    src/lib/corrections/cross-program-move.ts (planner) plus
//    src/components/correction-box/cross-program-move.ts (dispatch), exactly
//    as CONTEXT.md spells out, and it is deliberately not reachable from
//    here. The cross-Program bulk-edit toolbar keeps `laneId`/`laneRow` out
//    of its field list for the same reason (see
//    CrossProgramSelectionToolbar's `EXCLUDED_FIELDS`).
//
//  - It is not a second write path to a Yjs doc. Every function here ends at
//    a `UseCorrectionBoxResult` action, the only sanctioned path into a
//    Program's live doc (use-program-room.ts's local->remote sync effect
//    diffs `box.data` against its own last-seen snapshot and would fight a
//    direct doc write it never observed).
//
// A miss — an id from a Program with no connected box, or an id that was
// never namespaced — is a no-op that returns null, never a throw: the merged
// canvas can outlive a Program's room by a render or two (a room that
// dropped, a Program removed from under the view), and a click landing on a
// stale marker must not take the page down with it.

import type { UseCorrectionBoxResult } from "@/components/correction-box/use-correction-box";
import { isProgramBandId, splitNamespacedId } from "./merge-programs";

/** How a caller hands this module its live boxes — a lookup rather than a map, so the caller stays free to hold them in a ref, a registry component, or anything else. */
export type ProgramBoxLookup = (programId: string) => UseCorrectionBoxResult | undefined;

export interface RoutedMergedId {
  programId: string;
  /** The id in the owning Program's OWN id space — what every box action expects. */
  localId: string;
  box: UseCorrectionBoxResult;
}

/** Splits a merged id and finds its Program's live box. Null when the id isn't namespaced or that Program has no connected box — see this module's header for why that's a no-op rather than an error. */
export function routeMergedId(id: string, lookup: ProgramBoxLookup): RoutedMergedId | null {
  const split = splitNamespacedId(id);
  if (!split) return null;
  const box = lookup(split.programId);
  if (!box) return null;
  return { programId: split.programId, localId: split.localId, box };
}

/**
 * The merged canvas's own mutation callbacks, each routed to the owning
 * Program's box. Everything RoadmapTimeline can fire that CHANGES a document
 * lives here; selection/inspector-opening callbacks stay with the component,
 * since they change view state only.
 *
 * `onToggleGroupCollapsed` is the one that splits two ways: a real
 * SwimlaneGroup's `collapsed` is document content and routes like any other
 * edit, while a Program BAND is synthetic — it exists only inside one merge
 * pass and has no field in any Program's doc — so its collapse is handed
 * back to the caller to hold as viewer state. See `isProgramBandId`.
 */
export function buildMergedCanvasHandlers(
  lookup: ProgramBoxLookup,
  onToggleProgramBand: (programId: string) => void,
): {
  onMilestoneDateChange: (id: string, date: string) => void;
  onMilestoneDateRangeChange: (id: string, date: string, endDate: string) => void;
  onToggleGroupCollapsed: (groupId: string) => void;
} {
  return {
    onMilestoneDateChange: (id, date) => {
      const routed = routeMergedId(id, lookup);
      routed?.box.setMilestoneDate(routed.localId, date);
    },
    onMilestoneDateRangeChange: (id, date, endDate) => {
      const routed = routeMergedId(id, lookup);
      routed?.box.setMilestoneDateRange(routed.localId, date, endDate);
    },
    onToggleGroupCollapsed: (groupId) => {
      if (isProgramBandId(groupId)) {
        const split = splitNamespacedId(groupId);
        if (split) onToggleProgramBand(split.programId);
        return;
      }
      const routed = routeMergedId(groupId, lookup);
      if (!routed) return;
      const group = routed.box.data.swimlaneGroups?.find((g) => g.id === routed.localId);
      routed.box.setSwimlaneGroupCollapsed(routed.localId, !group?.collapsed);
    },
  };
}
