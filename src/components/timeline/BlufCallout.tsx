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
//
// Rich-text editing (wayframe#38 item 4 / #39) — promoted from Variant B of
// prototype/bluf-editing-and-formatting: no separate edit mode, the
// statement and each bullet are always live-editable (RichTextEditableLine)
// when `onEdit` is provided. Box size, unlike position, IS a document
// property (bluf.size) — a program owner sizing the box for "there's a lot
// to say this week" is a real editorial choice everyone opening the file
// should see, not a per-viewer preference. Omitting `onEdit` renders the
// callout read-only (sanitized static HTML) — used by the RoadmapTimeline
// dev preview and the off-screen export capture, neither of which has a
// document to write back into.
"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { Theme } from "./theme";
import { sanitizeBlufHtml } from "@/lib/rich-text/sanitize";
import { RichTextEditableLine } from "./RichTextEditableLine";

const STORAGE_KEY = "wayframe:bluf-position";
// Was 384/max-w-md (448px rendered) — read as oversized for a callout meant
// to float over the chart without covering it; shrunk down so it reads as a
// compact annotation by default. A document that's explicitly resized its
// box (bluf.size.width) always overrides this.
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 90;

interface Position {
  x: number;
  y: number;
}

interface BlufValue {
  statement: string;
  bullets: string[];
  label?: string;
  size?: { width: number; height: number | null };
}

const DEFAULT_LABEL = "So what";

/** Applies `transparency` (0 opaque .. 100 fully see-through) as an alpha channel on a `#rrggbb` hex color. */
function withAlpha(hex: string, transparency: number): string {
  const opacity = Math.max(0, Math.min(100, 100 - transparency)) / 100;
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

/** Offsets from the container's top-right corner, matching the default layout. */
const DEFAULT_POSITION: Position = { x: 0, y: 0 };

function isPosition(v: unknown): v is Position {
  return typeof v === "object" && v !== null && typeof (v as Position).x === "number" && typeof (v as Position).y === "number";
}

/**
 * Purely decorative — the whole header row is already the drag target (see
 * onPointerDown/Move/Up below). Without a visible affordance the only cue
 * was a `cursor-grab` on hover, which nobody notices before they've already
 * tried clicking around for a drag handle. A grip icon gives the eye
 * somewhere to land first.
 */
function DragHandleGlyph() {
  return (
    <svg viewBox="0 0 10 16" aria-hidden="true" className="mt-0.5 h-4 w-2.5 shrink-0 opacity-50">
      {[2, 8].map((cx) =>
        [2, 8, 14].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.3} fill="currentColor" />),
      )}
    </svg>
  );
}

function ResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      title="Drag to resize"
      className="absolute right-0.5 bottom-0.5 h-3 w-3 cursor-nwse-resize opacity-40 hover:opacity-90"
    >
      <svg viewBox="0 0 10 10" className="h-full w-full">
        <path d="M9 1 L1 9 M9 5 L5 9 M9 9 L9 9" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

