"use client";

// 3x3 compass label-position picker (wayframe#t33's field-editor
// extraction) — pulled out of MilestoneEditorModal.tsx's AppearanceBody
// `positionField` helper verbatim. Corners are never valid LabelPosition
// values, so they render as inert filler cells, same as the original.
//
// `resolvedValue` (defaults to `value`) is what actually gets highlighted —
// MilestoneEditorModal passes the real resolved position (with its own
// top/bottom fallback already applied) so the grid always shows "what's
// live," while SelectionToolbar's bulk value-editor has no single resolved
// position across a mixed selection and simply leaves it undefined (nothing
// highlighted until a value is chosen).
import type { LabelPosition } from "@/components/timeline/types";

const POSITION_LAYOUT: (LabelPosition | null)[] = [null, "top", null, "left", "inside", "right", null, "bottom", null];

export function LabelPositionPicker({
  label,
  value,
  resolvedValue = value,
  onChange,
}: {
  label?: string;
  value: LabelPosition | undefined;
  resolvedValue?: LabelPosition;
  onChange: (pos: LabelPosition) => void;
}) {
  return (
    <>
      {label && <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>}
      <div className="grid w-fit grid-cols-3 gap-1">
        {POSITION_LAYOUT.map((pos, i) =>
          pos === null ? (
            <div key={i} className="h-[26px] w-[26px]" />
          ) : (
            <button
              key={i}
              type="button"
              title={pos}
              aria-label={`${label ?? "Label position"}: ${pos}`}
              onClick={() => onChange(pos)}
              className={`flex h-[26px] w-[26px] items-center justify-center rounded border text-[9px] font-semibold ${
                resolvedValue === pos
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-600 dark:text-zinc-400"
              }`}
            >
              {pos[0].toUpperCase()}
            </button>
          ),
        )}
      </div>
    </>
  );
}
