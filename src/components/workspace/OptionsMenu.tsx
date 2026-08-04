"use client";

// Generic hamburger dropdown shell (wayframe#31) — the nav shell
// CorrectionBoxSwitcher's own comment anticipated back in #14 ("an
// acceptable stand-in until that nav shell exists"). Deliberately content-
// agnostic: RoadmapWorkspace composes whatever settings-like controls
// belong inside as children; this component only owns open/close, the
// trigger, and outside-click/Escape dismissal.
import { useEffect, useRef, useState } from "react";

export function OptionsMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Options"
        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow dark:border-zinc-600 dark:bg-zinc-900"
      >
        ☰
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-2 w-72 space-y-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          {children}
        </div>
      )}
    </div>
  );
}

export function OptionsMenuRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}
