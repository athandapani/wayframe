"use client";

// PROTOTYPE (wayframe#84) — throwaway. Three variants answering "is zoom a
// viewport/scale transform over the full computed domain, or a
// recomputation of the domain itself?" Not production code: no tests, no
// error handling beyond what keeps it runnable, shared zoom state/controls
// only (each variant's actual render mechanism is fully independent).
//
// A = viewport transform (CSS scale/translate over one fixed-width render).
// B = domain recompute (filter data to the window, fresh RoadmapTimeline
//     mount every zoom step, domainOverride forces the render domain to
//     exactly the selected window so it actually fills the frame instead
//     of just hiding items — see RoadmapTimeline's domainOverride prop).
// C = hybrid (live CSS preview while adjusting, debounced commit to a real
//     recompute once the window settles).
//
// Controls (revised after first pass): a two-handle range slider over the
// full domain (not preset width buttons) plus Zoom +/- stepping in/out
// around the window's own center, replacing "pick a fixed width, then
// re-center" with direct select-a-range-then-see-it-full-size.
import { useEffect, useMemo, useRef, useState } from "react";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { zoomFixture, FULL_DOMAIN } from "./zoom-prototype-fixture";
import type { RoadmapData } from "@/components/timeline/types";

const DAY = 86400000;
const TODAY = new Date("2026-09-02T00:00:00Z");
const FULL_RENDER_WIDTH = 4200;
const MIN_SPAN = 7 * DAY;

const JUMP_PRESETS = [
  { label: "Apr burst", center: "2026-04-18" },
  { label: "Sep burst", center: "2026-09-02" },
  { label: "Feb'27 burst", center: "2027-02-04" },
];

interface Window {
  min: number;
  max: number;
}

function fmt(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function clampWindow(w: Window): Window {
  let { min, max } = w;
  if (max - min < MIN_SPAN) max = min + MIN_SPAN;
  if (min < FULL_DOMAIN.min) {
    max += FULL_DOMAIN.min - min;
    min = FULL_DOMAIN.min;
  }
  if (max > FULL_DOMAIN.max) {
    min -= max - FULL_DOMAIN.max;
    max = FULL_DOMAIN.max;
  }
  return { min: Math.max(FULL_DOMAIN.min, min), max: Math.min(FULL_DOMAIN.max, max) };
}

function useViewportWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1100);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function filterToWindow(data: RoadmapData, w: Window): RoadmapData {
  const inRange = (iso: string) => {
    const t = Date.parse(iso);
    return t >= w.min && t <= w.max;
  };
  const milestones = data.milestones.filter((m) => inRange(m.date) || (m.endDate && inRange(m.endDate)));
  const topLevelItems = data.topLevelItems.filter((t) => {
    if (t.type === "phase") return inRange(t.startDate) || inRange(t.endDate) || (Date.parse(t.startDate) <= w.min && Date.parse(t.endDate) >= w.max);
    return inRange(t.date);
  });
  return { ...data, milestones, topLevelItems };
}

export function useZoomState() {
  const [window, setWindowRaw] = useState<Window>(FULL_DOMAIN);
  const setWindow = (w: Window) => setWindowRaw(clampWindow(w));
  const setStart = (min: number) => setWindow({ min, max: window.max });
  const setEnd = (max: number) => setWindow({ min: window.min, max });
  const zoomBy = (factor: number) => {
    const center = (window.min + window.max) / 2;
    const halfSpan = ((window.max - window.min) / 2) * factor;
    setWindow({ min: center - halfSpan, max: center + halfSpan });
  };
  const pan = (dir: 1 | -1) => {
    const span = window.max - window.min;
    setWindow({ min: window.min + dir * span * 0.5, max: window.max + dir * span * 0.5 });
  };
  const jump = (centerIso: string) => {
    const c = Date.parse(centerIso);
    const span = Math.max(MIN_SPAN, window.max - window.min);
    setWindow({ min: c - span / 2, max: c + span / 2 });
  };
  return { window, setWindow, setStart, setEnd, zoomBy, pan, jump };
}

