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

export function ZoomControls({ state }: { state: UseZoomWindowResult }) {
  const { fullDomain, window: win } = state;
  const pct = (t: number) => ((t - fullDomain.min) / (fullDomain.max - fullDomain.min)) * 100;
  const span = fullDomain.max - fullDomain.min;

  return (
    <div className="mb-3 rounded-lg border px-3 py-2 text-xs" style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}>
      <div className="relative mb-1.5 h-5 w-full">
        <style>{`
          .wf-zoom-thumb { pointer-events: none; position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; -webkit-appearance: none; appearance: none; margin: 0; }
          .wf-zoom-thumb::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; appearance: none; width: 13px; height: 13px; border-radius: 999px; background: var(--wf-accent); border: 2px solid var(--wf-panel); box-shadow: 0 1px 2px rgba(0,0,0,0.35); cursor: ew-resize; margin-top: 0; }
          .wf-zoom-thumb::-moz-range-thumb { pointer-events: auto; width: 13px; height: 13px; border-radius: 999px; background: var(--wf-accent); border: 2px solid var(--wf-panel); cursor: ew-resize; }
          .wf-zoom-thumb::-webkit-slider-runnable-track { background: transparent; }
        `}</style>
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
        {span <= 0 && null}
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
