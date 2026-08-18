"use client";

// Small ±N-days input for SelectionToolbar's "Shift dates…" action —
// deliberately tiny, mirrors OptionsMenu's inline-confirm
// idioms rather than a full modal: the only thing it needs from the viewer
// is one signed integer.
import { useState } from "react";

export function ShiftDatePopover({ onPreview, onCancel }: { onPreview: (deltaDays: number) => void; onCancel: () => void }) {
  const [value, setValue] = useState("7");
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && Number.isInteger(parsed) && parsed !== 0;

  return (
    <span className="flex items-center gap-1.5">
      <input
        autoFocus
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid) onPreview(parsed);
          if (e.key === "Escape") onCancel();
        }}
        aria-label="Days to shift (negative = earlier)"
        className="w-16 rounded border border-zinc-300 bg-transparent px-1.5 py-0.5 text-xs dark:border-zinc-600"
      />
      <span className="text-[11px] opacity-60">days</span>
      <button onClick={() => valid && onPreview(parsed)} disabled={!valid} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40">
        Preview
      </button>
      <button onClick={onCancel} className="text-[11px] opacity-60 hover:opacity-100">
        Cancel
      </button>
    </span>
  );
}
