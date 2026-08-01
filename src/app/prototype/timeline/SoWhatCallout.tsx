// PROTOTYPE — "so what" callout: the schema already carries a bluf field
// (bottom-line-up-front) for exactly this, but nothing rendered it. Shared
// across all three variants since it's decorative chrome, not part of the
// SVG/D3/Canvas rendering-approach question.
"use client";

import { useState } from "react";
import { bluf } from "./demo-data";

export function SoWhatCallout() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-4 right-4 z-20 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 shadow dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      >
        So what?
      </button>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-20 w-72 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">So what</span>
        <button onClick={() => setOpen(false)} className="leading-none text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-100" aria-label="Dismiss">
          ×
        </button>
      </div>
      <p className="mb-2 font-medium">{bluf.statement}</p>
      <ul className="list-disc space-y-1 pl-4">
        {bluf.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}
