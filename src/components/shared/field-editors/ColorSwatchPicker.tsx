"use client";

// Fixed color-swatch row (wayframe#t33's field-editor extraction) — pulled
// out of MilestoneEditorInspector.tsx's AppearanceBody verbatim. `resolvedValue`
// (the extra trailing reference swatch showing "currently resolved color")
// is optional: MilestoneEditorInspector always has one (resolveMarkerColor never
// fails to resolve something), SelectionToolbar's bulk value-editor has no
// single resolved color across a mixed selection, so it simply omits it.
export const DEFAULT_COLOR_SWATCHES = ["#cf222e", "#b5791f", "#1a7f37", "#0969da", "#8250df", "#57606a"];

export function ColorSwatchPicker({
  label,
  value,
  onChange,
  swatches = DEFAULT_COLOR_SWATCHES,
  resolvedValue,
}: {
  label?: string;
  value: string | undefined;
  onChange: (color: string) => void;
  swatches?: string[];
  /** The color actually in effect right now, if there is a single one to show — renders one extra non-interactive reference swatch. */
  resolvedValue?: string;
}) {
  return (
    <>
      {label && <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>}
      <div className="flex flex-wrap items-center gap-1.5">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => onChange(c)}
            style={{ background: c }}
            className={`h-5 w-5 rounded ${value === c ? "outline outline-2 outline-offset-1 outline-emerald-500" : "border border-black/10"}`}
          />
        ))}
        {resolvedValue && <span className="ml-1 h-5 w-5 rounded border border-black/10" style={{ background: resolvedValue }} title="Currently resolved color" />}
      </div>
    </>
  );
}
