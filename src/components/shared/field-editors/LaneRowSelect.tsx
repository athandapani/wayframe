"use client";

// Lane-row <select> (wayframe#t33's field-editor extraction) — pulled out
// of MilestoneEditorInspector.tsx's ModalForm verbatim (rows 1..maxRow plus a
// "+ New row" sentinel). `maxRow` is supplied by the caller — computing it
// (highest row currently used by same-lane duration-pill siblings, or,
// for SelectionToolbar's bulk editor, the Program-wide max) is entity-
// specific business logic that stays out of this control.
//
// `placeholder` mirrors SelectField's "uncommitted picker" mode (see its
// own doc) for SelectionToolbar's bulk value-editor; MilestoneEditorInspector's
// single-item control never passes it, so its behavior/DOM is unchanged.
export function LaneRowSelect({
  value,
  maxRow,
  onChange,
  allowNewRow = true,
  placeholder,
  ariaLabel,
}: {
  value: number | "";
  maxRow: number;
  onChange: (row: number) => void;
  allowNewRow?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
      value={value === "" ? "" : String(value)}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        onChange(v === "new" ? maxRow + 1 : Number(v));
      }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {Array.from({ length: maxRow }, (_, i) => i + 1).map((row) => (
        <option key={row} value={row}>
          {row === 1 ? "Row 1 (home)" : `Row ${row}`}
        </option>
      ))}
      {allowNewRow && <option value="new">+ New row</option>}
    </select>
  );
}
