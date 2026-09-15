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
import type { LegendCategory, Status } from "./types";
import type { CriticalPathStyle } from "./use-critical-path-style";
import type { GhostMode, AtRiskMode } from "./RoadmapTimeline";

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

// One-click category creation reuses CategoryManager.tsx's exact literal
// default name/color, so a category created from either surface looks
// identical until renamed.
const NEW_CATEGORY_DEFAULT_COLOR = "#2563eb";

/**
 * A category has no chart-drawn silhouette of its own (unlike a status,
 * which reuses the Diamond marker shape) — a plain colored dot is enough.
 * Clickable/keyboard-activatable like AxisTriangleButton's own pattern, to
 * toggle this category's hidden state (t22, a viewer preference — see
 * use-hidden-categories.ts).
 */
function CategorySwatch({ category, hidden, onToggle }: { category: LegendCategory; hidden: boolean; onToggle: () => void }) {
  function onKeyDown(e: React.KeyboardEvent<HTMLSpanElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={!hidden}
      aria-label={`${category.name}${hidden ? " (hidden)" : ""}`}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      className="flex cursor-pointer items-center gap-1.5"
      style={{ opacity: hidden ? 0.4 : 1 }}
    >
      <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: category.color }} />
      <span style={{ textDecoration: hidden ? "line-through" : "none" }}>{category.name}</span>
    </span>
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
  atRiskMode: AtRiskMode;
  /** True while a trace is active, so the trace key only appears when it means something. */
  tracing: boolean;
  /** True when the document has at least one milestone with a duration. */
  hasDurations: boolean;
  /** Portfolio.legendCategories — only rendered when non-empty, per this component's "reflects what's on screen" doctrine. */
  categories?: LegendCategory[];
  /** Category ids currently unpainted for this viewer (t22 viewer preference) — a category swatch shows this state and toggles it. */
  hiddenCategoryIds?: Set<string>;
  onToggleCategory?: (id: string) => void;
  /** One-click category creation — calls straight into RoadmapWorkspace's box.addCategory, same handler CategoryManager.tsx's "Add a category" button uses. Omit to hide the add affordance (e.g. no document loaded yet). */
  onAddCategory?: (name: string, color: string) => void;
}

export function ChartLegend({
  theme,
  criticalPathStyle,
  showCriticalPath,
  ghostMode,
  atRiskMode,
  tracing,
  hasDurations,
  categories,
  hiddenCategoryIds,
  onToggleCategory,
  onAddCategory,
}: ChartLegendProps) {
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
  // "Reflects what's actually on screen" doctrine: only show the category
  // section when the document has categories to show, or when the add
  // affordance itself is still reachable (an empty document with no
  // categories yet, but a live onAddCategory handler to create the first one).
  const showCategories = (categories && categories.length > 0) || onAddCategory !== undefined;

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

          {showCategories && (
            <>
              {(categories ?? []).map((c) => (
                <CategorySwatch key={c.id} category={c} hidden={hiddenCategoryIds?.has(c.id) ?? false} onToggle={() => onToggleCategory?.(c.id)} />
              ))}
              {onAddCategory && (
                <button
                  type="button"
                  onClick={() => onAddCategory("New category", NEW_CATEGORY_DEFAULT_COLOR)}
                  aria-label="Add a category"
                  className="flex h-5 w-5 items-center justify-center rounded-full border text-[11px] leading-none opacity-70 hover:opacity-100"
                  style={{ borderColor: "var(--wf-border)" }}
                >
                  +
                </button>
              )}
              <span className="h-4 w-px" style={{ background: "var(--wf-border)" }} aria-hidden="true" />
            </>
          )}

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
          {atRiskMode !== "off" && (
            <span className="flex items-center gap-1.5">
              <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true">
                <line x1={1} y1={6} x2={17} y2={6} stroke={theme.statusColor["at-risk"]} strokeWidth={1.5} strokeDasharray="1 3" strokeLinecap="round" />
                <rect x={16} y={2} width={9} height={9} rx={2} fill="none" stroke={theme.statusColor["at-risk"]} strokeWidth={1.25} strokeDasharray="2 2" transform="rotate(45 20.5 6.5)" />
              </svg>
              At risk of slipping to a later date
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <svg width={26} height={12} viewBox="0 0 26 12" aria-hidden="true">
              <line x1={13} y1={0} x2={13} y2={12} stroke={theme.todayColor} strokeWidth={1.25} strokeDasharray="3 3" />
            </svg>
            Today
          </span>
        </div>
      )}
    </div>
  );
}
