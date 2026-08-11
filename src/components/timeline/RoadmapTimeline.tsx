// Swimlane & milestone timeline — the winning approach from the wayframe
// issue #7 design prototype (hand-rolled SVG, no layout library; orthogonal
// "elbow" dependency connectors; cushion-diamond milestone markers with a
// derived short label always visible and the full title on hover).
//
// Lane-scoped duration pills and opt-in reference lines (wayframe issue
// #15): a milestone with `endDate` renders as a duration pill instead of a
// point marker (same entity, not a separate item type — see
// Milestone.endDate's doc in types.ts); any milestone or top-level milestone
// with `showReferenceLine` draws a full-height line, the same mechanism as
// the always-on Today line.
"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { RoadmapData, Swimlane, Milestone, TopLevelItem } from "./types";
import type { Theme } from "./theme";
import { defaultTheme } from "./theme";
import { darken } from "./color-utils";
import { parseDate, formatDateShort, formatDateCompact } from "./date-utils";

import { laneColorAt } from "./lane-colors";
import { wrapText } from "./wrap-text";
import type { CriticalPathStyle } from "./use-critical-path-style";
import type { TopBandStyle } from "./use-top-band-style";
import type { PeriodGridlineStyle } from "./use-period-gridlines";
import { DATE_TIER_DY, DATE_CHAR_W, layoutDateLabels } from "./label-layout";
import { layoutTitleLabels, shouldLabel, CHAR_W, type LabelDensity, type TitlePlacement } from "./title-layout";
import { yearSegments, segmentsForTier, tierRowCount, AXIS_PRESETS, type AxisTierConfig, type Segment } from "./axis-tiers";

const MARGIN = { top: 20, right: 40, bottom: 20, left: 220 };
/**
 * Taller than it was: markers now carry wrapped real titles on two tiers
 * rather than a single line of initials, and that needs vertical room.
 */
const LANE_HEIGHT = 132;
/** Line height of a wrapped marker label. */
const LABEL_LINE_H = 11;
/** Gap between the marker and the bottom line of its label block. */
const LABEL_BASE_DY = -14;
/** Extra lift for tier-1 labels so they clear a full two-line tier-0 block. */
const LABEL_TIER_LIFT = 27;
/**
 * Bare ground left above and below each lane's wash. Lanes used to sit flush
 * against each other with a 1px divider, which read as one continuous field;
 * a real gutter is what makes crossing into a new lane register.
 */
const LANE_GUTTER = 7;
const SEPARATOR_HEIGHT = 30;
const TOP_BAND_HEIGHT = 90;
const AXIS_ROW_HEIGHT = 22;
const PILL_HEIGHT_LG = 20;
const PILL_HEIGHT_SM = 14; // in-lane duration pills (wayframe#15)
const RAIL_W = 4; // lane-colour rail on the inner edge of the lane header
const DRAG_THRESHOLD_PX = 3; // below this a gesture is a click, not a drag
/**
 * Below this the chart stops shrinking and the container scrolls instead —
 * squeezing a multi-year programme into a phone width makes every label
 * collide and helps nobody.
 */
const MIN_CHART_WIDTH = 900;

interface RowInfo {
  swimlane: Swimlane;
  relY: number;
  height: number;
  laneIndex: number; // -1 for separators; cycles only across "lane" rows, for tint color assignment
}

function computeRows(swimlanes: Swimlane[], laneHeight = LANE_HEIGHT, separatorHeight = SEPARATOR_HEIGHT): RowInfo[] {
  let y = 0;
  let laneIndex = 0;
  const out: RowInfo[] = [];
  for (const sl of [...swimlanes].sort((a, b) => a.order - b.order)) {
    const height = sl.type === "separator" ? separatorHeight : laneHeight;
    out.push({ swimlane: sl, relY: y, height, laneIndex: sl.type === "lane" ? laneIndex : -1 });
    if (sl.type === "lane") laneIndex += 1;
    y += height;
  }
  return out;
}

function computeDomain(data: RoadmapData): { domainMin: number; domainMax: number } {
  const allDates = [
    ...data.milestones.map((m) => m.date),
    ...data.milestones.filter((m) => m.endDate).map((m) => m.endDate!),
    ...data.milestones.filter((m) => m.originalDate).map((m) => m.originalDate!),
    ...data.topLevelItems.map((t) => ("date" in t ? t.date : t.endDate)),
    ...data.topLevelItems.map((t) => ("startDate" in t ? t.startDate : t.date)),
  ];
  const minDate = parseDate(allDates.reduce((a, b) => (a < b ? a : b)));
  const maxDate = parseDate(allDates.reduce((a, b) => (a > b ? a : b)));
  const PAD_DAYS = 14 * 86400000;
  return { domainMin: minDate - PAD_DAYS, domainMax: maxDate + PAD_DAYS };
}

function AxisRow({
  y,
  segments,
  theme,
  opacity,
  xOf,
  rowHeight = AXIS_ROW_HEIGHT,
  fontScale = 1,
}: {
  y: number;
  segments: Segment[];
  theme: Theme;
  opacity: number;
  xOf: (ts: number) => number;
  rowHeight?: number;
  fontScale?: number;
}) {
  return (
    <>
      {segments.map((s) => (
        <g key={s.label + s.start}>
          <rect x={xOf(s.start)} y={y} width={xOf(s.end) - xOf(s.start)} height={rowHeight} fill={theme.axisBg} fillOpacity={opacity} />
          <line x1={xOf(s.start)} x2={xOf(s.start)} y1={y} y2={y + rowHeight} stroke={theme.axisText} strokeOpacity={0.25} />
          <text x={(xOf(s.start) + xOf(s.end)) / 2} y={y + rowHeight - 7} textAnchor="middle" fontSize={11 * fontScale} fontWeight={700} fill={theme.axisText}>
            {s.label}
          </text>
        </g>
      ))}
    </>
  );
}

// rotated rounded-square = softened "cushion" diamond
function CushionMarker({
  cx,
  cy,
  r,
  fill,
  stroke,
  strokeWidth,
  strokeDasharray,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}) {
  return (
    <rect
      x={cx - r}
      y={cy - r}
      width={r * 2}
      height={r * 2}
      rx={r * 0.4}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      transform={`rotate(45 ${cx} ${cy})`}
    />
  );
}

/**
 * Per-lane "add a milestone" affordance, in the top corner of the lane
 * header. Sits in the header rather than floating over the plot area so it
 * never overlaps a marker, and it's the only place in the chart that
 * creates content — everything else edits what's already there.
 */
