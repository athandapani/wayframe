// Dismissible "so what" callout rendering the roadmap's bluf field
// (bottom-line-up-front statement + supporting bullets). Controlled
// (wayframe#31) rather than self-managed state, so its own inline
// dismiss/reopen affordance and the options-menu toggle share one source
// of truth instead of drifting out of sync.
"use client";

import type { Theme } from "./theme";

export function BlufCallout({
  bluf,
  open,
  onOpenChange,
  theme,
}: {
  bluf: { statement: string; bullets: string[] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Colours come from the active chart theme, not from the OS dark-mode
   * class (prototype/theme-system). Otherwise picking a dark chart theme
   * left this panel light — a dark chart floating on light chrome.
   */
  theme: Theme;
}) {
  const surface = { background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk };

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        style={{ ...surface, borderWidth: 1 }}
        className="absolute top-16 right-4 z-20 rounded-full border px-3 py-1 text-xs font-semibold shadow"
      >
        So what?
      </button>
    );
  }

  return (
    <div style={{ ...surface, borderWidth: 1 }} className="absolute top-16 right-4 z-20 w-72 rounded-lg border p-3 text-xs shadow-lg">
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="font-bold tracking-wide uppercase" style={{ color: theme.accent }}>
          So what
        </span>
        <button onClick={() => onOpenChange(false)} className="leading-none opacity-60 hover:opacity-100" aria-label="Dismiss">
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
