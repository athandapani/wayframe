// Mass-edit / bulk multi-select — the generic field-patch apply/preview pair
// (wayframe#t33) that replaces the old closed 4-op union's four hand-written
// builders and one branchy preview function. See ./types.ts for the
// `BulkPatchOp`/`BULK_PATCH_FIELD_META` data model and the applicability
// research behind every field's `appliesTo` check.
//
// Deliberately reuses the exact same machinery today's single-op builders
// already used, rather than reimplementing any of it:
//   - status/date/endDate route through PatchOp/TopLevelItemOp +
//     applyCascade/applyOps/applyTopLevelItemOps/resolveBulkShiftOps, same
//     as every other correction path (AI or manual) in this codebase.
//   - laneId/laneRow/styleOverride.* route through a direct field merge,
//     mirroring exactly how use-correction-box.ts's setMilestoneStyleOverride/
//     setMilestoneLaneRow already merge a single field onto one item —
//     generalized here to also target TopLevelItems and to loop over an id
//     list instead of one id.
//   - delete routes through apply-document.ts's existing
//     removeMilestoneOp/removeTopLevelItemOp (already pure, already handle
//     dangling dependsOn/linksToTopLevelMilestone cleanup) — a bulk-delete
//     helper just dispatches each id to whichever one applies, based on
//     which array currently contains it.
//   - accept-baseline stays entirely outside this model (t33's own gist) —
//     `bulkAcceptBaseline` is unchanged from the old apply.ts, same
//     signature/behavior.
import { addDays } from "@/components/timeline/date-utils";
import type { AcceptBaselineOp, PatchOp, TopLevelItemOp } from "@/lib/corrections/schema";
import { resolveBulkShiftOps } from "@/lib/corrections/bulk-shift";
import { applyCascade } from "@/lib/corrections/cascade";
import { applyOps, applyTopLevelItemOps } from "@/lib/corrections/apply";
import { removeMilestoneOp, removeTopLevelItemOp } from "@/lib/corrections/apply-document";
import type { Milestone, Program, StyleOverride, TopLevelItem } from "@/components/timeline/types";
import type { DiffEntry } from "@/components/shared/DiffBanner";
import { BULK_PATCH_FIELDS, BULK_PATCH_FIELD_META, isTopLevelItem, type BulkPatchField, type BulkPatchOp } from "./types";

// Re-exported so a caller only needs one import path (this file) for both
// the apply/preview functions and the data model they're built from.
export { BULK_PATCH_FIELDS, BULK_PATCH_FIELD_META, isTopLevelItem };
export type { BulkPatchField, BulkPatchOp };

export function bulkAcceptBaseline(milestones: readonly Milestone[], ids: readonly string[]): AcceptBaselineOp[] {
  const withBaseline = new Set(milestones.filter((m) => m.originalDate).map((m) => m.id));
  return ids.filter((id) => withBaseline.has(id)).map((id) => ({ scope: "one" as const, targetId: id, reason: "bulk accept baseline" }));
}

/**
 * Accept-baseline preview rows — stays outside `buildBulkPatchPreview`
 * entirely (t33's own gist: accept-baseline has no "set field to value"
 * shape, just a bare "clear originalDate"), so it needs its own tiny
 * preview builder. Originally a SelectionToolbar.tsx-private function
 * (fork 2); promoted here and exported (t33 fork 3) so the cross-Program
 * bulk-edit toolbar can reuse the exact same preview row shape instead of
 * hand-writing a third copy — same id/before/after formatting either way.
 */
export function buildAcceptBaselinePreview(program: Program, ids: readonly string[]): DiffEntry[] {
  const byId = new Map(program.milestones.map((m) => [m.id, m]));
  const laneNameById = new Map(program.swimlanes.map((l) => [l.id, l.name]));
  const entries: DiffEntry[] = [];
  for (const id of ids) {
    const m = byId.get(id);
    if (!m || !m.originalDate) continue;
    entries.push({ id, kind: "update", title: m.title, detail: laneNameById.get(m.laneId), fieldChanges: [{ field: "baseline", before: m.originalDate, after: "accepted" }] });
  }
  return entries;
}

/** Loops selected ids and dispatches to whichever entity-delete op applies, based on which array currently contains that id — the only bulk-delete primitive there ever needs to be, per this ticket's gist ("delete... stays outside the field-patch model entirely, as its own small fixed set of non-field bulk primitives"). */
function applyBulkDelete(program: Program, ids: readonly string[]): Program {
  return ids.reduce((acc, id) => {
    if (acc.milestones.some((m) => m.id === id)) return removeMilestoneOp(acc, id);
    if (acc.topLevelItems.some((t) => t.id === id)) return removeTopLevelItemOp(acc, id);
    return acc; // unknown id — silently ignored, same staleness tolerance every other id-addressed op in this codebase already has
  }, program);
}

function styleOverrideKey(field: BulkPatchField): keyof StyleOverride {
  return field.slice("styleOverride.".length) as keyof StyleOverride;
}

