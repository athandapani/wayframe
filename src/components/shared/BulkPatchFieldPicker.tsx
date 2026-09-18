"use client";

// The "Set property…" field-dropdown + field-appropriate value editor
// (wayframe#t33) — extracted out of SelectionToolbar.tsx (fork 2's original
// home for this UI) so a second bulk-edit surface (the cross-Program
// toolbar on the All-Programs page, fork 3) can reuse it instead of
// duplicating SelectionToolbar's private `FieldValueEditor` switch and
// "available fields for this selection" filter a third time — the same
// "one shared builder... replaces four hand-written pairs" principle t33's
// own gist already applies to the apply/preview functions in
// lib/bulk-edit/apply.ts.
//
// Deliberately entity-agnostic: takes `selectedItems` (Milestone |
// TopLevelItem, already resolved by the caller — a single-Program caller
// resolves them against its own Program.milestones/topLevelItems, a
// cross-Program caller resolves each against whichever Program a
// namespaced id's local half belongs to) rather than a whole `Program`, so
// this component never needs to know whether the selection came from one
// Program or many.
//
// `laneId`/`laneRow` are the one field pair with a Program-specific option
// list (the Swimlanes to move into, or the max existing lane row) — every
// other field's value editor is fully generic. A caller with no coherent
// "which Program's lanes" answer (the cross-Program toolbar) passes
// `excludeFields={["laneId", "laneRow"]}` and can omit `getLaneOptions`
// entirely; a single-Program caller (SelectionToolbar) passes no
// `excludeFields` and supplies `getLaneOptions` so those two fields keep
// working exactly as before this extraction.
import { useState } from "react";
import type { Milestone, TopLevelItem } from "@/components/timeline/types";
import { BULK_PATCH_FIELDS, BULK_PATCH_FIELD_META, type BulkPatchField, type BulkPatchOp } from "@/lib/bulk-edit/apply";
import { ShiftDatePopover } from "@/components/workspace/ShiftDatePopover";
import { StatusSelect } from "@/components/shared/field-editors/StatusSelect";
import { SelectField } from "@/components/shared/field-editors/SelectField";
import { LaneRowSelect } from "@/components/shared/field-editors/LaneRowSelect";
import { MarkerShapePicker } from "@/components/shared/field-editors/MarkerShapePicker";
import { ColorSwatchPicker } from "@/components/shared/field-editors/ColorSwatchPicker";
import { LabelPositionPicker } from "@/components/shared/field-editors/LabelPositionPicker";
import { PhaseShapeSelect } from "@/components/shared/field-editors/PhaseShapeSelect";
import { PhaseSizeSelect } from "@/components/shared/field-editors/PhaseSizeSelect";
import { RangeSlider } from "@/components/shared/field-editors/RangeSlider";
import { CheckboxField } from "@/components/shared/field-editors/CheckboxField";

const CANCEL_CLASS = "text-[11px] opacity-60 hover:opacity-100";
const SET_BUTTON_CLASS = "rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white";

/** The lane option list `laneId`/`laneRow` need — Program-specific, so a caller that excludes both fields (any cross-Program surface) never has to supply this. */
export interface BulkPatchLaneOptions {
  lanes: readonly { id: string; name: string }[];
  maxLaneRow: number;
}

/**
 * The value editor for one chosen `BulkPatchField` — unchanged in behavior
 * from fork 2's original (now-removed) `SelectionToolbar.tsx` internal
 * copy, just parameterized on `getLaneOptions` instead of a whole `Program`
 * for the two lane-dependent fields. Two commit conventions (see each
 * case): a discrete choice commits immediately on change; a continuous or
 * ambiguous-default input needs an explicit commit step.
 */