function AddMilestoneButton({
  laneId,
  x,
  y,
  theme,
  onAdd,
}: {
  laneId: string;
  x: number;
  y: number;
  theme: Theme;
  onAdd: (laneId: string) => void;
}) {
  const r = 8;
  return (
    <g
      className="cursor-pointer opacity-45 transition-opacity hover:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        onAdd(laneId);
      }}
      role="button"
      tabIndex={0}
      aria-label={`Add a milestone to this lane`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAdd(laneId);
        }
      }}
    >
      <circle cx={x} cy={y} r={r} fill="none" stroke={theme.ink} strokeWidth={1.25} />
      <line x1={x - 4} x2={x + 4} y1={y} y2={y} stroke={theme.ink} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={x} x2={x} y1={y - 4} y2={y + 4} stroke={theme.ink} strokeWidth={1.5} strokeLinecap="round" />
      <title>Add a milestone</title>
    </g>
  );
}

// PROGRAM-band highlight treatment + its manual add-milestone/phase
// affordance (wayframe#41) — three variants, all kept as a real viewer style
// switcher (see use-top-band-style.ts) rather than one picked default; each
// pairs its own band chrome with its own add-affordance shape. "tint"'s
// picker popover anchors its *right* edge to the button rather than
// centering under it — centered clipped off the right edge of the chart at
// realistic widths, since the button itself sits close to that edge.

/** "tint" style — single "+" that pops a Milestone/Phase picker. */
function TopBandAddPicker({
  x,
  y,
  theme,
  onPick,
  fontScale = 1,
}: {
  x: number;
  y: number;
  theme: Theme;
  onPick: (kind: "milestone" | "phase") => void;
  fontScale?: number;
}) {
  const [open, setOpen] = useState(false);
  const r = 9;
  const popW = 124;
  const popX = x - popW;
  const popCenter = popX + popW / 2;
  return (
    <g>
      <g
        className="cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        role="button"
        tabIndex={0}
        aria-label="Add to the PROGRAM band"
      >
        <circle cx={x} cy={y} r={r} fill={theme.accent} />
        <line x1={x - 4} x2={x + 4} y1={y} y2={y} stroke="#fff" strokeWidth={1.75} strokeLinecap="round" />
        <line x1={x} x2={x} y1={y - 4} y2={y + 4} stroke="#fff" strokeWidth={1.75} strokeLinecap="round" />
        <title>Add to PROGRAM band</title>
      </g>
      {open && (
        <g>
          <rect x={popX} y={y + r + 4} width={popW} height={54} rx={6} fill={theme.panelBg} stroke={theme.panelBorder} />
          <text
            x={popCenter}
            y={y + r + 22}
            textAnchor="middle"
            fontSize={11 * fontScale}
            fontWeight={600}
            fill={theme.panelInk}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onPick("milestone");
            }}
          >
            + Milestone
          </text>
          <text
            x={popCenter}
            y={y + r + 42}
            textAnchor="middle"
            fontSize={11 * fontScale}
            fontWeight={600}
            fill={theme.panelInk}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onPick("phase");
            }}
          >
            + Phase
          </text>
        </g>
      )}
    </g>
  );
}

/** "border" style — two explicit labeled buttons under the header column, no picker. */
function TopBandLabeledButton({
  x,
  y,
  theme,
  label,
  onAdd,
  fontScale = 1,
  metricsScale = 1,
}: {
  x: number;
  y: number;
  theme: Theme;
  label: string;
  onAdd: () => void;
  fontScale?: number;
  metricsScale?: number;
}) {
  const w = label.length * 5.6 * metricsScale + 16;
  return (
    <g
      className="cursor-pointer opacity-70 transition-opacity hover:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      role="button"
      tabIndex={0}
      aria-label={label}
    >
      <rect x={x} y={y - 9} width={w} height={18} rx={9} fill="none" stroke={theme.ink} strokeWidth={1} />
      <text x={x + w / 2} y={y + 4} textAnchor="middle" fontSize={10 * fontScale} fontWeight={600} fill={theme.ink}>
        {label}
      </text>
      <title>{label}</title>
    </g>
  );
}

/**
 * Critical-path connectors. Style is a viewer preference — "double" is a
 * wide stroke overprinted with a narrower ground-coloured one, which reads
 * as two parallel lines on the orthogonal elbow paths without needing real
 * path insetting.
 */
function criticalStroke(style: CriticalPathStyle): { width: number; dash?: string; overprint?: number } {
  switch (style) {
    case "solid":
      return { width: 2 };
    case "thick":
      return { width: 4 };
    case "dashed":
      return { width: 2.5, dash: "7 4" };
    case "double":
      return { width: 5, overprint: 1.8 };
  }
}

// full-height opt-in marker line (wayframe#15) — same shape as the always-on
// Today line, parameterized so both share one implementation.
//
// `topMarker` (wayframe#38 item 5 / #39) draws a downward-pointing triangle
// at the line's top, reserved for the Today line — every other reference
// line keeps the plain dashed-line-plus-text treatment. `topY` now reaches
// all the way to the chart's top margin on every call site (was topBandY /
// topBandY+22, which landed the line's top — and the label right above it —
// on the axis band's own tier-row text, illegible red-on-gray colliding
// with e.g. the Quarter row's label).
//
// The Today label used to sit directly below the triangle (topY+12), which
// pushed it into the tier-1 axis row — a themed, sometimes-dark background
// it could collide with both visually (contrast) and spatially (the row's
// own date text). Fixed for wayframe#40/#49: the label now sits at the same
// height as every other reference line's label (topY-4, inside the neutral
// margin band), offset further right to clear the triangle instead of
// stacking under it, and rides a solid chip so it stays legible regardless
// of what's behind it.
function ReferenceLine({
  x: cx,
  topY,
  bottomY,
  label,
  color,
  dash = "2 2",
  topMarker = false,
  fontScale = 1,
  metricsScale = 1,
}: {
  x: number;
  topY: number;
  bottomY: number;
  label: string;
  color: string;
  dash?: string;
  topMarker?: boolean;
  fontScale?: number;
  metricsScale?: number;
}) {
  const chipX = cx + 8;
  const chipW = Math.max(40, label.length * 6.2 * metricsScale + 10);
  return (
    // Reference lines are painted after the markers, so without this they
    // swallow clicks on any milestone sitting on the same date — the GA
    // milestone sits exactly on the GA reference line and couldn't be
    // opened at all.
    <g pointerEvents="none">
      <line x1={cx} x2={cx} y1={topY} y2={bottomY} stroke={color} strokeWidth={1.25} strokeDasharray={dash} opacity={0.7} />
      {topMarker && <path d={`M${cx - 5},${topY - 9} L${cx + 5},${topY - 9} L${cx},${topY} Z`} fill={color} />}
      {topMarker ? (
        <>
          <rect x={chipX} y={topY - 13} width={chipW} height={13} rx={4} fill={color} />
          <text x={chipX + chipW / 2} y={topY - 4} textAnchor="middle" fontSize={9 * fontScale} fontWeight={700} fill="#ffffff">
            {label}
          </text>
        </>
      ) : (
        <text x={cx + 4} y={topY - 4} fontSize={9 * fontScale} fontWeight={700} fill={color}>
          {label}
        </text>
      )}
    </g>
  );
}

