"use client";

// Collapsible legend (prototype/theme-system).
//
// The chart encodes a lot in shape and colour — five statuses, a critical
// path, duration spans, slip badges, traces — and none of it was explained
// anywhere. A reader who didn't build the thing had to infer it, and an
// exported slide gave them nothing at all.
//
// It reflects what's actually on screen rather than listing every symbol
// the renderer knows: turn ghosts off and the slip entry goes with them.
// A legend that documents features you've switched off is noise.
import { useEffect, useReducer, useState } from "react";
import type { Theme } from "./theme";
import type { Status } from "./types";
import type { CriticalPathStyle } from "./use-critical-path-style";
import type { GhostMode } from "./RoadmapTimeline";

const STORAGE_KEY = "wayframe:legend-open";

const STATUS_ORDER: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];
const STATUS_LABEL: Record<Status, string> = {
  "not-started": "Not started",
  "on-track": "On track",
  "at-risk": "At risk",
  delayed: "Delayed",
  complete: "Complete",
};

/** The same rotated rounded-square the chart draws, at legend scale. */
function Diamond({ fill, stroke, size = 11 }: { fill: string; stroke: string; size?: number }) {
  return (
    <svg width={size + 6} height={size + 6} viewBox={`0 0 ${size + 6} ${size + 6}`} aria-hidden="true">
      <rect
        x={3}
        y={3}
        width={size}
        height={size}
        rx={size * 0.2}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.2}
        transform={`rotate(45 ${(size + 6) / 2} ${(size + 6) / 2})`}
      />
    </svg>
  );
}

function LineSwatch({ color, style }: { color: string; style: CriticalPathStyle }) {
  const width = style === "thick" ? 4 : style === "double" ? 5 : style === "dashed" ? 2.5 : 2;
  return (
    <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true">
      <line x1={1} y1={6} x2={25} y2={6} stroke={color} strokeWidth={width} strokeDasharray={style === "dashed" ? "5 3" : undefined} />
      {style === "double" && <line x1={1} y1={6} x2={25} y2={6} stroke="var(--wf-panel)" strokeWidth={1.8} />}
    </svg>
  );
}

export interface ChartLegendProps {
  theme: Theme;
  criticalPathStyle: CriticalPathStyle;
  showCriticalPath: boolean;
  ghostMode: GhostMode;
  /** True while a trace is active, so the trace key only appears when it means something. */
  tracing: boolean;
  /** True when the document has at least one milestone with a duration. */
  hasDurations: boolean;
}

export function ChartLegend({ theme, criticalPathStyle, showCriticalPath, ghostMode, tracing, hasDurations }: ChartLegendProps) {
  const [open, setOpen] = useReducer((_: boolean, next: boolean) => next, true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) setOpen(saved === "true");
    } catch {
      // Storage unavailable — start expanded.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(open));
    } catch {
      // Not worth surfacing.
    }
  }, [hydrated, open]);

  const surface = { background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" };

  return (
    <div style={{ ...surface, borderWidth: 1 }} className="mt-3 rounded-lg border px-3 py-2 text-xs">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1.5 font-semibold tracking-wide uppercase"
          style={{ color: theme.accent }}
        >
          <span aria-hidden="true" className="inline-block transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
            ›
          </span>
          Legend
        </button>
        {!open && <span className="opacity-60">Status, critical path and chart symbols</span>}
      </div>

      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <Diamond fill={theme.statusColor[s]} stroke={theme.markerHalo} />
              {STATUS_LABEL[s]}
            </span>
          ))}

          <span className="h-4 w-px" style={{ background: "var(--wf-border)" }} aria-hidden="true" />

          {showCriticalPath && (
            <span className="flex items-center gap-1.5">
              <LineSwatch color={theme.criticalPathColor} style={criticalPathStyle} />
              Critical path — the chain that sets the finish date
            </span>
          )}
          {tracing && (
            <span className="flex items-center gap-1.5">
              <LineSwatch color={theme.traceColor} style="solid" />
              Highlighted path
            </span>
          )}
          {hasDurations && (
            <span className="flex items-center gap-1.5">
              <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true">
                <rect x={1} y={3} width={24} height={7} rx={3.5} fill={theme.inkMuted} />
              </svg>
              Runs over a period
            </span>
          )}
          {ghostMode !== "off" && (
            <span className="flex items-center gap-1.5">
              <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true">
                <rect x={1} y={1} width={24} height={10} rx={5} fill="#f59e0b" />
                <text x={13} y={9} textAnchor="middle" fontSize={7} fontWeight={700} fill="#ffffff">
                  +21d
                </text>
              </svg>
              Slipped from its original date
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true">
              <line x1={13} y1={0} x2={13} y2={12} stroke="#e11d48" strokeWidth={1.25} strokeDasharray="3 3" />
            </svg>
            Today
          </span>
        </div>
      )}
    </div>
  );
}
