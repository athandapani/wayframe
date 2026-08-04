// Dismissible "so what" callout rendering the roadmap's bluf field
// (bottom-line-up-front statement + supporting bullets). Controlled
// (wayframe#31) rather than self-managed state, so its own inline
// dismiss/reopen affordance and the options-menu toggle share one source
// of truth instead of drifting out of sync.
"use client";

export function BlufCallout({
  bluf,
  open,
  onOpenChange,
}: {
  bluf: { statement: string; bullets: string[] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        className="absolute top-16 right-4 z-20 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 shadow dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      >
        So what?
      </button>
    );
  }

  return (
    <div className="absolute top-16 right-4 z-20 w-72 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">So what</span>
        <button onClick={() => onOpenChange(false)} className="leading-none text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-100" aria-label="Dismiss">
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