// Ghost-rendering a slipped milestone (Milestone.date !== originalDate,
// wayframe#29/#30). Two selectable styles, both won a live prototype
// stress-test over a third (a connector line from the old date to the new
// one — tangled with dependency connectors and was dropped): "badge" draws
// nothing at the old date at all, just a +/-Nd marker beside the current
// one; "outline" draws a dashed outline at the old date, no connector.
export type GhostMode = "off" | "badge" | "outline";

function daysBetween(fromDateStr: string, toDateStr: string): number {
  return Math.round((parseDate(toDateStr) - parseDate(fromDateStr)) / 86400000);
}

function GhostOutline({ m, ghostCx, cy }: { m: Milestone; ghostCx: number; cy: number }) {
  return (
    <g data-testid={`ghost-outline-${m.id}`}>
      <CushionMarker cx={ghostCx} cy={cy} r={8} fill="none" stroke="currentColor" strokeWidth={1.25} strokeDasharray="2 2" />
    </g>
  );
}

function GhostBadge({
  m,
  cx,
  cy,
  fontScale = 1,
  metricsScale = 1,
}: {
  m: Milestone;
  cx: number;
  cy: number;
  fontScale?: number;
  metricsScale?: number;
}) {
  const slipDays = daysBetween(m.originalDate!, m.date);
  const late = slipDays > 0;
  const label = `${late ? "+" : ""}${slipDays}d`;
  const badgeW = Math.max(22, label.length * 6 * metricsScale + 8);
  const bx = cx + 12;
  const by = cy - 18;
  return (
    <g data-testid={`ghost-badge-${m.id}`}>
      <rect x={bx} y={by} width={badgeW} height={13} rx={6.5} fill={late ? "#f59e0b" : "#0ea5e9"} />
      <text x={bx + badgeW / 2} y={by + 9.5} textAnchor="middle" fontSize={8 * fontScale} fontWeight={700} fill="#ffffff">
        {label}
      </text>
    </g>
  );
}

function MilestoneMarker({
  m,
  cx,
  cy,
  theme,
  primary,
  date,
  onClick,
  ghostMode,
  ghostCx,
  showCriticalPath,
  traceState,
  onDragStart,
  dragDx,
  dragging,
  fontScale = 1,
  metricsScale = 1,
}: {
  m: Milestone;
  cx: number;
  cy: number;
  theme: Theme;
  primary: TitlePlacement | null;
  date: { text: string; tier: 0 | 1 | 2 };
  onClick?: (m: Milestone, evt: React.MouseEvent<SVGGElement>) => void;
  ghostMode: GhostMode;
  /** x position of the original (pre-slip) date, or null if not slipped / ghosts off. */
  ghostCx: number | null;
  showCriticalPath: boolean;
  /** "in" = part of the active trace, "out" = dimmed, null = no trace running. */
  traceState: "in" | "out" | null;
  /** Non-null when the chart is draggable; called on pointer-down to begin a drag. */
  onDragStart?: (m: Milestone, evt: React.PointerEvent<SVGGElement>) => void;
  /** Live x offset while this marker is being dragged. */
  dragDx?: number;
  dragging?: boolean;
  fontScale?: number;
  metricsScale?: number;
}) {
  const r = 8;
  const dateDy = DATE_TIER_DY[date.tier];
  // Label block grows upward from its baseline, so the last line sits
  // closest to the marker and the first line ends up on top. The gap and
  // tier lift scale with fontScale — otherwise a bigger label's lines
  // close in on the fixed-size gap below them and start overlapping the
  // marker or, at tier 1, the tier-0 block they're meant to clear.
  const labelBaseDy = LABEL_BASE_DY * fontScale - (primary ? primary.tier * LABEL_TIER_LIFT * fontScale : 0);
  const tooltipW = Math.max(40, m.title.length * 6 * metricsScale + 16);
  const hasGhost = ghostCx !== null;
  const critical = showCriticalPath && m.isCriticalPath;

  // The whole marker translates during a drag so the label and date ride
  // along with it, rather than the diamond detaching from its own caption.
  return (
    <g
      className={onDragStart ? "group cursor-grab active:cursor-grabbing" : onClick ? "group cursor-pointer" : "group cursor-default"}
      transform={dragDx ? `translate(${dragDx} 0)` : undefined}
      // Dimming everything outside the trace is what makes the traced path
      // legible on a dense chart — highlighting alone doesn't separate it.
      opacity={dragging ? 0.85 : traceState === "out" ? 0.22 : 1}
      onClick={onClick ? (e) => onClick(m, e) : undefined}
      onPointerDown={onDragStart ? (e) => onDragStart(m, e) : undefined}
    >
      {/* Native browser tooltip hinting the marker opens an editor —
          double-clicking a milestone to rename it worked but wasn't
          discoverable at all (wayframe#38 item 2 / #39). Separate from the
          custom hover tooltip below, which shows the title, not the
          affordance. */}
      {onClick && <title>Click to edit</title>}
      {hasGhost && ghostMode === "outline" && <GhostOutline m={m} ghostCx={ghostCx!} cy={cy} />}
      {/* Tier-1 labels sit far enough above the marker to need a leader
          line back to it, or they read as belonging to the lane above. */}
      {primary && primary.tier === 1 && (
        <line x1={cx} y1={cy - r - 1} x2={cx} y2={cy + labelBaseDy + 3} stroke="currentColor" strokeOpacity={0.25} />
      )}
      {date.tier === 2 && <line x1={cx} y1={cy + r + 1} x2={cx} y2={cy + dateDy - 4} stroke="currentColor" strokeOpacity={0.3} />}
      {/* Critical path is an ink collar, never a red ring — red already
          means "delayed", and the two measured 1.28:1 apart, so the
          highest-severity state used to be the least legible. */}
      {critical && <CushionMarker cx={cx} cy={cy} r={r + 4} fill="none" stroke={theme.criticalPathColor} strokeWidth={2} />}
      {traceState === "in" && <CushionMarker cx={cx} cy={cy} r={r + (critical ? 7.5 : 4)} fill="none" stroke={theme.traceColor} strokeWidth={2} />}
      <CushionMarker cx={cx} cy={cy} r={r} fill={theme.statusColor[m.status]} stroke={theme.markerHalo} strokeWidth={1.5} />
      {primary?.lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={cy + labelBaseDy - (primary.lines.length - 1 - i) * LABEL_LINE_H * fontScale}
          textAnchor="middle"
          fontSize={10 * fontScale}
          fontWeight={600}
          fill="currentColor"
        >
          {line}
        </text>
      ))}
      <text x={cx} y={cy + dateDy} textAnchor="middle" fontSize={9 * fontScale} fill="currentColor" opacity={0.6}>
        {date.text}
      </text>
      {hasGhost && ghostMode === "badge" && <GhostBadge m={m} cx={cx} cy={cy} fontScale={fontScale} metricsScale={metricsScale} />}
      {/* hover reveal: full title. CSS-only (no JS state) — a real <title>
          element gets hoisted by React 19 as document metadata even inside
          <svg>, which desyncs SSR/client, so this is the workaround. */}
      <g className="pointer-events-none opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        <rect x={cx - tooltipW / 2} y={cy - 58} width={tooltipW} height={hasGhost ? 34 : 20} rx={4} fill="#18181b" />
        <text x={cx} y={cy - 44} textAnchor="middle" fontSize={11 * fontScale} fill="#ffffff">
          {m.title}
        </text>
        {hasGhost && (
          <text x={cx} y={cy - 30} textAnchor="middle" fontSize={9 * fontScale} fill="#ffffff" opacity={0.7}>
            <tspan textDecoration="line-through">{formatDateShort(m.originalDate!)}</tspan> → {formatDateShort(m.date)}
          </text>
        )}
      </g>
    </g>
  );
}

