// Mass-edit / bulk multi-select — the generic field-patch data model
// (wayframe#t33). Replaces the old closed 4-op `BulkEditOp` union
// (apply.ts's previous shape: shift/status/lane/acceptBaseline, each with
// its own hand-written builder) with one field-addressed op shape covering
// every bulk-patchable field on a Milestone or a Program-band TopLevelItem
// (the "milestone"/"phase" variants — never "annotation", which has no
// status/styleOverride/laneId/laneRow concept at all).
//
// Accept-baseline stays OUTSIDE this model entirely (t33's own gist): it has
// no "set field to value" shape, it's a bare "clear originalDate", so it
// keeps riding its existing dedicated AcceptBaselineOp/applyAcceptBaselineOps
// path, same as today.
//
// Applicability research (this ticket's own process requirement — verified
// against real code, not assumed from the StyleOverride doc comment alone):
//   - MilestoneEditorInspector.tsx's AppearanceBody is the authoritative source
//     for the Milestone-side ladder: every StyleOverride control is always
//     shown, but an amber banner (`hasEndDate` branch) states that once a
//     Milestone becomes a duration pill (`endDate` set), marker shape/scale,
//     font scale, both label positions, color, and hidden stop having any
//     on-chart effect — only phaseShape/phaseSize (the "Phase-only" subgroup,
//     also gated on `hasEndDate`) do.
//   - Cross-checked against RoadmapTimeline.tsx's actual render blocks:
//     - The in-lane duration-pill block (`data.milestones.filter(m =>
//       m.endDate...)`, ~line 2903) calls ONLY resolvePhaseSize/
//       resolvePhaseShape — no resolveHidden, resolveFontScale,
//       resolveMarkerShape/Scale, resolveMarkerColor, or either label-
//       position resolver. Confirms the modal's amber banner exactly.
//     - The point-Milestone marker (MilestoneGlyph/MilestoneChips, ~line
//       1050/1246) calls every one of those ladder functions. Confirms the
//       modal's un-bannered default state.
//   - The PROGRAM-band TopLevelItem render block (`data.topLevelItems.map`,
//     ~line 2480) does NOT match the ticket's own working summary ("markerShape/
//     markerScale/color only have real effect on Milestone") — verified
//     wrong for markerShape/markerScale, right for color:
//     - "phase" variant (~line 2482): calls resolveHidden, resolvePhaseSize,
//       resolvePhaseShape, resolveFontScale. Fill is hardcoded
//       `theme.statusColor[t.status]`, never resolveMarkerColor — color does
//       NOT apply. No marker shape/scale concept (phase has none). No label-
//       position resolver call — neither label-position field applies.
//     - "milestone" variant (~line 2548): calls resolveHidden,
//       resolveMarkerShape (dispatches CushionMarker's shape, a real visual
//       difference — verified against CushionMarker's own switch), resolveMarkerScale
//       (feeds the marker radius), resolveFontScale, resolveTitleLabelPosition
//       (feeds the title text's position) — ALL real effects. No date text is
//       ever rendered for this variant, so dateLabelPosition has nothing to
//       affect. Fill is hardcoded `theme.statusColor[t.status]` — color does
//       NOT apply here either.
//     - "annotation" variant has no `styleOverride` field on the type at all
//       — nothing in this module ever applies to it (also moot in practice:
//       tree.ts keeps annotation non-selectable, so no bulk-edit id list can
//       ever contain one).
import type { LabelPosition, Milestone, MarkerShape, PhaseShape, PhaseSize, Status, StyleOverride, TopLevelItem } from "@/components/timeline/types";

/** Discriminant of every field a bulk patch can target. `styleOverride.*` fields are namespaced to read unambiguously next to the flat entity fields (`status`/`laneId`/`laneRow`/`date`/`endDate`) without a second lookup table. */
export type BulkPatchField =
  | "status"
  | "laneId"
  | "laneRow"
  | "date"
  | "endDate"
  | "styleOverride.markerShape"
  | "styleOverride.markerScale"
  | "styleOverride.fontScale"
  | "styleOverride.titleLabelPosition"
  | "styleOverride.dateLabelPosition"
  | "styleOverride.hidden"
  | "styleOverride.color"
  | "styleOverride.phaseShape"
  | "styleOverride.phaseSize";