export function BlufCallout({
  bluf,
  open,
  onOpenChange,
  theme,
  onEdit,
  fillColor,
  fillTransparency,
}: {
  bluf: BlufValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Colours come from the active chart theme, not from the OS dark-mode
   * class (prototype/theme-system). Otherwise picking a dark chart theme
   * left this panel light — a dark chart floating on light chrome.
   */
  theme: Theme;
  /** Omit to render read-only (dev preview / off-screen export capture, neither has a document to write into). */
  onEdit?: (patch: Partial<BlufValue>) => void;
  /** Viewer-local fill override (wayframe#43/#52, see use-so-what-style.ts) — overrides `theme.panelBg` outright when set. */
  fillColor?: string | null;
  /** Viewer-local transparency (wayframe#43/#52) — 0 opaque .. 100 fully see-through, applied on top of whichever background is active. */
  fillTransparency?: number;
}) {
  // useReducer rather than useState: reading persisted position has to
  // happen after mount (localStorage doesn't exist during SSR), and a bare
  // setState in an effect is the pattern react-hooks warns about. Same
  // shape as use-ghost-mode and the other viewer-preference hooks.
  const [pos, setPos] = useReducer((_: Position, next: Position) => next, DEFAULT_POSITION);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origin: Position } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [justAddedIndex, setJustAddedIndex] = useState<number | null>(null);

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

  function onResizePointerDown(e: React.PointerEvent) {
    if (!onEdit) return;
    e.stopPropagation();
    const rect = boxRef.current?.getBoundingClientRect();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: bluf.size?.width ?? rect?.width ?? DEFAULT_WIDTH,
      startH: rect?.height ?? MIN_HEIGHT,
    };
    setResizing(true);
  }

  function onResizePointerMove(e: React.PointerEvent) {
    const d = resizeRef.current;
    if (!d) return;
    onEdit?.({
      size: {
        width: Math.max(MIN_WIDTH, d.startW + (e.clientX - d.startX)),
        height: Math.max(MIN_HEIGHT, d.startH + (e.clientY - d.startY)),
      },
    });
  }

  function onResizePointerUp() {
    resizeRef.current = null;
    setResizing(false);
  }

  function addBullet() {
    if (!onEdit) return;
    const bullets = [...bluf.bullets, ""];
    setJustAddedIndex(bullets.length - 1);
    onEdit({ bullets });
  }

  function deleteBullet(i: number) {
    if (!onEdit) return;
    onEdit({ bullets: bluf.bullets.filter((_, j) => j !== i) });
  }

  function setBulletHtml(i: number, html: string) {
    onEdit?.({ bullets: bluf.bullets.map((b, j) => (j === i ? html : b)) });
  }

  // In normal flow beneath the chart by default, not floating over it. It
  // used to overlay the plot area, where it always covered *something* —
  // which milestones depended on the document — so a screenshot of the whole
  // programme was never actually complete. Dragging lifts it out with a
  // transform, leaving the flow position as the anchor it returns to.
  const moved = pos.x !== 0 || pos.y !== 0;
  const anchor: React.CSSProperties = {
    position: moved ? "relative" : "static",
    transform: moved ? `translate(${pos.x}px, ${pos.y}px)` : undefined,
    zIndex: moved ? 20 : undefined,
  };
  const surface = {
    background: withAlpha(fillColor ?? theme.panelBg, fillTransparency ?? 0),
    borderColor: theme.panelBorder,
    color: theme.panelInk,
  };
  const label = bluf.label ?? DEFAULT_LABEL;

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        style={{ ...anchor, ...surface, borderWidth: 1 }}
        className="mt-3 rounded-full border px-3 py-1 text-xs font-semibold shadow"
        dangerouslySetInnerHTML={{ __html: sanitizeBlufHtml(label) }}
      />
    );
  }

  const boxStyle: React.CSSProperties = {
    ...anchor,
    ...surface,
    borderWidth: 1,
    width: bluf.size?.width,
    height: bluf.size?.height ?? undefined,
    // Caps it at a compact default so it reads as an annotation, not a
    // second panel — inline rather than a Tailwind max-w-* class since the
    // cap needs to track DEFAULT_WIDTH. Dropped once the document has an
    // explicit width (a resized box overrides it deliberately).
    maxWidth: bluf.size?.width ? undefined : DEFAULT_WIDTH,
  };

  return (
    <div ref={boxRef} style={boxStyle} className="relative mt-3 w-full rounded-lg border p-3 text-xs shadow-lg">
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={"mb-1 flex items-start justify-between gap-2 " + (dragging ? "cursor-grabbing" : "cursor-grab")}
        title="Drag to move"
      >
        <DragHandleGlyph />
        {onEdit ? (
          <div onPointerDown={(e) => e.stopPropagation()} className="min-w-0 flex-1 font-bold tracking-wide uppercase" style={{ color: theme.accent }}>
            <RichTextEditableLine html={label} onChange={(html) => onEdit({ label: html })} sizePx={11} ariaLabel="So-what label" />
          </div>
        ) : (
          <span
            className="min-w-0 flex-1 font-bold tracking-wide uppercase select-none"
            style={{ color: theme.accent }}
            dangerouslySetInnerHTML={{ __html: sanitizeBlufHtml(label) }}
          />
        )}
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

      {onEdit ? (
        <div className="mb-2 font-medium">
          <RichTextEditableLine html={bluf.statement} onChange={(html) => onEdit({ statement: html })} sizePx={13} ariaLabel="So-what statement" />
        </div>
      ) : (
        <p className="mb-2 font-medium" dangerouslySetInnerHTML={{ __html: sanitizeBlufHtml(bluf.statement) }} />
      )}

      <ul className="list-disc space-y-1 pl-4">
        {bluf.bullets.map((b, i) =>
          onEdit ? (
            <li key={i} className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <RichTextEditableLine
                  html={b}
                  onChange={(html) => setBulletHtml(i, html)}
                  sizePx={12}
                  autoFocus={justAddedIndex === i}
                  ariaLabel={`So-what bullet ${i + 1}`}
                />
              </div>
              <button onClick={() => deleteBullet(i)} aria-label="Delete bullet" className="mt-0.5 shrink-0 opacity-40 hover:opacity-90">
                ✕
              </button>
            </li>
          ) : (
            <li key={i} dangerouslySetInnerHTML={{ __html: sanitizeBlufHtml(b) }} />
          ),
        )}
      </ul>
      {onEdit && (
        <button onClick={addBullet} className="mt-1.5 text-[11px] opacity-70 hover:opacity-100">
          + Add bullet
        </button>
      )}

      {onEdit && <ResizeHandle onPointerDown={onResizePointerDown} />}
      {onEdit && resizing && (
        // Invisible full-viewport capture layer, not pointer capture on the
        // handle itself: the handle is 12px and pinned to the box's own
        // corner, so as the box shrinks the pointer outruns it almost
        // immediately once the drag starts. A viewport-wide layer keeps
        // tracking moves regardless of where the box's edge currently is.
        <div className="fixed inset-0 z-50 cursor-nwse-resize" onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
      )}
    </div>
  );
}