export interface RoadmapTimelineProps {
  data: RoadmapData;
  theme?: Theme;
  axisTiers?: AxisTierConfig;
  /** Defaults to the real current date; override for tests/screenshots. */
  today?: Date;
  /** Opens the manual milestone editor (wayframe#19) — omit to keep markers non-interactive. */
  onMilestoneClick?: (m: Milestone, evt: React.MouseEvent<SVGGElement>) => void;
  /** Opens the lighter phase/top-level-milestone editor (wayframe#19) — not offered for annotations. */
  onTopLevelItemClick?: (t: TopLevelItem, evt: React.MouseEvent<SVGGElement>) => void;
  /** Ghost-render slipped milestones (wayframe#29/#30) — off by default; callers opt in. */
  ghostMode?: GhostMode;
  /** Show computed/override critical-path highlighting (wayframe#34/#35) — a viewer preference, on by default. */
  showCriticalPath?: boolean;
  /**
   * Fixed chart width. Omit it and the chart measures its own container and
   * fills it — which is what makes the whole programme fit in a screenshot
   * instead of running off the right edge. Callers that need a deterministic
   * size (the off-screen export capture) still pass one.
   */
  width?: number;
  /** Line treatment for critical-path connectors — a viewer preference. */
  criticalPathStyle?: CriticalPathStyle;
  /** Renders a per-lane "+" in the lane header when provided. */
  onAddMilestone?: (laneId: string) => void;
  /** Fired after a marker is dragged to a new date (snapped to a day). */
  onMilestoneDateChange?: (milestoneId: string, isoDate: string) => void;
  /** Ids in the active trace — highlighted in the theme's trace colour. */
  tracedIds?: Set<string>;
  /** Which markers carry a label — a viewer preference for dense programmes. */
  labelDensity?: LabelDensity;
  /** PROGRAM-band highlight treatment (wayframe#41) — a viewer preference, see use-top-band-style.ts. */
  topBandStyle?: TopBandStyle;
  /** Renders the PROGRAM band's manual "+" (in whichever shape topBandStyle calls for) when provided. */
  onAddTopLevelItem?: (kind: "milestone" | "phase") => void;
  // --- Font-scale system (wayframe#42/#50) ---
  /** Multiplies every rendered text `fontSize`. Defaults to 1. */
  fontScale?: number;
  /** Overrides `theme.font` at the SVG root when set — an independent viewer preference, not a per-theme token; see use-font-family.ts. */
  fontFamily?: string;
  /**
   * Multiplies the text-width-estimate constants that feed label-collision
   * math and computed chip/badge/tooltip/button widths — kept independent of
   * `fontScale` at the call site below so the two always move together, but
   * a caller (e.g. a test) can still isolate one from the other. Defaults to 1.
   */
  metricsScale?: number;
  /** Multiplies row/pill/axis/top-band box heights. Defaults to 1. */
  boxScale?: number;
  /** Opt-in period-boundary gridlines (wayframe#44/#53) — a viewer preference, see use-period-gridlines.ts. */
  periodGridlineStyle?: PeriodGridlineStyle;
}

