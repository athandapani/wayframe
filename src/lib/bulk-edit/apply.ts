// Mass-edit / bulk multi-select (Archer delta B-stream) — pure op-builders
// for the four actions SelectionToolbar.tsx offers over a set of selected
// milestone ids. Deterministic, same reasoning cascade.ts and
// resolveBulkShiftOps already establish: the "what changes" computation
// never goes near the model, only the AI-correction path's *selector*
// resolution (bulk-shift.ts) does, and this reuses that directly for date
// shifts rather than reimplementing it.
import { addDays } from "@/components/timeline/date-utils";
import type { Milestone, Status, Swimlane } from "@/components/timeline/types";
import type { AcceptBaselineOp, PatchOp } from "@/lib/corrections/schema";
import { resolveBulkShiftOps } from "@/lib/corrections/bulk-shift";
import type { DiffEntry } from "@/components/shared/DiffBanner";

export type BulkEditOp =
  | { kind: "shift"; deltaDays: number }
  | { kind: "status"; status: Status }
  | { kind: "lane"; laneId: string }
  | { kind: "acceptBaseline" };

/** One PatchOp per shifted milestone (date, plus endDate for a duration pill) — reuses the AI-correction path's own selector resolver with an explicit id list. */
export function bulkShiftDates(milestones: readonly Milestone[], ids: readonly string[], deltaDays: number): PatchOp[] {
  if (ids.length === 0 || deltaDays === 0) return [];
  const { patchOps } = resolveBulkShiftOps(milestones, [], [{ selector: { kind: "ids", ids: [...ids] }, deltaDays, reason: "bulk edit" }]);
  return patchOps;
}

export function bulkSetStatus(ids: readonly string[], status: Status): PatchOp[] {
  return ids.map((id) => ({ targetId: id, field: "status", newValue: status, reason: "bulk edit" }));
}

/** Not a PatchOp — Milestone.laneId isn't in PatchOpSchema's field union (that union is the AI-correction contract; lane reassignment has never been part of it). Applied directly by the reducer instead. */
export function bulkSetLane(ids: readonly string[], laneId: string): { id: string; laneId: string }[] {
  return ids.map((id) => ({ id, laneId }));
}

export function bulkAcceptBaseline(milestones: readonly Milestone[], ids: readonly string[]): AcceptBaselineOp[] {
  const withBaseline = new Set(milestones.filter((m) => m.originalDate).map((m) => m.id));
  return ids.filter((id) => withBaseline.has(id)).map((id) => ({ scope: "one" as const, targetId: id, reason: "bulk accept baseline" }));
}

/**
 * Preview rows for DiffBanner — one entry per selected milestone that the
 * chosen op would actually change (a milestone already at the target
 * status, or with no baseline to accept, contributes nothing to review).
 */
export function buildBulkEditPreview(milestones: readonly Milestone[], swimlanes: readonly Swimlane[], selectedIds: readonly string[], op: BulkEditOp): DiffEntry[] {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const laneNameById = new Map(swimlanes.map((l) => [l.id, l.name]));
  const entries: DiffEntry[] = [];

  for (const id of selectedIds) {
    const m = byId.get(id);
    if (!m) continue;
    const detail = laneNameById.get(m.laneId);

    if (op.kind === "shift") {
      if (op.deltaDays === 0) continue;
      const fieldChanges = [{ field: "date", before: m.date, after: addDays(m.date, op.deltaDays) }];
      if (m.endDate) fieldChanges.push({ field: "endDate", before: m.endDate, after: addDays(m.endDate, op.deltaDays) });
      entries.push({ id, kind: "update", title: m.title, detail, fieldChanges });
    } else if (op.kind === "status") {
      if (m.status === op.status) continue;
      entries.push({ id, kind: "update", title: m.title, detail, fieldChanges: [{ field: "status", before: m.status, after: op.status }] });
    } else if (op.kind === "lane") {
      if (m.laneId === op.laneId) continue;
      entries.push({ id, kind: "update", title: m.title, detail, fieldChanges: [{ field: "lane", before: detail ?? "", after: laneNameById.get(op.laneId) ?? "" }] });
    } else {
      if (!m.originalDate) continue;
      entries.push({ id, kind: "update", title: m.title, detail, fieldChanges: [{ field: "baseline", before: m.originalDate, after: "accepted" }] });
    }
  }

  return entries;
}
