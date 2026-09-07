"use client";

// PROTOTYPE (wayframe#84) — throwaway. Three variants answering "is zoom a
// viewport/scale transform over the full computed domain, or a
// recomputation of the domain itself?" Not production code: no tests, no
// error handling beyond what keeps it runnable, shared zoom state/controls
// only (each variant's actual render mechanism is fully independent).
//
// A = viewport transform (CSS scale/translate over one fixed-width render).
// B = domain recompute (filter data to the window, fresh RoadmapTimeline
//     mount every zoom step — real collision/title-wrap passes rerun).
// C = hybrid (live CSS preview while adjusting, debounced commit to a real
//     recompute once the window settles).
import { useEffect, useMemo, useRef, useState } from "react";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { zoomFixture, FULL_DOMAIN } from "./zoom-prototype-fixture";
import type { RoadmapData } from "@/components/timeline/types";

const DAY = 86400000;
const TODAY = new Date("2026-09-02T00:00:00Z");
const FULL_RENDER_WIDTH = 4200;

const WIDTH_PRESETS: { label: string; days: number | null }[] = [
  { label: "Full", days: null },
  { label: "12mo", days: 365 },
  { label: "6mo", days: 182 },
  { label: "3mo", days: 91 },
  { label: "1mo", days: 30 },
  { label: "2wk", days: 14 },
];

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
  const [days, setDays] = useState<number | null>(null);
  const [centerTs, setCenterTs] = useState(Date.parse("2026-09-02"));
  const window: Window = days == null ? FULL_DOMAIN : { min: centerTs - (days / 2) * DAY, max: centerTs + (days / 2) * DAY };
  const pan = (dir: 1 | -1) => {
    if (days == null) return;
    setCenterTs((c) => c + dir * days * 0.5 * DAY);
  };
  return { days, setDays, centerTs, setCenterTs, window, pan };
}

export function ZoomControls({ state }: { state: ReturnType<typeof useZoomState> }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <span className="font-semibold">Width:</span>
      {WIDTH_PRESETS.map((p) => (
        <button
          key={p.label}
          onClick={() => state.setDays(p.days)}
          className={`rounded px-2 py-1 ${state.days === p.days ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}
        >
          {p.label}
        </button>
      ))}
      <span className="ml-3 font-semibold">Jump:</span>
      {JUMP_PRESETS.map((p) => (
        <button key={p.label} onClick={() => state.setCenterTs(Date.parse(p.center))} className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          {p.label}
        </button>
      ))}
      <button onClick={() => state.pan(-1)} disabled={state.days == null} className="ml-3 rounded bg-zinc-100 px-2 py-1 disabled:opacity-30 dark:bg-zinc-800">
        ◀ Pan
      </button>
      <button onClick={() => state.pan(1)} disabled={state.days == null} className="rounded bg-zinc-100 px-2 py-1 disabled:opacity-30 dark:bg-zinc-800">
        Pan ▶
      </button>
      <span className="ml-auto font-mono text-xs text-zinc-500">
        {fmt(state.window.min)} → {fmt(state.window.max)}
      </span>
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
        <code>scale()/translateX()</code> over it — no re-render. Watch text and stroke widths balloon as you zoom in: nothing was re-laid-out for the
        new density.
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
        Milestones outside the window are filtered out before rendering, and the component remounts (<code>key</code> on the window bounds) — every zoom
        step is a genuinely fresh domain + title-wrap + collision pass. Showing {filtered.milestones.length} of {zoomFixture.milestones.length}{" "}
        milestones this window.
      </p>
      <div ref={containerRef} className="h-[600px] overflow-auto rounded border border-zinc-300 dark:border-zinc-700">
        <RoadmapTimeline key={`${window.min}-${window.max}`} data={filtered} width={viewportW} today={TODAY} />
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
        300ms after the last zoom action.
      </p>
      <div ref={containerRef} className="relative h-[600px] overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
        <div
          style={{
            transform: previewing ? `translateX(${translateX}px) scale(${scale})` : "none",
            transformOrigin: "left top",
            transition: previewing ? "none" : "transform 120ms ease-out",
          }}
        >
          <RoadmapTimeline key={`${committed.min}-${committed.max}`} data={filtered} width={viewportW} today={TODAY} />
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
