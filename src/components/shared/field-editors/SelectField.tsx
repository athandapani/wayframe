"use client";

// Generic labeled `<select>` (wayframe#t33's field-editor extraction) —
// the shape MilestoneEditorInspector.tsx's AppearanceBody already used for
// Phase shape/Phase size (label span + select, both driven off a plain
// {value,label} option list). Also backs StatusSelect/PhaseShapeSelect/
// PhaseSizeSelect below rather than each hand-rolling its own <select>.
//
// `placeholder` switches this into an "uncommitted picker" mode (value can
// be `""`, a disabled placeholder option renders first, `onChange` only
// ever fires with a real option value) — SelectionToolbar's bulk
// value-editor needs this (there's no meaningful "current value" across a
// mixed selection, so the control starts blank and only fires once the
// viewer actually picks something); MilestoneEditorInspector's single-item
// controls never pass it, so their behavior/DOM is unchanged.
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder,
  selectClassName = "w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-600",
  ariaLabel,
}: {
  label?: string;
  value: T | "";
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  placeholder?: string;
  selectClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <>
      {label && <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>}
      <select
        aria-label={ariaLabel}
        className={selectClassName}
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value as T);
        }}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}
