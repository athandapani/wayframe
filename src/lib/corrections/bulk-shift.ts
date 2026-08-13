import { addDays } from "@/components/timeline/date-utils";
import type { Milestone, TopLevelItem } from "@/components/timeline/types";
import type { BulkShiftOp, BulkShiftSelector, PatchOp, TopLevelItemOp } from "./schema";

export interface ResolvedBulkShift {
  patchOps: PatchOp[];
  topLevelItemOps: TopLevelItemOp[];
}

/** The date a TopLevelItem sorts/cuts off by — startDate for a phase (its span's beginning), date for the other two kinds. */
function topLevelItemSortDate(item: TopLevelItem): string {
  return item.type === "phase" ? item.startDate : item.date;
}

/**
 * Expands one bulk-shift selector into the concrete milestone/top-level-item
 * ids it covers. Unknown ids resolve to nothing rather than throwing —
 * /api/correct already rejects a hallucinated id server-side
 * (findUnknownTargets in schema.ts), so reaching an unresolvable id here
 * only means the live document changed underneath a still-pending proposal,
 * the same staleness apply.ts's id-filtered ops already tolerate silently.
 */
function resolveSelector(
  selector: BulkShiftSelector,
  milestones: readonly Milestone[],
  topLevelItems: readonly TopLevelItem[],
): { milestoneIds: Set<string>; topLevelItemIds: Set<string> } {
  const milestoneIds = new Set<string>();
  const topLevelItemIds = new Set<string>();

  if (selector.kind === "lane") {
    if (selector.laneId === "PROGRAM") {
      for (const t of topLevelItems) topLevelItemIds.add(t.id);
    } else {
      for (const m of milestones) if (m.laneId === selector.laneId) milestoneIds.add(m.id);
    }
    return { milestoneIds, topLevelItemIds };
  }

  if (selector.kind === "ids") {
    const milestoneIdSet = new Set(milestones.map((m) => m.id));
    const topLevelIdSet = new Set(topLevelItems.map((t) => t.id));
    for (const id of selector.ids) {
      if (milestoneIdSet.has(id)) milestoneIds.add(id);
      else if (topLevelIdSet.has(id)) topLevelItemIds.add(id);
    }
    return { milestoneIds, topLevelItemIds };
  }

  // "after": cutoff is the referenced item's own current date, inclusive —
  // sweeps milestones and PROGRAM-band items together, not lane-scoped.
  const anchorMilestone = milestones.find((m) => m.id === selector.afterId);
  const anchorTopLevel = anchorMilestone ? undefined : topLevelItems.find((t) => t.id === selector.afterId);
  const cutoff = anchorMilestone?.date ?? (anchorTopLevel ? topLevelItemSortDate(anchorTopLevel) : undefined);
  if (cutoff === undefined) return { milestoneIds, topLevelItemIds };

  for (const m of milestones) if (m.date >= cutoff) milestoneIds.add(m.id);
  for (const t of topLevelItems) if (topLevelItemSortDate(t) >= cutoff) topLevelItemIds.add(t.id);
  return { milestoneIds, topLevelItemIds };
}

/**
 * Compiles bulkShiftOps down into ordinary date/startDate/endDate
 * PatchOp/TopLevelItemOp entries (wayframe#57) — the same shapes every other
 * correction path already produces, so applyCascade/apply.ts/preview.ts
 * need no changes to handle a bulk shift. A milestone's endDate (duration
 * pill) shifts alongside its date so the span survives intact; a phase's
 * startDate+endDate shift together the same way. The caller is expected to
 * fold the returned patchOps into the same batch passed to applyCascade
 * (not call it separately per op) — cascade's own visited-set dedup is what
 * keeps an already-shifted dependent from being shifted again.
 */
export function resolveBulkShiftOps(
  milestones: readonly Milestone[],
  topLevelItems: readonly TopLevelItem[],
  bulkShiftOps: readonly BulkShiftOp[],
): ResolvedBulkShift {
  const patchOps: PatchOp[] = [];
  const topLevelItemOps: TopLevelItemOp[] = [];

  for (const op of bulkShiftOps) {
    const { milestoneIds, topLevelItemIds } = resolveSelector(op.selector, milestones, topLevelItems);

    for (const m of milestones) {
      if (!milestoneIds.has(m.id)) continue;
      patchOps.push({ targetId: m.id, field: "date", newValue: addDays(m.date, op.deltaDays), reason: op.reason });
      if (m.endDate) patchOps.push({ targetId: m.id, field: "endDate", newValue: addDays(m.endDate, op.deltaDays), reason: op.reason });
    }

    for (const t of topLevelItems) {
      if (!topLevelItemIds.has(t.id)) continue;
      if (t.type === "phase") {
        topLevelItemOps.push({ targetId: t.id, field: "startDate", newValue: addDays(t.startDate, op.deltaDays), reason: op.reason });
        topLevelItemOps.push({ targetId: t.id, field: "endDate", newValue: addDays(t.endDate, op.deltaDays), reason: op.reason });
      } else {
        topLevelItemOps.push({ targetId: t.id, field: "date", newValue: addDays(t.date, op.deltaDays), reason: op.reason });
      }
    }
  }

  return { patchOps, topLevelItemOps };
}