/**
 * One field, one new value, across whichever selected ids that field
 * applies to (see `appliesTo` on `BULK_PATCH_FIELD_META` — an id whose item
 * fails the check is silently skipped by `applyBulkPatchToProgram`, never an
 * error). `date`/`endDate` stay delta-based (`deltaDays`), not an absolute
 * `newValue` — mirrors the AI-correction path's own bulkShiftOps
 * (wayframe#57), the same "model/caller names a selector + one deltaDays,
 * never enumerates per-item absolute dates" reasoning.
 *
 * `date` shifts the item's own PRIMARY date field (Milestone.date /
 * TopLevelItem-milestone.date / TopLevelItem-phase.startDate) — for a
 * Milestone this couples `endDate` along for the ride when one is set (and a
 * phase's `startDate`+`endDate` shift together too), exactly mirroring
 * resolveBulkShiftOps's existing, unmodified behavior (bulk-shift.ts) — the
 * whole item moves, preserving its span. `endDate` is a DIFFERENT,
 * independent op: it resizes just the end edge (Milestone.endDate once set,
 * or a TopLevelItem-phase's endDate) without touching the start — new to
 * this ticket (resolveBulkShiftOps has no such independent-edge mode; see
 * apply.ts's own doc for why this one small piece isn't routed through it).
 */
export type BulkPatchOp =
  | { field: "status"; value: Status }
  | { field: "laneId"; value: string }
  | { field: "laneRow"; value: number }
  | { field: "date"; deltaDays: number }
  | { field: "endDate"; deltaDays: number }
  | { field: "styleOverride.markerShape"; value: MarkerShape }
  | { field: "styleOverride.markerScale"; value: number }
  | { field: "styleOverride.fontScale"; value: number }
  | { field: "styleOverride.titleLabelPosition"; value: LabelPosition }
  | { field: "styleOverride.dateLabelPosition"; value: LabelPosition }
  | { field: "styleOverride.hidden"; value: boolean }
  | { field: "styleOverride.color"; value: string }
  | { field: "styleOverride.phaseShape"; value: PhaseShape }
  | { field: "styleOverride.phaseSize"; value: PhaseSize };

/** Which value-editor widget a future "Set property…" dropdown (fork 2, SelectionToolbar.tsx) should show once a field is chosen — metadata only, no UI built here. */
export type BulkPatchEditorKind = "select" | "color" | "number-slider" | "shape-grid" | "checkbox" | "position" | "delta-days";

export interface BulkPatchFieldMeta {
  /** Human label for a future field-picker dropdown. */
  label: string;
  editorKind: BulkPatchEditorKind;
  /** Whether this field has any real effect on the given item — see this file's top doc for the research behind every verdict below. Skipped (not an error) by applyBulkPatchToProgram/buildBulkPatchPreview when false. */
  appliesTo: (item: Milestone | TopLevelItem) => boolean;
}

/** True for a Program-band item (has a `type` discriminant); false for a lane Milestone (never has one). The one structural difference between the two `appliesTo` params need to branch on. */
export function isTopLevelItem(item: Milestone | TopLevelItem): item is TopLevelItem {
  return "type" in item;
}

/** A duration-pill Milestone (`endDate` set) — point Milestones never stack/never render as a span, per `Milestone.laneRow`'s own doc in types.ts. */
function isDurationPillMilestone(item: Milestone): boolean {
  return Boolean(item.endDate);
}

