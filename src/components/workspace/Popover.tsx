"use client";

// The dismissal shell every top-strip control that opens a panel shares
// (wayframe#149 follow-up): trigger, open/close, outside-pointer and Escape
// dismissal, and nothing else. Lifted out of OptionsMenu — which was already
// exactly this, with its own hamburger welded on — when the top strip grew
// two more of them (the timeframe controls and the account chip), because
// three hand-rolled copies of "close when you click somewhere else" is how
// one of them ends up not closing.
//
// Content-agnostic on purpose: the caller owns what the trigger looks like
// and what the panel contains.
import { useEffect, useRef, useState } from "react";

export function Popover({
  label,
  title,
  trigger,
  triggerClassName,
  panelClassName = "w-72",
  children,
}: {
  /** Accessible name for the trigger — also what a test looks it up by. */
  label: string;
  title?: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** Sizing for the panel; it is always right-aligned under the trigger. */
  panelClassName?: string;
  children: React.ReactNode;
}) {
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
        aria-label={label}
        title={title ?? label}
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
        className={triggerClassName ?? "rounded-full border px-3 py-1.5 text-sm shadow"}
      >
        {trigger}
      </button>
      {open && (
        <div
          style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
          className={`absolute top-full right-0 z-50 mt-2 space-y-3 rounded-xl border p-3 text-sm shadow-xl ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
