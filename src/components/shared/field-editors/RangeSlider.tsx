"use client";

// Generic labeled numeric range control (wayframe#t33's field-editor
// extraction) — pulled out of MilestoneEditorInspector.tsx's AppearanceBody,
// where marker-scale and font-scale used byte-for-byte identical JSX (same
// 0.6-2/step 0.05 range, same "N.NNx" formatting), so one component now
// serves both call sites there plus SelectionToolbar's bulk value-editor
// for the same two fields. Contains ONLY the slider+readout row — no
// override/reset/source-tag chrome, which stays with whoever mounts this
// (that's entity-specific business logic, not this control's job).
export function RangeSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  ariaLabel,
  formatValue = (v) => `${v.toFixed(2)}x`,
}: {
  /** Optional heading rendered above the slider row — omit when the caller already renders its own label (e.g. a Section wrapper). */
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  ariaLabel?: string;
  formatValue?: (value: number) => string;
}) {
  return (
    <>
      {label && <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={ariaLabel}
          className="flex-1"
        />
        <span className="w-10 text-right font-mono text-[11px]">{formatValue(value)}</span>
      </div>
    </>
  );
}