export function RoadmapTimeline({
  data,
  theme = defaultTheme,
  axisTiers = AXIS_PRESETS[1],
  width: fixedWidth,
  today = new Date(),
  onMilestoneClick,
  onTopLevelItemClick,
  ghostMode = "off",
  showCriticalPath = true,
  criticalPathStyle = "thick",
  onAddMilestone,
  onMilestoneDateChange,
  tracedIds,
  labelDensity = "all",
  topBandStyle = "chip",
  onAddTopLevelItem,
  fontScale = 1,
  fontFamily,
  metricsScale = 1,
  boxScale = 1,
  periodGridlineStyle = "year-line",
}: RoadmapTimelineProps) {
  const rows = computeRows(data.swimlanes, LANE_HEIGHT * boxScale, SEPARATOR_HEIGHT * boxScale);
  const bodyHeight = rows.reduce((sum, r) => sum + r.height, 0);
  const rowById = new Map(rows.map((r) => [r.swimlane.id, r]));
  const milestoneById = new Map(data.milestones.map((m) => [m.id, m]));
  /**
   * Drag-to-reschedule. Pointer capture on the marker's <g>, x translated
   * back to a date through the inverse of the x scale and snapped to a
   * whole day. The commit goes out through onMilestoneDateChange so it
   * lands as a normal edit — cascade and undo included — rather than
   * mutating the document behind the reducer's back.
   *
   * A drag only counts past DRAG_THRESHOLD_PX; below that the gesture is
   * left alone so a click still opens the editor.
   */
  const [drag, setDrag] = useState<{ id: string; startX: number; dx: number; moved: boolean } | null>(null);

  // Measured from the container, not from the window: the chart sits inside
  // a padded, max-width wrapper, so window width would overshoot by exactly
  // the padding and reintroduce the overflow this removes.
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (fixedWidth !== undefined) return;
    const el = containerRef.current;
    if (!el) return;
    const apply = () => setMeasuredWidth(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedWidth]);
  const width = fixedWidth ?? Math.max(measuredWidth ?? MIN_CHART_WIDTH, MIN_CHART_WIDTH);
  const laneCount = rows.filter((r) => r.swimlane.type === "lane").length;
  /**
   * A lane's accent. `Swimlane.color` is a per-document override (same
   * pattern as ragOverride / isCriticalPathOverride); unset generates from
   * the theme's ramp, spread across however many lanes exist — so adding a
   * seventh lane gives it its own colour instead of reusing the first's.
   */
  function laneColor(lane: Swimlane, laneIndex: number): string {
    return lane.color ?? laneColorAt(theme.laneRamp, laneIndex, laneCount);
  }
  function laneTint(laneId: string): string {
    const row = rowById.get(laneId);
    if (!row) return laneColorAt(theme.laneRamp, 0, laneCount);
    return laneColor(row.swimlane, row.laneIndex);
  }
  const { domainMin, domainMax } = computeDomain(data);
  const todayTs = today.getTime();

  const innerWidth = width - MARGIN.left - MARGIN.right;
  function x(dateStr: string): number {
    return MARGIN.left + ((parseDate(dateStr) - domainMin) / (domainMax - domainMin)) * innerWidth;
  }
  function xTs(ts: number): number {
    return MARGIN.left + ((ts - domainMin) / (domainMax - domainMin)) * innerWidth;
  }

  const axisRowHeight = AXIS_ROW_HEIGHT * boxScale;
  const axisHeight = axisRowHeight * tierRowCount(axisTiers);
  const topBandHeight = TOP_BAND_HEIGHT * boxScale;
  const topBandY = MARGIN.top + axisHeight;
  const lanesTop = topBandY + topBandHeight;
  const height = lanesTop + bodyHeight + MARGIN.bottom;

  function laneY(laneId: string): number {
    const row = rowById.get(laneId);
    if (!row) return lanesTop;
    return lanesTop + row.relY + row.height / 2;
  }

  // per-lane label layout — titles are wrapped into the room each marker
  // actually has, computed per lane so a crowded lane doesn't shrink labels
  // in a sparse one.
  const primaryPlacement = new Map<string, TitlePlacement>();
  const datePlacement = new Map<string, { text: string; tier: 0 | 1 | 2 }>();
  for (const laneRow of rows.filter((r) => r.swimlane.type === "lane")) {
    // Duration-pill milestones (endDate set) show their own inline title and
    // don't participate in the point-marker tiered-label layout.
    const laneMilestones = data.milestones.filter((m) => m.laneId === laneRow.swimlane.id && !m.endDate);
    // Pills are passed in too: they print their own title inside the bar, so
    // they take no label tier, but they occupy the row and point labels have
    // to route around them.
    const lanePills = data.milestones.filter((m) => m.laneId === laneRow.swimlane.id && m.endDate);
    const primary = layoutTitleLabels([
      ...laneMilestones.map((m) => ({
        id: m.id,
        x: x(m.date),
        title: m.title,
        shortLabel: m.shortLabel,
        critical: showCriticalPath && m.isCriticalPath,
        labelled: shouldLabel(labelDensity, {
          critical: showCriticalPath && m.isCriticalPath,
          offTrack: m.status === "at-risk" || m.status === "delayed",
        }),
      })),
      ...lanePills.map((m) => ({ id: m.id, x: x(m.date), endX: x(m.endDate!), title: m.title, labelled: false })),
    ], 2, CHAR_W * metricsScale);
    const dates = layoutDateLabels(
      laneMilestones.map((m) => ({ id: m.id, x: x(m.date), full: formatDateShort(m.date), compact: formatDateCompact(m.date) })),
      DATE_CHAR_W * metricsScale,
    );
    for (const [k, v] of primary) primaryPlacement.set(k, v);
    for (const [k, v] of dates) datePlacement.set(k, v);
  }

  /** Inverse of x(): a pixel position back to an ISO date, snapped to a day. */
  function dateAtX(px: number): string {
    const ts = domainMin + ((px - MARGIN.left) / innerWidth) * (domainMax - domainMin);
    const d = new Date(ts);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
  }

  function beginDrag(m: Milestone, evt: React.PointerEvent<SVGGElement>) {
    if (!onMilestoneDateChange) return;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    setDrag({ id: m.id, startX: evt.clientX, dx: 0, moved: false });
  }

  function moveDrag(evt: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const dx = evt.clientX - drag.startX;
    setDrag({ ...drag, dx, moved: drag.moved || Math.abs(dx) > DRAG_THRESHOLD_PX });
  }

  function endDrag() {
    if (!drag) return;
    const m = milestoneById.get(drag.id);
    if (m && drag.moved && onMilestoneDateChange) {
      const next = dateAtX(x(m.date) + drag.dx);
      if (next !== m.date) onMilestoneDateChange(m.id, next);
    }
    setDrag(null);
  }

  const axisRows: { segments: Segment[]; opacity: number }[] = [{ segments: yearSegments(domainMin, domainMax), opacity: 1 }];
  if (axisTiers.tier2 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier2, domainMin, domainMax), opacity: 0.8 });
  if (axisTiers.tier3 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier3, domainMin, domainMax), opacity: 0.6 });

  const programNameLines = wrapText(data.programName, Math.max(6, Math.floor(26 / metricsScale)), 3);

  return (
    <div ref={containerRef} className="overflow-x-auto" data-testid="roadmap-timeline" style={{ background: theme.ground }}>
      {/* `color` (not a Tailwind class) drives every `currentColor` in the
          chart, so the theme owns the ink rather than the page's dark-mode
          class deciding it. */}
      <svg
        width={width}
        height={height}
        style={{ fontFamily: fontFamily ?? theme.font, color: theme.ink, background: theme.ground }}
        onPointerMove={drag ? moveDrag : undefined}
        onPointerUp={drag ? endDrag : undefined}
        onPointerCancel={drag ? endDrag : undefined}
      >
        {axisRows.map((row, i) => (
          <AxisRow key={i} y={MARGIN.top + i * axisRowHeight} segments={row.segments} theme={theme} opacity={row.opacity} xOf={xTs} rowHeight={axisRowHeight} fontScale={fontScale} />
        ))}

        {/* PROGRAM-band highlight treatment (wayframe#41) — "tint"/"border" paint the band itself; "chip" leaves it unpainted. */}
        {topBandStyle === "tint" && <rect x={0} y={topBandY} width={width} height={topBandHeight} fill={theme.accent} fillOpacity={0.08} />}
        {topBandStyle === "border" && (
          <>
            <rect x={0} y={topBandY} width={width} height={3} fill={theme.accent} />
            <rect x={0} y={topBandY + topBandHeight - 1} width={width} height={1} fill={theme.accent} fillOpacity={0.4} />
          </>
        )}
        {/* "chip" — a small "PROGRAM" chip ahead of the programme name, no band fill. Its box
            was fixed-size before the font-scale system (wayframe#42/#50) — now derived from
            "PROGRAM"'s own text length so it doesn't clip at large fontScale like every other
            chip/badge/button in this file. */}
        {topBandStyle === "chip" && (
          <>
            <rect x={16} y={topBandY + 3} width={"PROGRAM".length * 5.4 * metricsScale + 20} height={13} rx={6.5} fill={theme.accent} />
            <text
              x={16 + ("PROGRAM".length * 5.4 * metricsScale + 20) / 2}
              y={topBandY + 12}
              textAnchor="middle"
              fontSize={8.5 * fontScale}
              fontWeight={700}
              fill="#fff"
              style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              Program
            </text>
          </>
        )}

        {/* Top-level band header. This used to read a generic "PROGRAM" —
            the roadmap's actual name appeared nowhere on the chart, so an
            exported slide or a screenshot didn't say what programme it was
            for. Wrapped to the header column since real programme names
            don't fit on one line. The char budget shrinks as metricsScale
            grows so wider glyphs still wrap inside the same header column
            instead of running into the phase timeline beside it. */}
        {programNameLines.map((line, i) => (
          <text key={i} x={16} y={topBandY + (topBandStyle === "chip" ? 30 : 14) + i * 15 * fontScale} fontSize={13 * fontScale} fontWeight={700} fill={theme.ink}>
            {line}
          </text>
        ))}
        {data.owner && (
          <text
            x={16}
            y={topBandY + (topBandStyle === "chip" ? 30 : 14) + programNameLines.length * 15 * fontScale + 4 * fontScale}
            fontSize={10 * fontScale}
            fill={theme.inkMuted}
          >
            {data.owner}
          </text>
        )}
        {data.topLevelItems.map((t: TopLevelItem) => {
          const y = topBandY + topBandHeight / 2;
          if (t.type === "phase") {
            const px = x(t.startDate);
            const h = PILL_HEIGHT_LG * boxScale;
            const w = Math.max(h, x(t.endDate) - px);
            // Clipped to the pill's own pixel width, same pattern as the
            // in-lane duration pills below — otherwise a bigger fontScale
            // (with boxScale left at 1) runs the label straight into its
            // neighbour instead of the pill growing to make room.
            const labelChars = Math.floor((w - h) / (5.4 * metricsScale));
            const label = labelChars >= 4 ? wrapText(t.title, labelChars, 1)[0] : null;
            return (
              <g key={t.id} className={onTopLevelItemClick ? "cursor-pointer" : undefined} onClick={onTopLevelItemClick ? (e) => onTopLevelItemClick(t, e) : undefined}>
                <rect
                  x={px}
                  y={y - h / 2}
                  width={w}
                  height={h}
                  rx={h / 2}
                  fill={theme.statusColor[t.status]}
                  fillOpacity={0.35}
                  stroke={theme.statusColor[t.status]}
                />
                {label && (
                  <text x={px + h / 2} y={y + 4} fontSize={11 * fontScale} fontWeight={600}>
                    {label}
                  </text>
                )}
              </g>
            );
          }
          if (t.type === "milestone") {
            const cx = x(t.date);
            return (
              <g key={t.id} className={onTopLevelItemClick ? "cursor-pointer" : undefined} onClick={onTopLevelItemClick ? (e) => onTopLevelItemClick(t, e) : undefined}>
                <CushionMarker cx={cx} cy={y} r={10} fill={theme.statusColor[t.status]} stroke="#fff" strokeWidth={2} />
                <text x={cx} y={y - 18} textAnchor="middle" fontSize={11 * fontScale} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          // Annotations draw nothing here. Their full-height line used to be
          // emitted in this block, which runs before the swimlane rows, so
          // every lane wash and separator band painted straight over it —
          // the Board Review line disappeared behind the Commercialization
          // header. It's drawn in the vertical-marker layer below instead,
          // with the other full-height lines.
          return null;
        })}

        {/* Manual add-to-PROGRAM-band affordance (wayframe#41) — shape follows topBandStyle. */}
        {onAddTopLevelItem && topBandStyle === "tint" && (
          <TopBandAddPicker x={width - 24} y={topBandY + 16} theme={theme} onPick={onAddTopLevelItem} fontScale={fontScale} />
        )}
        {onAddTopLevelItem && topBandStyle === "border" && (
          <>
            <TopBandLabeledButton x={16} y={topBandY + topBandHeight - 22} theme={theme} label="+ Milestone" onAdd={() => onAddTopLevelItem("milestone")} fontScale={fontScale} metricsScale={metricsScale} />
            <TopBandLabeledButton x={104} y={topBandY + topBandHeight - 22} theme={theme} label="+ Phase" onAdd={() => onAddTopLevelItem("phase")} fontScale={fontScale} metricsScale={metricsScale} />
          </>
        )}
        {/* "chip" deliberately reuses the per-lane button verbatim, same corner position as a lane row's —
            milestone-only, no picker; a phase-only-buildable-from-elsewhere tradeoff accepted in favor of the
            top band's minimal footprint (switch to "border" or "tint" in the options menu to add a phase). */}
        {onAddTopLevelItem && topBandStyle === "chip" && (
          <AddMilestoneButton laneId="__top__" x={MARGIN.left - RAIL_W - 20} y={topBandY + 16} theme={theme} onAdd={() => onAddTopLevelItem("milestone")} />
        )}

        {/* swimlane rows: separators (group headers) + lanes with a solid darker header block */}
        {rows.map((row) => {
          const y0 = lanesTop + row.relY;
          if (row.swimlane.type === "separator") {
            return (
              <g key={row.swimlane.id}>
                <rect x={0} y={y0} width={width} height={row.height} fill={theme.separatorBg} />
                <text
                  x={16}
                  y={y0 + row.height / 2}
                  fontSize={10.5 * fontScale}
                  fontWeight={700}
                  letterSpacing="0.09em"
                  fill={theme.separatorText}
                  dominantBaseline="middle"
                  // CSS, not .toUpperCase() — keeps the real string in the DOM
                  // so assistive tech doesn't announce it as an initialism.
                  style={{ textTransform: "uppercase" }}
                >
                  {row.swimlane.name}
                </text>
              </g>
            );
          }
          // No header slab. Lane identity is a colour rail plus a faint wash
          // over the plot area; the name sits directly on the chart ground in
          // ink. Filling the header — whether with the lane colour or with a
          // neutral — puts the heaviest mark on the chart next to the thing
          // that carries the least information.
          const tint = laneColor(row.swimlane, row.laneIndex);
          return (
            <g key={row.swimlane.id}>
              {/* The wash and rail are inset by LANE_GUTTER so bare ground
                  shows between lanes. Adjacent washes that touch read as one
                  continuous field with a hairline in it; a real gap is what
                  makes the lane change register. */}
              <rect
                x={MARGIN.left}
                y={y0 + LANE_GUTTER}
                width={innerWidth}
                height={row.height - LANE_GUTTER * 2}
                fill={tint}
                fillOpacity={theme.laneWashOpacity}
              />
              <rect x={MARGIN.left - RAIL_W} y={y0 + LANE_GUTTER} width={RAIL_W} height={row.height - LANE_GUTTER * 2} fill={tint} />
              <text x={16} y={y0 + row.height / 2} fontSize={12.5 * fontScale} fontWeight={600} fill={theme.ink} dominantBaseline="middle">
                {row.swimlane.name}
              </text>
              {onAddMilestone && <AddMilestoneButton laneId={row.swimlane.id} x={MARGIN.left - RAIL_W - 20} y={y0 + 16} theme={theme} onAdd={onAddMilestone} />}
            </g>
          );
        })}

        {/* Opt-in period-boundary gridlines (wayframe#44/#53) — painted after
            the lane washes but before connectors/markers, so the grid reads
            as chart structure rather than competing with content.
            "segments": faint line at every axis segment (month/quarter/year).
            "year-line": heavier line at year boundaries only (default).
            "year-band": alternating background band per year. */}
        {(periodGridlineStyle === "segments" || periodGridlineStyle === "year-line") &&
          (periodGridlineStyle === "segments" ? axisRows.flatMap((row) => row.segments) : axisRows[0].segments).map((s, i) => (
            <line
              key={`grid-${periodGridlineStyle}-${i}-${s.start}`}
              x1={xTs(s.start)}
              x2={xTs(s.start)}
              y1={lanesTop}
              y2={lanesTop + bodyHeight}
              stroke={periodGridlineStyle === "year-line" ? theme.ink : theme.rowDivider}
              strokeOpacity={periodGridlineStyle === "year-line" ? 0.3 : 1}
              strokeWidth={periodGridlineStyle === "year-line" ? 1.5 : 1}
            />
          ))}
        {periodGridlineStyle === "year-band" &&
          axisRows[0].segments.map((s, i) => (
            <rect
              key={`grid-year-band-${i}-${s.start}`}
              x={xTs(s.start)}
              y={lanesTop}
              width={xTs(s.end) - xTs(s.start)}
              height={bodyHeight}
              fill={theme.ink}
              fillOpacity={i % 2 === 1 ? 0.05 : 0}
            />
          ))}

        {/* dependency connectors — orthogonal "elbow" steps */}
        {data.milestones.flatMap((m) =>
          m.dependsOn
            // showConnector curates which ordinary edges are worth drawing
            // (wayframe#5), but a critical edge always draws: the critical
            // path is only legible as a *line* if every hop in it is
            // visible, and in practice the curated subset and the computed
            // critical set don't overlap at all in the demo document.
            .filter((d) => {
              const from = milestoneById.get(d.id);
              // A traced edge always draws, same reasoning as a critical one:
              // a path is only legible if every hop in it is visible.
              const traced = !!tracedIds && tracedIds.has(m.id) && tracedIds.has(d.id);
              return d.showConnector || traced || (showCriticalPath && m.isCriticalPath && from?.isCriticalPath);
            })
            .map((d) => {
              const from = milestoneById.get(d.id);
              if (!from) return null;
              const critical = showCriticalPath && m.isCriticalPath && from.isCriticalPath;
              const traced = !!tracedIds && tracedIds.has(m.id) && tracedIds.has(from.id);
              const x1 = x(from.date);
              const y1 = laneY(from.laneId);
              const x2 = x(m.date);
              const y2 = laneY(m.laneId);
              const midX = x1 + (x2 - x1) / 2;
              const path = `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`;
              if (!critical) {
                // Critical wins the line where the two overlap; the trace
                // still lifts the markers, so a traced critical edge
                // doesn't lose which one it is.
                return (
                  <path
                    key={`${d.id}->${m.id}`}
                    data-testid={traced ? `traced-connector-${d.id}-${m.id}` : undefined}
                    d={path}
                    fill="none"
                    stroke={traced ? theme.traceColor : theme.connector}
                    strokeOpacity={traced ? 0.95 : 0.55}
                    strokeWidth={traced ? 2.5 : 1.25}
                    markerEnd={traced ? "url(#roadmap-arrow-trace)" : "url(#roadmap-arrow-connector)"}
                  />
                );
              }
              const cs = criticalStroke(criticalPathStyle);
              return (
                <g key={`${d.id}->${m.id}`} data-testid={`critical-connector-${d.id}-${m.id}`}>
                  <path d={path} fill="none" stroke={theme.criticalPathColor} strokeWidth={cs.width} strokeDasharray={cs.dash} markerEnd="url(#roadmap-arrow-critical)" />
                  {/* "double" = overprint the middle in the ground colour */}
                  {cs.overprint !== undefined && <path d={path} fill="none" stroke={theme.ground} strokeWidth={cs.overprint} />}
                </g>
              );
            }),
        )}

        <defs>
          {/* markerUnits="userSpaceOnUse" is the important bit. The default
              is "strokeWidth", which scales the arrowhead by the line's
              weight — a 6px arrow rendered at 24px on a 4px critical
              connector and 7.5px on a 1.25px one, so the same symbol came
              out three times bigger on some lines than others. Fixed size,
              and one marker per line type so the head matches its line
              rather than sitting grey on a red path. */}
          {(
            [
              ["connector", theme.connector, 0.55],
              ["critical", theme.criticalPathColor, 1],
              ["trace", theme.traceColor, 0.95],
            ] as const
          ).map(([name, color, opacity]) => (
            <marker
              key={name}
              id={`roadmap-arrow-${name}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M0,1.5 L9,5 L0,8.5 z" fill={color} opacity={opacity} />
            </marker>
          ))}
        </defs>

        {/* in-lane duration pills — milestones with endDate set (wayframe#15), colored with the lane's header shade rather than status since they're a lane-scoped span, not a status marker */}
        {data.milestones
          .filter((m) => m.endDate)
          .map((m) => {
            const pillHeightSm = PILL_HEIGHT_SM * boxScale;
            const px = x(m.date);
            const w = Math.max(pillHeightSm, x(m.endDate!) - px);
            const cy = laneY(m.laneId);
            const fill = darken(laneTint(m.laneId), 0.4);
            // Pills carry the same critical/trace state as point markers.
            // They didn't before, so a duration on the critical path — which
            // both production ramps are — dropped out of the highlight and
            // the red line appeared to pass through nothing.
            const critical = showCriticalPath && m.isCriticalPath;
            const traceState = tracedIds ? (tracedIds.has(m.id) ? "in" : "out") : null;
            // The label is clipped to the pill instead of running past its
            // end — a long title used to overrun the chart's right edge.
            const labelChars = Math.floor((w - pillHeightSm) / (4.8 * metricsScale));
            const label = labelChars >= 6 ? wrapText(m.title, labelChars, 1)[0] : null;
            return (
              <g
                key={m.id}
                className={onMilestoneClick ? "cursor-pointer" : undefined}
                opacity={traceState === "out" ? 0.22 : 1}
                onClick={onMilestoneClick ? (e) => onMilestoneClick(m, e) : undefined}
              >
                <rect x={px} y={cy - pillHeightSm / 2} width={w} height={pillHeightSm} rx={pillHeightSm / 2} fill={fill} />
                {critical && (
                  <rect
                    x={px - 2}
                    y={cy - pillHeightSm / 2 - 2}
                    width={w + 4}
                    height={pillHeightSm + 4}
                    rx={(pillHeightSm + 4) / 2}
                    fill="none"
                    stroke={theme.criticalPathColor}
                    strokeWidth={2}
                  />
                )}
                {traceState === "in" && (
                  <rect
                    x={px - (critical ? 5 : 2)}
                    y={cy - pillHeightSm / 2 - (critical ? 5 : 2)}
                    width={w + (critical ? 10 : 4)}
                    height={pillHeightSm + (critical ? 10 : 4)}
                    rx={(pillHeightSm + 10) / 2}
                    fill="none"
                    stroke={theme.traceColor}
                    strokeWidth={2}
                  />
                )}
                {label && (
                  <text x={px + pillHeightSm / 2} y={cy + 3} fontSize={9 * fontScale} fill="#ffffff">
                    {label}
                  </text>
                )}
                <title>{`${m.title} — ${formatDateShort(m.date)} to ${formatDateShort(m.endDate!)}${onMilestoneClick ? " — Click to edit" : ""}`}</title>
              </g>
            );
          })}

        {/* milestones on top of connectors — point-in-time only; endDate milestones render as duration pills above instead */}
        {data.milestones
          .filter((m) => !m.endDate)
          .map((m) => (
            <MilestoneMarker
              key={m.id}
              m={m}
              cx={x(m.date)}
              cy={laneY(m.laneId)}
              theme={theme}
              primary={primaryPlacement.get(m.id) ?? null}
              date={datePlacement.get(m.id) ?? { text: formatDateShort(m.date), tier: 0 }}
              onClick={onMilestoneClick}
              ghostMode={ghostMode}
              ghostCx={ghostMode !== "off" && m.originalDate && m.originalDate !== m.date ? x(m.originalDate) : null}
              showCriticalPath={showCriticalPath}
              traceState={tracedIds ? (tracedIds.has(m.id) ? "in" : "out") : null}
              onDragStart={onMilestoneDateChange ? beginDrag : undefined}
              dragDx={drag?.id === m.id ? drag.dx : undefined}
              dragging={drag?.id === m.id}
              fontScale={fontScale}
              metricsScale={metricsScale}
            />
          ))}

        {/* Vertical marker layer. Everything full-height is drawn here,
            after the lanes, so a date line always reads across the whole
            chart instead of being interrupted by a lane wash or a
            separator band. */}
        {data.topLevelItems
          .filter((t): t is Extract<TopLevelItem, { type: "annotation" }> => t.type === "annotation")
          .map((t) => (
            <ReferenceLine
              key={`ann-${t.id}`}
              x={x(t.date)}
              topY={MARGIN.top}
              bottomY={height - MARGIN.bottom}
              label={t.title}
              color="#a855f7"
              dash="4 3"
              fontScale={fontScale}
              metricsScale={metricsScale}
            />
          ))}

        {/* opt-in reference lines (wayframe#15) — any milestone, lane-level or top-level, flagged showReferenceLine */}
        {data.milestones
          .filter((m) => m.showReferenceLine)
          .map((m) => (
            <ReferenceLine
              key={`ref-${m.id}`}
              x={x(m.date)}
              topY={MARGIN.top}
              bottomY={height - MARGIN.bottom}
              label={m.title}
              color={theme.statusColor[m.status]}
              fontScale={fontScale}
              metricsScale={metricsScale}
            />
          ))}
        {data.topLevelItems
          .filter((t): t is Extract<TopLevelItem, { type: "milestone" }> => t.type === "milestone" && t.showReferenceLine === true)
          .map((t) => (
            <ReferenceLine
              key={`ref-${t.id}`}
              x={x(t.date)}
              topY={MARGIN.top}
              bottomY={height - MARGIN.bottom}
              label={t.title}
              color={theme.statusColor[t.status]}
              fontScale={fontScale}
              metricsScale={metricsScale}
            />
          ))}

        {/* today reference line — the only one that gets the downward-pointing
            top triangle (wayframe#38 item 5 / #39), distinct from every other
            reference line's plain dashed-line-plus-text treatment. */}
        {todayTs >= domainMin && todayTs <= domainMax && (
          <ReferenceLine
            x={xTs(todayTs)}
            topY={MARGIN.top}
            bottomY={height - MARGIN.bottom}
            label={`Today · ${today.getUTCMonth() + 1}/${today.getUTCDate()}`}
            color="#e11d48"
            dash="3 3"
            topMarker
            fontScale={fontScale}
            metricsScale={metricsScale}
          />
        )}
      </svg>
    </div>
  );
}
