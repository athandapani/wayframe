"use client";

// Marker-shape swatch grid (wayframe#t33's field-editor extraction) —
// pulled out of MilestoneEditorModal.tsx's AppearanceBody verbatim. Draws
// each shape through the REAL CushionMarker geometry (same reasoning as the
// modal's live preview rail: never re-guess what the chart draws).
//
// Two independent highlight states, both optional so a caller with no
// "current resolved value" concept (SelectionToolbar's bulk value-editor —
// there's no single resolved shape across a mixed selection) can render a
// plain, nothing-pre-selected grid:
//   - `resolvedValue` (defaults to `value`): which shape is actually in
//     effect right now (override or fallback) — a light "selected" ring.
//   - `value`: the EXPLICIT override, if any — the stronger violet ring,
//     distinguishing "this is what's overridden" from "this is just what's
//     currently showing."
import type { MarkerShape } from "@/components/timeline/types";
import { CushionMarker } from "@/components/timeline/RoadmapTimeline";

export const MARKER_SHAPES: MarkerShape[] = ["diamond", "star", "flag", "square", "rectangle", "circle"];

export function MarkerShapePicker({
  label,
  value,
  resolvedValue = value,
  onChange,
  shapes = MARKER_SHAPES,
}: {
  label?: string;
  value: MarkerShape | undefined;
  resolvedValue?: MarkerShape;
  onChange: (shape: MarkerShape) => void;
  shapes?: MarkerShape[];
}) {
  return (
    <>
      {label && <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>}
      <div className="flex flex-wrap gap-1.5">
        {shapes.map((shape) => {
          const selected = resolvedValue === shape;
          const isOverride = value === shape;
          return (
            <button
              key={shape}
              type="button"
              title={shape}
              aria-label={`Marker shape: ${shape}`}
              onClick={() => onChange(shape)}
              className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                isOverride
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-950"
                  : selected
                    ? "border-zinc-400 bg-zinc-100 dark:bg-zinc-800"
                    : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-600"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 overflow-visible">
                <CushionMarker cx={12} cy={12} r={8} shape={shape} fill="#57606a" stroke="none" strokeWidth={0} />
              </svg>
            </button>
          );
        })}
      </div>
    </>
  );
}
