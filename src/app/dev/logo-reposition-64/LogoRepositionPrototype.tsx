"use client";

// PROTOTYPE — wayfinder ticket #64 (Design freeform logo repositioning and
// resizing, https://github.com/athandapani/wayframe/issues/64). Throwaway,
// not production code — see page.tsx. Branch: prototype/logo-reposition-64.
//
// Three variants of the logo drag/resize interaction, switchable via the
// floating bar. Each combines a stance on the ticket's three open questions
// (drag axis, resize affordance, persistence model) so a single flip through
// the bar surfaces reactions on all three at once:
//
//   A — vertical-only drag (literal "up or down") + stepper resize,
//       viewer-local (localStorage, like every existing drag override).
//   B — free 2D drag (reuses use-label-overrides.ts's existing dx/dy
//       mechanism verbatim) + direct-manipulation corner-handle resize,
//       viewer-local.
//   C — free 2D drag + an Options-menu slider (indirect control, not direct
//       manipulation) + document-persisted (travels with save/export, unlike
//       A/B — shown concretely via the JSON preview under the panel).
//
// The real RoadmapTimeline renders underneath, unmodified, for density/scale
// context (per the prototype skill's "butt up against the real app"
// guidance) — its own (non-interactive) logo is separate from the
// interactive header mock above, which is a faithful reproduction of just
// the top-band region (logo + PROGRAM chip + programName) at 1:1 pixel
// scale, sized to avoid the SVG-viewBox coordinate-mapping complexity real
// RoadmapTimeline integration would need for a rough spike.
import { useEffect, useRef, useState } from "react";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { defaultTheme } from "@/components/timeline/theme";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";
import { OptionsMenu, OptionsMenuRow } from "@/components/workspace/OptionsMenu";

const theme = defaultTheme;

