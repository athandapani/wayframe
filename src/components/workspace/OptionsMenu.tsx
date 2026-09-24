"use client";

// Generic hamburger dropdown shell (wayframe#31) — the nav shell
// CorrectionBoxSwitcher's own comment anticipated back in #14 ("an
// acceptable stand-in until that nav shell exists"). Deliberately content-
// agnostic: RoadmapWorkspace composes whatever settings-like controls
// belong inside as children.
//
// Open/close, outside-pointer and Escape dismissal now live in Popover.tsx,
// which this is the hamburger-shaped instance of — the top strip grew two
// more panels (timeframe, account) and they should all dismiss the same way.
import { Popover } from "./Popover";

export function OptionsMenu({ children }: { children: React.ReactNode }) {
  return (
    <Popover label="Options" trigger="☰">
      {children}
    </Popover>
  );
}

export function OptionsMenuRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="opacity-70">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Collapsible grouping for OptionsMenuRow children — the flat
 * row-per-setting list got long enough to need sections; this
 * wraps a group of existing rows under a named, independently
 * collapsible/expandable header rather than changing OptionsMenuRow itself.
 * Open/closed state is owned by the caller (see use-options-sections.ts) so
 * it persists per-viewer like every other display preference.
 */
export function OptionsMenuSection({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b pb-3 last:border-b-0 last:pb-0" style={{ borderColor: "var(--wf-border)" }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`options-section-${id}`}
        className="mb-2 flex w-full items-center justify-between text-left text-[11px] font-semibold tracking-wide uppercase opacity-70 hover:opacity-100"
      >
        {label}
        <span aria-hidden="true" className="inline-block transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
          ›
        </span>
      </button>
      {open && (
        <div id={`options-section-${id}`} className="space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