function isStyleOverrideField(field: BulkPatchField): boolean {
  return field.startsWith("styleOverride.");
}

/**
 * Applies every `{op, ids}` entry (in order) plus `deleteIds` to `program`,
 * producing the next Program — a single PURE function, no side effects, no
 * history/undo (that stays use-correction-box.ts's `bulkEdit` reducer case's
 * job, same as it always was). An id whose item fails that op's `appliesTo`
 * check is silently skipped, never thrown — this is how a mixed
 * Milestone+TopLevelItem (or point+duration-pill) selection behaves when a
 * chosen field only applies to some of the selected items.
 *
 * Implementation shape: every op across the whole batch is first staged into
 * a handful of buckets (PatchOps, TopLevelItemOps, and plain id->value maps
 * for the direct-merge fields), mirroring exactly how the OLD bulkEdit
 * reducer case already received three parallel buckets (patchOps/
 * laneReassignments/acceptBaselineOps) rather than one call per op — then
 * each bucket is committed once. This keeps `applyCascade` running exactly
 * once over the whole batch's date-shift ops (same "one cascade pass per
 * batch" behavior the old code had), not once per op.
 */
export function applyBulkPatchToProgram(program: Program, ops: readonly { op: BulkPatchOp; ids: readonly string[] }[], deleteIds: readonly string[]): Program {
  const milestoneById = new Map(program.milestones.map((m) => [m.id, m]));
  const topLevelById = new Map(program.topLevelItems.map((t) => [t.id, t]));

  const patchOps: PatchOp[] = [];
  const topLevelItemOps: TopLevelItemOp[] = [];
  const laneReassignments = new Map<string, string>();
  const laneRowAssignments = new Map<string, number>();
  const milestoneStylePatches = new Map<string, Partial<StyleOverride>>();
  const topLevelStylePatches = new Map<string, Partial<StyleOverride>>();

  function mergeStylePatch(bucket: Map<string, Partial<StyleOverride>>, id: string, key: keyof StyleOverride, value: unknown) {
    bucket.set(id, { ...bucket.get(id), [key]: value });
  }

  for (const { op, ids } of ops) {
    if (op.field === "date") continue; // handled in its own resolveBulkShiftOps pass below
    const meta = BULK_PATCH_FIELD_META[op.field];

    for (const id of ids) {
      const item = milestoneById.get(id) ?? topLevelById.get(id);
      if (!item || !meta.appliesTo(item)) continue;
      const targetsMilestone = !isTopLevelItem(item);

      if (op.field === "status") {
        if (targetsMilestone) patchOps.push({ targetId: id, field: "status", newValue: op.value, reason: "bulk edit" });
        else topLevelItemOps.push({ targetId: id, field: "status", newValue: op.value, reason: "bulk edit" });
        continue;
      }
      if (op.field === "laneId") {
        laneReassignments.set(id, op.value);
        continue;
      }
      if (op.field === "laneRow") {
        laneRowAssignments.set(id, op.value);
        continue;
      }
      if (op.field === "endDate") {
        // Independent end-edge resize (see ./types.ts's own doc on why this
        // isn't routed through resolveBulkShiftOps) — appliesTo already
        // guarantees a real endDate is present on `item` here.
        const currentEnd = targetsMilestone ? (item as Milestone).endDate! : (item as Extract<TopLevelItem, { type: "phase" }>).endDate;
        const newValue = addDays(currentEnd, op.deltaDays);
        if (targetsMilestone) patchOps.push({ targetId: id, field: "endDate", newValue, reason: "bulk edit" });
        else topLevelItemOps.push({ targetId: id, field: "endDate", newValue, reason: "bulk edit" });
        continue;
      }
      if (isStyleOverrideField(op.field)) {
        const key = styleOverrideKey(op.field);
        if (targetsMilestone) mergeStylePatch(milestoneStylePatches, id, key, op.value);
        else mergeStylePatch(topLevelStylePatches, id, key, op.value);
      }
    }
  }

  // "date" shifts reuse resolveBulkShiftOps exactly as today's code does
  // (bulk-shift.ts) — one call per op entry, ids-selector, scoped to
  // whichever ids the "date" field actually applies to.
  for (const { op, ids } of ops) {
    if (op.field !== "date") continue;
    const meta = BULK_PATCH_FIELD_META.date;
    const applicableIds = ids.filter((id) => {
      const item = milestoneById.get(id) ?? topLevelById.get(id);
      return item !== undefined && meta.appliesTo(item);
    });
    if (applicableIds.length === 0) continue;
    const resolved = resolveBulkShiftOps(program.milestones, program.topLevelItems, [
      { selector: { kind: "ids", ids: applicableIds }, deltaDays: op.deltaDays, reason: "bulk edit" },
    ]);
    patchOps.push(...resolved.patchOps);
    topLevelItemOps.push(...resolved.topLevelItemOps);
  }

  const cascaded = applyCascade(program.milestones, patchOps);
  let milestones = applyOps(program.milestones, cascaded);
  milestones = milestones.map((m) => {
    if (!laneReassignments.has(m.id) && !laneRowAssignments.has(m.id) && !milestoneStylePatches.has(m.id)) return m;
    let next = m;
    if (laneReassignments.has(m.id)) next = { ...next, laneId: laneReassignments.get(m.id)! };
    if (laneRowAssignments.has(m.id)) next = { ...next, laneRow: laneRowAssignments.get(m.id)! };
    if (milestoneStylePatches.has(m.id)) next = { ...next, styleOverride: { ...next.styleOverride, ...milestoneStylePatches.get(m.id)! } };
    return next;
  });

  let topLevelItems = applyTopLevelItemOps(program.topLevelItems, topLevelItemOps);
  topLevelItems = topLevelItems.map((t) => {
    if (t.type === "annotation" || !topLevelStylePatches.has(t.id)) return t;
    return { ...t, styleOverride: { ...t.styleOverride, ...topLevelStylePatches.get(t.id)! } };
  });

  return applyBulkDelete({ ...program, milestones, topLevelItems }, deleteIds);
}