function RangeSlider({ state }: { state: ReturnType<typeof useZoomState> }) {
  const pct = (t: number) => ((t - FULL_DOMAIN.min) / (FULL_DOMAIN.max - FULL_DOMAIN.min)) * 100;
  const { min, max } = state.window;
  return (
    <div className="relative mb-1 h-8 w-full">
      <style>{`
        input[type=range].zoom-thumb { pointer-events: none; position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; -webkit-appearance: none; appearance: none; margin: 0; }
        input[type=range].zoom-thumb::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 999px; background: #2563eb; border: 2px solid white; box-shadow: 0 1px 2px rgba(0,0,0,0.4); cursor: ew-resize; margin-top: 0; }
        input[type=range].zoom-thumb::-moz-range-thumb { pointer-events: auto; width: 14px; height: 14px; border-radius: 999px; background: #2563eb; border: 2px solid white; cursor: ew-resize; }
        input[type=range].zoom-thumb::-webkit-slider-runnable-track { background: transparent; }
      `}</style>
      <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded bg-zinc-300 dark:bg-zinc-700" />
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-blue-500" style={{ left: `${pct(min)}%`, width: `${Math.max(0, pct(max) - pct(min))}%` }} />
      <input
        type="range"
        className="zoom-thumb"
        min={FULL_DOMAIN.min}
        max={FULL_DOMAIN.max}
        step={DAY}
        value={min}
        onChange={(e) => state.setStart(Math.min(Number(e.target.value), max - MIN_SPAN))}
      />
      <input
        type="range"
        className="zoom-thumb"
        min={FULL_DOMAIN.min}
        max={FULL_DOMAIN.max}
        step={DAY}
        value={max}
        onChange={(e) => state.setEnd(Math.max(Number(e.target.value), min + MIN_SPAN))}
      />
    </div>
  );
}