export const BULK_PATCH_FIELD_META: Record<BulkPatchField, BulkPatchFieldMeta> = {
  status: {
    label: "Status",
    editorKind: "select",
    // Required field on Milestone and on both non-annotation TopLevelItem
    // variants; annotation has no status field at all (types.ts).
    appliesTo: (item) => !isTopLevelItem(item) || item.type !== "annotation",
  },
  laneId: {
    label: "Lane",
    editorKind: "select",
    // Milestone-only — TopLevelItems live in the Program band, not a lane
    // (no laneId field on the type at all).
    appliesTo: (item) => !isTopLevelItem(item),
  },
  laneRow: {
    label: "Lane row",
    editorKind: "select",
    // Milestone-only, and only meaningful once it's a duration pill
    // (`endDate` set) — a point milestone never stacks, so a row assignment
    // on one is inert (Milestone.laneRow's own doc; MilestoneEditorInspector
    // only ever shows the Lane row control when `draft.endDate` is set).
    appliesTo: (item) => !isTopLevelItem(item) && isDurationPillMilestone(item),
  },
  date: {
    label: "Date",
    editorKind: "delta-days",
    // Every shiftable entity has a primary date concept (Milestone.date,
    // TopLevelItem-milestone.date, TopLevelItem-phase.startDate,
    // TopLevelItem-annotation.date) — resolveBulkShiftOps already resolves
    // all four uniformly (bulk-shift.ts). Annotation is included for
    // correctness (it genuinely does shift), though it's moot in practice:
    // tree.ts never makes an annotation selectable, so no real id list can
    // contain one.
    appliesTo: () => true,
  },
  endDate: {
    label: "End date",
    editorKind: "delta-days",
    // Only an entity that actually HAS an end edge: a duration-pill
    // Milestone, or a TopLevelItem-phase (whose endDate is a required
    // field, always present). Never a point Milestone, TopLevelItem-
    // milestone, or annotation — none has an endDate concept.
    appliesTo: (item) => (isTopLevelItem(item) ? item.type === "phase" : isDurationPillMilestone(item)),
  },
  "styleOverride.markerShape": {
    label: "Marker shape",
    editorKind: "shape-grid",
    // Real rendering effect only on a point Milestone (CushionMarker's
    // `shape` prop, MilestoneGlyph) and a TopLevelItem "milestone" (same
    // CushionMarker dispatch, RoadmapTimeline.tsx ~line 2551) — NOT a
    // duration-pill Milestone (no CushionMarker there, only
    // resolvePhaseShape/Size) and NOT a TopLevelItem "phase" (no marker
    // concept at all, it's a rect pill).
    appliesTo: (item) => (isTopLevelItem(item) ? item.type === "milestone" : !isDurationPillMilestone(item)),
  },
  "styleOverride.markerScale": {
    label: "Marker scale",
    editorKind: "number-slider",
    appliesTo: (item) => (isTopLevelItem(item) ? item.type === "milestone" : !isDurationPillMilestone(item)),
  },
  "styleOverride.fontScale": {
    label: "Font scale",
    editorKind: "number-slider",
    // Applies to a point Milestone and BOTH non-annotation TopLevelItem
    // variants (each calls resolveFontScale for its own label text) — but
    // NOT a duration-pill Milestone (its pill label uses a fixed font size,
    // no resolveFontScale call in that render block).
    appliesTo: (item) => (isTopLevelItem(item) ? item.type !== "annotation" : !isDurationPillMilestone(item)),
  },
  "styleOverride.titleLabelPosition": {
    label: "Title label position",
    editorKind: "position",
    // Point Milestone and TopLevelItem "milestone" only — a TopLevelItem
    // "phase" never calls resolveTitleLabelPosition (fixed label
    // placement), and neither does a duration-pill Milestone.
    appliesTo: (item) => (isTopLevelItem(item) ? item.type === "milestone" : !isDurationPillMilestone(item)),
  },
  "styleOverride.dateLabelPosition": {
    label: "Date label position",
    editorKind: "position",
    // Point Milestone ONLY — the only render path that ever shows a
    // separate date label. TopLevelItem "milestone" never renders its date
    // at all in the Program band (title only), so this has nothing to move.
    appliesTo: (item) => !isTopLevelItem(item) && !isDurationPillMilestone(item),
  },
  "styleOverride.hidden": {
    label: "Hidden",
    editorKind: "checkbox",
    // Point Milestone and both non-annotation TopLevelItem variants all
    // call resolveHidden and suppress rendering on it — but a duration-pill
    // Milestone's own render filter never calls resolveHidden at all, so
    // hiding one via this field would currently be a silent no-op there.
    appliesTo: (item) => (isTopLevelItem(item) ? item.type !== "annotation" : !isDurationPillMilestone(item)),
  },
  "styleOverride.color": {
    label: "Color",
    editorKind: "color",
    // Point Milestone ONLY — resolveMarkerColor (the only consumer of
    // styleOverride.color) is never called for a duration-pill Milestone
    // (lane-tint fill instead) or for either TopLevelItem variant
    // (hardcoded theme.statusColor[status] fill in both).
    appliesTo: (item) => !isTopLevelItem(item) && !isDurationPillMilestone(item),
  },
  "styleOverride.phaseShape": {
    label: "Phase shape",
    editorKind: "select",
    // The phase-shaped items: a duration-pill Milestone (MilestoneEditorInspector's
    // "Phase-only" subgroup, gated on `hasEndDate`) and a TopLevelItem
    // "phase" — never a point Milestone or TopLevelItem "milestone", which
    // have no phase geometry to shape.
    appliesTo: (item) => (isTopLevelItem(item) ? item.type === "phase" : isDurationPillMilestone(item)),
  },
  "styleOverride.phaseSize": {
    label: "Phase size",
    editorKind: "select",
    appliesTo: (item) => (isTopLevelItem(item) ? item.type === "phase" : isDurationPillMilestone(item)),
  },
};

/** Every field key, in the table's own declaration order — for a future dropdown to iterate without hand-duplicating the list. */
export const BULK_PATCH_FIELDS = Object.keys(BULK_PATCH_FIELD_META) as BulkPatchField[];

// Re-exported so a caller building a field-picker dropdown doesn't need a
// second import from timeline/types.ts just for the value-editor's own
// option types.
export type { StyleOverride };
