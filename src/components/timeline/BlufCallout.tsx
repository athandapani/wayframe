// Dismissible "so what" callout rendering the roadmap's bluf field
// (bottom-line-up-front statement + supporting bullets). Controlled
// (wayframe#31) rather than self-managed state, so its own inline
// dismiss/reopen affordance and the options-menu toggle share one source
// of truth instead of drifting out of sync.
//
// Draggable, because it floats over the chart: wherever it defaults to, it
// covers *something*, and which milestones that is depends on the document.
// Position is a viewer preference on its own localStorage key — it's about
// how one person wants to read the chart, not about the roadmap, so it
// doesn't belong in the document or in the undo stack.
"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { Theme } from "./theme";

const STORAGE_KEY = "wayframe:bluf-position";

interface Position {
  x: number;
  y: number;
}

/** Offsets from the container's top-right corner, matching the default layout. */
const DEFAULT_POSITION: Position = { x: 0, y: 0 };

function isPosition(v: unknown): v is Position {
  return typeof v === "object" && v !== null && typeof (v as Position).x === "number" && typeof (v as Position).y === "number";
}

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
  // useReducer rather than useState: reading persisted position has to
  // happen after mount (localStorage doesn't exist during SSR), and a bare
  // setState in an effect is the pattern react-hooks warns about. Same
  // shape as use-ghost-mode and the other viewer-preference hooks.
  const [pos, setPos] = useReducer((_: Position, next: Position) => next, DEFAULT_POSITION);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origin: Position } | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
      if (isPosition(saved)) setPos(saved);
    } catch {
      // Corrupt or inaccessible storage — stay at the default corner.
    }
  }, []);

  function persist(next: Position) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing or a full quota — the panel still moved this session.
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    // Buttons inside the header keep working: they stop propagation.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pos };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d) return;
    setPos({ x: d.origin.x + (e.clientX - d.startX), y: d.origin.y + (e.clientY - d.startY) });
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    persist(pos);
  }

  // Right/top anchored so the default position is unchanged; the drag offset
  // moves it from there. x grows leftward because the anchor is the right edge.
  const anchor: React.CSSProperties = {
    position: "absolute",
    top: 64 + pos.y,
    right: 16 - pos.x,
    zIndex: 20,
  };
  const surface = { background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk };

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        style={{ ...anchor, ...surface, borderWidth: 1 }}
        className="rounded-full border px-3 py-1 text-xs font-semibold shadow"
      >
        So what?
      </button>
    );
  }

  return (
    <div style={{ ...anchor, ...surface, borderWidth: 1 }} className="w-72 rounded-lg border p-3 text-xs shadow-lg">
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={"mb-1 flex items-start justify-between gap-2 " + (dragging ? "cursor-grabbing" : "cursor-grab")}
        title="Drag to move"
      >
        <span className="font-bold tracking-wide uppercase select-none" style={{ color: theme.accent }}>
          So what
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {(pos.x !== 0 || pos.y !== 0) && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                setPos(DEFAULT_POSITION);
                persist(DEFAULT_POSITION);
              }}
              className="text-[10px] opacity-60 hover:opacity-100"
              aria-label="Reset position"
            >
              Reset
            </button>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onOpenChange(false)}
            className="leading-none opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
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
