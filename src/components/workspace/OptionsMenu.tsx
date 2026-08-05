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
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
        className="rounded-full border px-3 py-1.5 text-sm shadow"
      >
        ☰
      </button>
      {open && (
        <div
          style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
          className="absolute top-full right-0 z-50 mt-2 w-72 space-y-3 rounded-xl border p-3 text-sm shadow-xl"
        >
          {children}
        </div>
      )}
    </div>
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