const PLACEHOLDER_LOGO_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="70"><rect width="200" height="70" rx="10" fill="#1f4e79"/><text x="100" y="44" font-family="system-ui,sans-serif" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">ACME</text></svg>',
)}`;

// Native placeholder aspect (200:70) at the real companyLogo's base width.
const BASE_W = 140;
const BASE_H = 49;
const LOGO_X = 16;
const LOGO_Y = 14;
const CHIP_Y = 70;
const HEADER_W = 640;
const HEADER_H = 150;

const VARIANTS = ["A", "B", "C"] as const;
type VariantKey = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<VariantKey, string> = {
  A: "Vertical drag + stepper, viewer-local",
  B: "Free 2D drag + handle resize, viewer-local",
  C: "Free 2D drag + slider resize, document-saved",
};

export function LogoRepositionPrototype() {
  const [variant, setVariant] = useState<VariantKey>("A");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    function cycle(delta: 1 | -1) {
      setVariant((v) => {
        const i = VARIANTS.indexOf(v);
        return VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length];
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 pb-24 dark:bg-black">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-lg border p-4" style={{ background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk }}>
          <div className="text-sm font-semibold">Ticket #64 prototype — drag the logo, resize it, flip variants below</div>
          <div className="mt-1 text-xs opacity-70">
            Three combined stances on drag axis / resize affordance / persistence. Real RoadmapTimeline renders below for scale context; its own static
            logo is unrelated to the interactive mock above it.
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: theme.panelBorder }}>
          {variant === "A" && <LogoVariantA />}
          {variant === "B" && <LogoVariantB />}
          {variant === "C" && <LogoVariantC />}
        </div>

        <div className="rounded-lg border p-2" style={{ background: theme.panelBg, borderColor: theme.panelBorder }}>
          <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />
        </div>
      </div>

      <PrototypeSwitcher variant={variant} onChange={setVariant} />
    </div>
  );
}

function PrototypeSwitcher({ variant, onChange }: { variant: VariantKey; onChange: (v: VariantKey) => void }) {
  if (process.env.NODE_ENV === "production") return null;
  const i = VARIANTS.indexOf(variant);
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-black/90 px-4 py-2 text-sm text-white shadow-xl">
      <button aria-label="Previous variant" className="px-1 text-lg leading-none" onClick={() => onChange(VARIANTS[(i - 1 + VARIANTS.length) % VARIANTS.length])}>
        ←
      </button>
      <span className="whitespace-nowrap">
        <strong>{variant}</strong> — {VARIANT_NAMES[variant]}
      </span>
      <button aria-label="Next variant" className="px-1 text-lg leading-none" onClick={() => onChange(VARIANTS[(i + 1) % VARIANTS.length])}>
        →
      </button>
    </div>
  );
}

/** Shared chrome: PROGRAM chip, program name, owner, and a faint stand-in for the rest of the chart. Deliberately shared — only the logo interaction differs per variant. */
function HeaderChrome() {
  const chipLabel = "PROGRAM";
  const chipW = chipLabel.length * 5.4 + 20;
  return (
    <>
      <rect width={HEADER_W} height={HEADER_H} fill={theme.ground} />
      <rect x={0} y={CHIP_Y + 46} width={HEADER_W} height={HEADER_H - (CHIP_Y + 46)} fill={theme.panelBg} opacity={0.5} />
      <rect x={LOGO_X} y={CHIP_Y} width={chipW} height={13} rx={6.5} fill={theme.accent} />
      <text x={LOGO_X + chipW / 2} y={CHIP_Y + 9} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#ffffff">
        {chipLabel}
      </text>
      <text x={LOGO_X} y={CHIP_Y + 32} fontSize={16} fontWeight={700} fill={theme.ink}>
        Sample Program
      </text>
      <text x={LOGO_X} y={CHIP_Y + 48} fontSize={11} fill={theme.inkMuted}>
        Owner: J. Rivera
      </text>
      {/* keep-out guide — logo shouldn't grow/drag down into the PROGRAM row */}
      <rect x={LOGO_X - 4} y={4} width={280} height={CHIP_Y - 8} fill="none" stroke={theme.connector} strokeDasharray="3 3" opacity={0.5} />
    </>
  );
}

function StateReadout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t px-3 py-2 font-mono text-xs" style={{ borderColor: theme.panelBorder, color: theme.inkMuted, background: theme.panelBg }}>
      {children}
    </div>
  );
}

// --- Variant A: vertical-only drag + stepper resize, viewer-local -------

const STORAGE_A = "prototype64:variantA";

function LogoVariantA() {
  const [state, setState] = useState({ dy: 0, heightScale: 1 });
  const dragRef = useRef<{ startY: number; startDy: number } | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_A);
      if (raw) setState(JSON.parse(raw));
    } catch {
      // ignore corrupt/inaccessible storage — prototype, not production
    }
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_A, JSON.stringify(state));
  }, [state]);

  const h = BASE_H * state.heightScale;
  const w = BASE_W * state.heightScale;
  const maxDy = CHIP_Y - 8 - h - LOGO_Y;
  const minDy = -LOGO_Y + 2;

  function onPointerDown(e: React.PointerEvent<SVGImageElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startDy: state.dy };
  }
  function onPointerMove(e: React.PointerEvent<SVGImageElement>) {
    if (!dragRef.current) return;
    const raw = dragRef.current.startDy + (e.clientY - dragRef.current.startY);
    setState((s) => ({ ...s, dy: Math.max(minDy, Math.min(maxDy, raw)) }));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function step(delta: number) {
    setState((s) => ({ ...s, heightScale: Math.max(0.5, Math.min(1.85, +(s.heightScale + delta).toFixed(2))) }));
  }

  return (
    <div>
      <svg width={HEADER_W} height={HEADER_H} viewBox={`0 0 ${HEADER_W} ${HEADER_H}`}>
        <HeaderChrome />
        <image
          href={PLACEHOLDER_LOGO_SRC}
          x={LOGO_X}
          y={LOGO_Y + state.dy}
          width={w}
          height={h}
          preserveAspectRatio="xMinYMid meet"
          className="cursor-ns-resize"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        {/* vertical-only affordance — a two-headed arrow beside the logo, no horizontal handle at all */}
        <text x={LOGO_X + w + 8} y={LOGO_Y + state.dy + h / 2 + 4} fontSize={14} fill={theme.inkMuted}>
          ↕
        </text>
      </svg>
      <div className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: theme.panelBorder, background: theme.panelBg }}>
        <span className="text-xs opacity-70">Size</span>
        <button className="rounded border px-2 py-0.5 text-sm" style={{ borderColor: theme.panelBorder }} onClick={() => step(-0.1)}>
          −
        </button>
        <button className="rounded border px-2 py-0.5 text-sm" style={{ borderColor: theme.panelBorder }} onClick={() => step(0.1)}>
          +
        </button>
        <span className="text-xs opacity-50">stepper in the Options menu in production, inlined here for the spike</span>
      </div>
      <StateReadout>
        dy={Math.round(state.dy)} · heightScale={state.heightScale.toFixed(2)} · persistence=localStorage (&quot;{STORAGE_A}&quot;) — viewer-local, resets on
        another device
      </StateReadout>
    </div>
  );
}

// --- Variant B: free 2D drag + corner-handle resize, viewer-local -------

const STORAGE_B = "prototype64:variantB";

function LogoVariantB() {
  const [state, setState] = useState({ dx: 0, dy: 0, scale: 1 });
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; start: typeof state } | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_B);
      if (raw) setState(JSON.parse(raw));
    } catch {
      // ignore corrupt/inaccessible storage — prototype, not production
    }
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_B, JSON.stringify(state));
  }, [state]);

  const w = BASE_W * state.scale;
  const h = BASE_H * state.scale;
  const x = LOGO_X + state.dx;
  const y = LOGO_Y + state.dy;

  function beginMove(e: React.PointerEvent<SVGImageElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode: "move", startX: e.clientX, startY: e.clientY, start: state };
  }
  function beginResize(e: React.PointerEvent<SVGRectElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    dragRef.current = { mode: "resize", startX: e.clientX, startY: e.clientY, start: state };
  }
  function onMove(e: React.PointerEvent<SVGElement>) {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "move") {
      const dx = Math.max(-8, Math.min(340, d.start.dx + (e.clientX - d.startX)));
      const dy = Math.max(-LOGO_Y + 2, Math.min(CHIP_Y - 8 - h - LOGO_Y, d.start.dy + (e.clientY - d.startY)));
      setState((s) => ({ ...s, dx, dy }));
    } else {
      const delta = (e.clientX - d.startX) / BASE_W;
      const scale = Math.max(0.5, Math.min(2.2, +(d.start.scale + delta).toFixed(2)));
      setState((s) => ({ ...s, scale }));
    }
  }
  function endDrag() {
    dragRef.current = null;
  }

  return (
    <div>
      <svg width={HEADER_W} height={HEADER_H} viewBox={`0 0 ${HEADER_W} ${HEADER_H}`} onPointerMove={onMove} onPointerUp={endDrag}>
        <HeaderChrome />
        {(state.dx !== 0 || state.dy !== 0) && (
          <line x1={LOGO_X + BASE_W / 2} y1={LOGO_Y + BASE_H / 2} x2={x + w / 2} y2={y + h / 2} stroke={theme.connector} strokeDasharray="2 2" opacity={0.6} />
        )}
        <image
          href={PLACEHOLDER_LOGO_SRC}
          x={x}
          y={y}
          width={w}
          height={h}
          preserveAspectRatio="xMinYMid meet"
          className="cursor-grab select-none active:cursor-grabbing"
          onPointerDown={beginMove}
        />
        <rect
          x={x + w - 6}
          y={y + h - 6}
          width={10}
          height={10}
          rx={2}
          fill={theme.accent}
          stroke="#ffffff"
          strokeWidth={1}
          className="cursor-nwse-resize"
          onPointerDown={beginResize}
        />
      </svg>
      <StateReadout>
        dx={Math.round(state.dx)}, dy={Math.round(state.dy)} · scale={state.scale.toFixed(2)} · persistence=localStorage (&quot;{STORAGE_B}&quot;) —
        viewer-local, resets on another device
      </StateReadout>
    </div>
  );
}

// --- Variant C: free 2D drag + Options-menu slider, document-persisted --

function LogoVariantC() {
  const [state, setState] = useState({ dx: 0, dy: 0, scale: 1 });
  const dragRef = useRef<{ startX: number; startY: number; start: typeof state } | null>(null);

  const w = BASE_W * state.scale;
  const h = BASE_H * state.scale;
  const x = LOGO_X + state.dx;
  const y = LOGO_Y + state.dy;

  function beginMove(e: React.PointerEvent<SVGImageElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, start: state };
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = Math.max(-8, Math.min(340, d.start.dx + (e.clientX - d.startX)));
    const dy = Math.max(-LOGO_Y + 2, Math.min(CHIP_Y - 8 - h - LOGO_Y, d.start.dy + (e.clientY - d.startY)));
    setState((s) => ({ ...s, dx, dy }));
  }
  function endDrag() {
    dragRef.current = null;
  }

  const documentJson = JSON.stringify({ companyLogo: { dataUrl: "<data-url>", dx: Math.round(state.dx), dy: Math.round(state.dy), scale: state.scale } }, null, 2);

  return (
    <div>
      <svg width={HEADER_W} height={HEADER_H} viewBox={`0 0 ${HEADER_W} ${HEADER_H}`} onPointerMove={onMove} onPointerUp={endDrag}>
        <HeaderChrome />
        {(state.dx !== 0 || state.dy !== 0) && (
          <line x1={LOGO_X + BASE_W / 2} y1={LOGO_Y + BASE_H / 2} x2={x + w / 2} y2={y + h / 2} stroke={theme.connector} strokeDasharray="2 2" opacity={0.6} />
        )}
        <image
          href={PLACEHOLDER_LOGO_SRC}
          x={x}
          y={y}
          width={w}
          height={h}
          preserveAspectRatio="xMinYMid meet"
          className="cursor-grab select-none active:cursor-grabbing"
          onPointerDown={beginMove}
        />
      </svg>
      <div className="flex items-center justify-between gap-3 border-t px-3 py-2" style={{ borderColor: theme.panelBorder, background: theme.panelBg }}>
        <OptionsMenu>
          <OptionsMenuRow label="Company logo size">
            <input
              type="range"
              min={0.5}
              max={2.2}
              step={0.05}
              value={state.scale}
              onChange={(e) => setState((s) => ({ ...s, scale: +e.target.value }))}
            />
            <span className="w-10 text-right text-xs">{state.scale.toFixed(2)}×</span>
          </OptionsMenuRow>
          <OptionsMenuRow label="Position">
            <button
              className="rounded border px-2 py-0.5 text-xs"
              style={{ borderColor: theme.panelBorder }}
              onClick={() => setState((s) => ({ ...s, dx: 0, dy: 0 }))}
            >
              Reset position
            </button>
          </OptionsMenuRow>
        </OptionsMenu>
        <span className="text-xs opacity-60">real slider lives in the existing &quot;Company logo&quot; Options-menu row, next to Upload/Replace/Remove</span>
      </div>
      <StateReadout>
        <div>dx={Math.round(state.dx)}, dy={Math.round(state.dy)} · scale={state.scale.toFixed(2)} · persistence=document field (saved/exported with the file)</div>
        <pre className="mt-1 whitespace-pre-wrap opacity-80">{documentJson}</pre>
      </StateReadout>
    </div>
  );
}
