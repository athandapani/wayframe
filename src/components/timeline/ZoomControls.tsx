"use client";

// UI + preview wrapper for use-zoom-window.ts (wayframe t10). Controls are a
// two-thumb range slider over the full document domain plus a Zoom +/-
// stepper — not preset-width buttons, per the wayframe#84 prototype's
// revision after feedback ("select a range, see it full-size", not "pick a
// fixed width, then re-center").
import { useEffect, useRef, useState } from "react";
import type { UseZoomWindowResult } from "./use-zoom-window";

const DAY_MS = 86400000;

function fmt(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Short "MMM 'YY" form for the compact toolbar variant — the full "YYYY-MM-DD" range string doesn't fit a top-row icon cluster's budget (see RoadmapWorkspace.tsx's toolbar-contention note, wayframe UX-2026-09-18 §3). */
function fmtShort(ts: number): string {
  const d = new Date(ts);
  const month = d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  const year = String(d.getUTCFullYear()).slice(2);
  return `${month} '${year}`;
}

/**
 * `variant="compact"` (wayframe UX-2026-09-18 §3) — a single icon-cluster
 * row for the top toolbar: a narrower fixed-width slider track, a
 * shortened date range, and Reset demoted to a bare `↺` icon. Same
 * `UseZoomWindowResult` contract either way — only the layout changes, so
 * the two variants can never drift in behavior, only in how much space
 * they take. `ZoomPreviewFrame` stays wherever the chart itself is
 * (unaffected by this prop) since its width-measurement/scale-preview math
 * has nothing to do with where the slider draws.
 */
export function ZoomControls({ state, variant = "block" }: { state: UseZoomWindowResult; variant?: "block" | "compact" }) {
  const { fullDomain, window: win } = state;
  const pct = (t: number) => ((t - fullDomain.min) / (fullDomain.max - fullDomain.min)) * 100;

  const thumbCss = (
    <style>{`
      .wf-zoom-thumb { pointer-events: none; position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; -webkit-appearance: none; appearance: none; margin: 0; }
      .wf-zoom-thumb::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; appearance: none; width: 13px; height: 13px; border-radius: 999px; background: var(--wf-accent); border: 2px solid var(--wf-panel); box-shadow: 0 1px 2px rgba(0,0,0,0.35); cursor: ew-resize; margin-top: 0; }
      .wf-zoom-thumb::-moz-range-thumb { pointer-events: auto; width: 13px; height: 13px; border-radius: 999px; background: var(--wf-accent); border: 2px solid var(--wf-panel); cursor: ew-resize; }
      .wf-zoom-thumb::-webkit-slider-runnable-track { background: transparent; }
    `}</style>
  );

  const track = (widthClassName: string) => (
    <div className={`relative h-5 ${widthClassName}`}>
      {thumbCss}
      <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded" style={{ background: "var(--wf-border)" }} />
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded"
        style={{ background: "var(--wf-accent)", left: `${pct(win.min)}%`, width: `${Math.max(0, pct(win.max) - pct(win.min))}%` }}
      />
      <input
        type="range"
        aria-label="Zoom window start"
        className="wf-zoom-thumb"
        min={fullDomain.min}
        max={fullDomain.max}
        step={DAY_MS}
        value={win.min}
        onChange={(e) => state.setStart(Math.min(Number(e.target.value), win.max - DAY_MS))}
      />
      <input
        type="range"
        aria-label="Zoom window end"
        className="wf-zoom-thumb"
        min={fullDomain.min}
        max={fullDomain.max}
        step={DAY_MS}
        value={win.max}
        onChange={(e) => state.setEnd(Math.max(Number(e.target.value), win.min + DAY_MS))}
      />
    </div>
  );

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs" style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}>
        {track("w-24")}
        <span className="font-mono text-[10px] opacity-70 whitespace-nowrap">
          {fmtShort(win.min)}→{fmtShort(win.max)}
        </span>
        <button onClick={() => state.zoomBy(2)} title="Zoom out" aria-label="Zoom out" className="rounded px-1 font-mono" style={{ background: "var(--wf-ground)" }}>
          −
        </button>
        <button onClick={() => state.zoomBy(0.5)} title="Zoom in" aria-label="Zoom in" className="rounded px-1 font-mono" style={{ background: "var(--wf-ground)" }}>
          +
        </button>
        <button onClick={() => state.pan(-1)} title="Pan earlier" aria-label="Pan earlier" className="rounded px-1" style={{ background: "var(--wf-ground)" }}>
          ◀
        </button>
        <button onClick={() => state.pan(1)} title="Pan later" aria-label="Pan later" className="rounded px-1" style={{ background: "var(--wf-ground)" }}>
          ▶
        </button>
        {state.active && (
          <button onClick={state.reset} title="Reset zoom" aria-label="Reset zoom" className="rounded px-1" style={{ background: "var(--wf-ground)" }}>
            ↺
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border px-3 py-2 text-xs" style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}>
      <div className="mb-1.5 w-full">{track("w-full")}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono opacity-70">
          {fmt(win.min)} → {fmt(win.max)}
        </span>
        <button onClick={() => state.zoomBy(2)} title="Zoom out" aria-label="Zoom out" className="ml-2 rounded px-2 py-0.5 font-mono" style={{ background: "var(--wf-ground)" }}>
          −
        </button>
        <button onClick={() => state.zoomBy(0.5)} title="Zoom in" aria-label="Zoom in" className="rounded px-2 py-0.5 font-mono" style={{ background: "var(--wf-ground)" }}>
          +
        </button>
        <button onClick={() => state.pan(-1)} aria-label="Pan earlier" className="ml-2 rounded px-2 py-0.5" style={{ background: "var(--wf-ground)" }}>
          ◀
        </button>
        <button onClick={() => state.pan(1)} aria-label="Pan later" className="rounded px-2 py-0.5" style={{ background: "var(--wf-ground)" }}>
          ▶
        </button>
        {state.active && (
          <button onClick={state.reset} className="ml-2 rounded px-2 py-0.5 font-semibold" style={{ background: "var(--wf-ground)" }}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Wraps the chart with the live CSS scaleX()/translateX() preview while a
 * requested window is settling (wayframe#84 Variant C's hybrid) — pixel math
 * needs the container's own measured width, so it lives here rather than in
 * the (DOM-free) use-zoom-window hook.
 */
export function ZoomPreviewFrame({ state, children }: { state: UseZoomWindowResult; children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => setWidth(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const translateX = -state.previewOffsetFraction * width * state.previewScale;

  return (
    <div ref={containerRef} style={{ overflow: state.previewing ? "hidden" : undefined }}>
      <div
        style={{
          transform: state.previewing ? `translateX(${translateX}px) scaleX(${state.previewScale})` : "none",
          transformOrigin: "left top",
        }}
      >
        {children}
      </div>
    </div>
  );
}