function FieldValueEditor({
  field,
  getLaneOptions,
  onCommit,
  onCancel,
}: {
  field: BulkPatchField;
  getLaneOptions?: () => BulkPatchLaneOptions;
  onCommit: (op: BulkPatchOp) => void;
  onCancel: () => void;
}) {
  const meta = BULK_PATCH_FIELD_META[field];
  const [numberDraft, setNumberDraft] = useState(1);
  const [hiddenDraft, setHiddenDraft] = useState(false);

  switch (field) {
    case "status":
      return (
        <>
          <StatusSelect value="" placeholder="Set status to…" ariaLabel="Set status to" onChange={(value) => onCommit({ field, value })} />
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
    case "laneId": {
      const { lanes } = getLaneOptions?.() ?? { lanes: [], maxLaneRow: 1 };
      return (
        <>
          <SelectField
            value=""
            placeholder="Move to lane…"
            ariaLabel="Move to lane"
            onChange={(value) => onCommit({ field, value })}
            options={lanes.map((l) => ({ value: l.id, label: l.name }))}
          />
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
    }
    case "laneRow": {
      const { maxLaneRow } = getLaneOptions?.() ?? { lanes: [], maxLaneRow: 1 };
      return (
        <>
          <LaneRowSelect value="" maxRow={maxLaneRow} placeholder="Move to lane row…" ariaLabel="Move to lane row" onChange={(value) => onCommit({ field, value })} />
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
    }
    case "date":
    case "endDate":
      return <ShiftDatePopover onPreview={(deltaDays) => onCommit({ field, deltaDays })} onCancel={onCancel} />;
    case "styleOverride.markerShape":
      return (
        <>
          <MarkerShapePicker value={undefined} onChange={(value) => onCommit({ field, value })} />
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
    case "styleOverride.markerScale":
    case "styleOverride.fontScale":
      return (
        <>
          <RangeSlider value={numberDraft} onChange={setNumberDraft} min={0.6} max={2} step={0.05} ariaLabel={meta.label} />
          <button onClick={() => onCommit({ field, value: numberDraft })} className={SET_BUTTON_CLASS}>
            Set
          </button>
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
    case "styleOverride.titleLabelPosition":
    case "styleOverride.dateLabelPosition":
      return (
        <>
          <LabelPositionPicker label={meta.label} value={undefined} onChange={(value) => onCommit({ field, value })} />
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
    case "styleOverride.hidden":
      return (
        <>
          <CheckboxField id="bulk-hidden" checked={hiddenDraft} onChange={setHiddenDraft} label={meta.label} />
          <button onClick={() => onCommit({ field, value: hiddenDraft })} className={SET_BUTTON_CLASS}>
            Set
          </button>
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
    case "styleOverride.color":
      return (
        <>
          <ColorSwatchPicker value={undefined} onChange={(value) => onCommit({ field, value })} />
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
    case "styleOverride.phaseShape":
      return (
        <>
          <PhaseShapeSelect value="" placeholder="Set phase shape to…" ariaLabel="Set phase shape to" onChange={(value) => onCommit({ field, value })} />
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
    case "styleOverride.phaseSize":
      return (
        <>
          <PhaseSizeSelect value="" placeholder="Set phase size to…" ariaLabel="Set phase size to" onChange={(value) => onCommit({ field, value })} />
          <button onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
        </>
      );
  }
}

/**
 * "Set property…" dropdown over every `BulkPatchField` that applies to at
 * least one of `selectedItems` (same "offering a field that applies to
 * none of the selection is a guaranteed no-op" reasoning fork 2 already
 * used) minus whatever `excludeFields` the caller rules out entirely, then
 * — once a field is chosen — the field's `FieldValueEditor`. Calls
 * `onCommit(op)` once a value is committed; the caller owns everything
 * after that (staging a preview, applying it, clearing selection, …), same
 * division of responsibility fork 2's `SelectionToolbar` already had
 * between itself and its (now-extracted) `FieldValueEditor`.
 */
export function BulkPatchFieldPicker({
  selectedItems,
  excludeFields,
  getLaneOptions,
  onCommit,
}: {
  selectedItems: readonly (Milestone | TopLevelItem)[];
  /** Fields to omit from the dropdown unconditionally, regardless of whether they'd otherwise apply to some of `selectedItems` — see this file's top doc on `laneId`/`laneRow`. */
  excludeFields?: readonly BulkPatchField[];
  /** Required only to offer `laneId`/`laneRow` — omit when `excludeFields` already rules both out. */
  getLaneOptions?: () => BulkPatchLaneOptions;
  onCommit: (op: BulkPatchOp) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fieldPicker, setFieldPicker] = useState<BulkPatchField | null>(null);

  const excluded = new Set(excludeFields ?? []);
  const availableFields = BULK_PATCH_FIELDS.filter(
    (field) => !excluded.has(field) && selectedItems.some((item) => BULK_PATCH_FIELD_META[field].appliesTo(item)),
  );
  const applicableCount = fieldPicker ? selectedItems.filter((item) => BULK_PATCH_FIELD_META[fieldPicker].appliesTo(item)).length : null;

  function commit(op: BulkPatchOp) {
    onCommit(op);
    setFieldPicker(null);
    setPickerOpen(false);
  }

  if (fieldPicker) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold opacity-70">{BULK_PATCH_FIELD_META[fieldPicker].label}:</span>
        <FieldValueEditor key={fieldPicker} field={fieldPicker} getLaneOptions={getLaneOptions} onCommit={commit} onCancel={() => setFieldPicker(null)} />
        {applicableCount !== null && applicableCount < selectedItems.length && (
          <span className="text-[11px] opacity-60">
            Applies to {applicableCount} of {selectedItems.length} selected
          </span>
        )}
      </span>
    );
  }

  if (pickerOpen) {
    return (
      <select
        autoFocus
        value=""
        onChange={(e) => {
          if (e.target.value) setFieldPicker(e.target.value as BulkPatchField);
        }}
        onBlur={() => setPickerOpen(false)}
        aria-label="Set property to"
        className="rounded-full border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
      >
        <option value="" disabled>
          Set property…
        </option>
        {availableFields.map((field) => (
          <option key={field} value={field}>
            {BULK_PATCH_FIELD_META[field].label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button onClick={() => setPickerOpen(true)} className="rounded-full border border-zinc-300 px-2.5 py-1 dark:border-zinc-600">
      Set property…
    </button>
  );
}