/** Current value of one bulk-patchable field on an item, for preview before/after formatting — mirrors currentFieldValue's counterpart in applyBulkPatchToProgram's own field routing, kept separate since preview needs to READ a value where apply only needs to WRITE one. */
function currentFieldValue(item: Milestone | TopLevelItem, field: BulkPatchField): string | number | boolean | undefined {
  if (isTopLevelItem(item)) {
    switch (field) {
      case "status":
        return item.type === "annotation" ? undefined : item.status;
      case "date":
        return item.type === "phase" ? item.startDate : item.date;
      case "endDate":
        return item.type === "phase" ? item.endDate : undefined;
      case "laneId":
      case "laneRow":
        return undefined;
      default:
        return item.type === "annotation" ? undefined : item.styleOverride?.[styleOverrideKey(field)];
    }
  }
  switch (field) {
    case "status":
      return item.status;
    case "laneId":
      return item.laneId;
    case "laneRow":
      return item.laneRow ?? 1;
    case "date":
      return item.date;
    case "endDate":
      return item.endDate;
    default:
      return item.styleOverride?.[styleOverrideKey(field)];
  }
}

/** The value a field would resolve to AFTER applying `op` — delta-days fields compute from the item's own current value; every other field is just `op.value`. */
function nextFieldValue(item: Milestone | TopLevelItem, op: BulkPatchOp): string | number | boolean | undefined {
  if (op.field === "date" || op.field === "endDate") {
    const before = currentFieldValue(item, op.field) as string | undefined;
    return before ? addDays(before, op.deltaDays) : undefined;
  }
  return op.value;
}

function formatValue(field: BulkPatchField, value: string | number | boolean | undefined, laneNameById: ReadonlyMap<string, string>): string {
  if (value === undefined) return "";
  if (field === "laneId" && typeof value === "string") return laneNameById.get(value) ?? value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Preview rows for DiffBanner (the generalized replacement for the old
 * `buildBulkEditPreview`) — one "update" entry per selected item×field
 * combination that would actually change (an item already at the target
 * value, or one the field doesn't apply to, contributes nothing, same
 * "skip, don't show a no-op row" behavior the old per-kind preview had),
 * built from `BULK_PATCH_FIELD_META`'s label instead of a per-`kind` branch
 * chain, plus one "remove" entry per delete id.
 */
export function buildBulkPatchPreview(program: Program, ops: readonly { op: BulkPatchOp; ids: readonly string[] }[], deleteIds: readonly string[]): DiffEntry[] {
  const milestoneById = new Map(program.milestones.map((m) => [m.id, m]));
  const topLevelById = new Map(program.topLevelItems.map((t) => [t.id, t]));
  const laneNameById = new Map(program.swimlanes.map((l) => [l.id, l.name]));
  const entries: DiffEntry[] = [];

  function laneDetail(item: Milestone | TopLevelItem): string | undefined {
    return isTopLevelItem(item) ? undefined : laneNameById.get(item.laneId);
  }

  for (const { op, ids } of ops) {
    const meta = BULK_PATCH_FIELD_META[op.field];
    for (const id of ids) {
      const item = milestoneById.get(id) ?? topLevelById.get(id);
      if (!item || !meta.appliesTo(item)) continue;
      const before = currentFieldValue(item, op.field);
      const after = nextFieldValue(item, op);
      if (before === after) continue;
      entries.push({
        id,
        kind: "update",
        title: item.title,
        detail: laneDetail(item),
        fieldChanges: [{ field: meta.label, before: formatValue(op.field, before, laneNameById), after: formatValue(op.field, after, laneNameById) }],
      });
    }
  }

  for (const id of deleteIds) {
    const item = milestoneById.get(id) ?? topLevelById.get(id);
    if (!item) continue;
    entries.push({ id, kind: "remove", title: item.title, detail: laneDetail(item) });
  }

  return entries;
}