export function ZoomControls({ state }: { state: ReturnType<typeof useZoomState> }) {
  return (
    <div className="mb-3 rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <RangeSlider state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-500">
          {fmt(state.window.min)} → {fmt(state.window.max)}
        </span>
        <button onClick={() => state.zoomBy(2)} title="Zoom out" className="ml-2 rounded bg-zinc-100 px-2 py-1 font-mono dark:bg-zinc-800">
          −
        </button>
        <button onClick={() => state.zoomBy(0.5)} title="Zoom in" className="rounded bg-zinc-100 px-2 py-1 font-mono dark:bg-zinc-800">
          +
        </button>
        <button onClick={() => state.pan(-1)} className="ml-2 rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          ◀ Pan
        </button>
        <button onClick={() => state.pan(1)} className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          Pan ▶
        </button>
        <button onClick={() => state.setWindow(FULL_DOMAIN)} className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          Reset
        </button>
        <span className="ml-3 font-semibold">Jump:</span>
        {JUMP_PRESETS.map((p) => (
          <button key={p.label} onClick={() => state.jump(p.center)} className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VariantA({ window }: { window: Window }) {
  const [containerRef, viewportW] = useViewportWidth();
  const px = (ts: number) => ((ts - FULL_DOMAIN.min) / (FULL_DOMAIN.max - FULL_DOMAIN.min)) * FULL_RENDER_WIDTH;
  const winMinPx = px(window.min);
  const winMaxPx = px(window.max);
  const scale = viewportW / Math.max(1, winMaxPx - winMinPx);
  const translateX = -winMinPx * scale;
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        One fixed-width ({FULL_RENDER_WIDTH}px) SVG render of the full 18-month domain, computed once. Zoom is a pure CSS{" "}
        <code>scaleX()/translateX()</code> over it — no re-render. Watch markers distort into ellipses/rhombi as you zoom, and notice a crowded cluster
        never actually separates, at any zoom level — pure linear magnification can&apos;t re-flow labels.
      </p>
      <div ref={containerRef} className="relative h-[600px] overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
        <div style={{ position: "absolute", top: 0, left: 0, width: FULL_RENDER_WIDTH, transform: `translateX(${translateX}px) scaleX(${scale})`, transformOrigin: "left top" }}>
          <RoadmapTimeline data={zoomFixture} width={FULL_RENDER_WIDTH} today={TODAY} />
        </div>
      </div>
    </div>
  );
}

export function VariantB({ window }: { window: Window }) {
  const [containerRef, viewportW] = useViewportWidth();
  const filtered = useMemo(() => filterToWindow(zoomFixture, window), [window.min, window.max]);
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        Milestones outside the window are filtered out AND the render domain is forced to exactly the selected window (
        <code>domainOverride</code>, bypassing <code>computeDomain</code>&apos;s own ±14-day content-derived pad) — the selection actually fills the
        frame at full size, not just "fewer items at the same old scale." Every zoom step is a fresh mount: real domain + title-wrap + collision pass.
        Showing {filtered.milestones.length} of {zoomFixture.milestones.length} milestones this window.
      </p>
      <div ref={containerRef} className="h-[600px] overflow-auto rounded border border-zinc-300 dark:border-zinc-700">
        <RoadmapTimeline key={`${window.min}-${window.max}`} data={filtered} width={viewportW} today={TODAY} domainOverride={window} />
      </div>
    </div>
  );
}

export function VariantC({ window }: { window: Window }) {
  const [containerRef, viewportW] = useViewportWidth();
  const [committed, setCommitted] = useState<Window>(window);
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    setSettling(true);
    const t = setTimeout(() => {
      setCommitted(window);
      setSettling(false);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.min, window.max]);

  const filtered = useMemo(() => filterToWindow(zoomFixture, committed), [committed.min, committed.max]);
  const committedSpan = committed.max - committed.min;
  const requestedSpan = window.max - window.min;
  const scale = committedSpan / requestedSpan;
  const offsetWithinCommitted = (window.min - committed.min) / committedSpan;
  const translateX = -offsetWithinCommitted * viewportW * scale;
  const previewing = settling && (scale !== 1 || offsetWithinCommitted !== 0);

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        {previewing ? "Live CSS preview (cheap, approximate) — " : "Settled — "}
        committed render covers {fmt(committed.min)} → {fmt(committed.max)}, requested {fmt(window.min)} → {fmt(window.max)}. Commits to a real recompute
        (with the same forced <code>domainOverride</code> as B) 300ms after the last slider/zoom action.
      </p>
      <div ref={containerRef} className="relative h-[600px] overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
        <div
          style={{
            transform: previewing ? `translateX(${translateX}px) scaleX(${scale})` : "none",
            transformOrigin: "left top",
            transition: previewing ? "none" : "transform 120ms ease-out",
          }}
        >
          <RoadmapTimeline key={`${committed.min}-${committed.max}`} data={filtered} width={viewportW} today={TODAY} domainOverride={committed} />
        </div>
      </div>
    </div>
  );
}

const VARIANTS = [
  { key: "a", name: "Viewport transform", Component: VariantA },
  { key: "b", name: "Domain recompute", Component: VariantB },
  { key: "c", name: "Hybrid (live preview + debounced commit)", Component: VariantC },
] as const;

export function PrototypeSwitcher({ current, onChange }: { current: string; onChange: (k: string) => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      const idx = VARIANTS.findIndex((v) => v.key === current);
      if (e.key === "ArrowLeft") onChange(VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length].key);
      if (e.key === "ArrowRight") onChange(VARIANTS[(idx + 1) % VARIANTS.length].key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, onChange]);

  if (process.env.NODE_ENV === "production") return null;
  const idx = VARIANTS.findIndex((v) => v.key === current);
  const active = VARIANTS[idx] ?? VARIANTS[0];
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
      <button onClick={() => onChange(VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length].key)} className="px-2 text-lg leading-none">
        ←
      </button>
      <span className="font-mono">
        {active.key.toUpperCase()} — {active.name}
      </span>
      <button onClick={() => onChange(VARIANTS[(idx + 1) % VARIANTS.length].key)} className="px-2 text-lg leading-none">
        →
      </button>
    </div>
  );
}

export function zoomVariantComponent(key: string) {
  return (VARIANTS.find((v) => v.key === key) ?? VARIANTS[0]).Component;
}
