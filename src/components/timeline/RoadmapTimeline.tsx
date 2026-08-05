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

import { useState } from "react";

import type { RoadmapData, Swimlane, Milestone, TopLevelItem } from "./types";
import type { Theme } from "./theme";
import { defaultTheme } from "./theme";
import { darken } from "./color-utils";
import { parseDate, formatDateShort, formatDateCompact } from "./date-utils";
import { deriveShortLabel } from "./short-label";
import { laneColorAt } from "./lane-colors";
import type { CriticalPathStyle } from "./use-critical-path-style";
import { PRIMARY_TIER_DY, DATE_TIER_DY, layoutPrimaryLabels, layoutDateLabels } from "./label-layout";
import { yearSegments, segmentsForTier, tierRowCount, AXIS_PRESETS, type AxisTierConfig, type Segment } from "./axis-tiers";

const MARGIN = { top: 20, right: 40, bottom: 20, left: 220 };
const LANE_HEIGHT = 90;
const SEPARATOR_HEIGHT = 30;
const TOP_BAND_HEIGHT = 90;
const AXIS_ROW_HEIGHT = 22;
const PILL_HEIGHT_LG = 20;
const PILL_HEIGHT_SM = 14; // in-lane duration pills (wayframe#15)
const RAIL_W = 4; // lane-colour rail on the inner edge of the lane header
const DRAG_THRESHOLD_PX = 3; // below this a gesture is a click, not a drag

interface RowInfo {
  swimlane: Swimlane;
  relY: number;
  height: number;
  laneIndex: number; // -1 for separators; cycles only across "lane" rows, for tint color assignment
}

function computeRows(swimlanes: Swimlane[]): RowInfo[] {
  let y = 0;
  let laneIndex = 0;
  const out: RowInfo[] = [];
  for (const sl of [...swimlanes].sort((a, b) => a.order - b.order)) {
    const height = sl.type === "separator" ? SEPARATOR_HEIGHT : LANE_HEIGHT;
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

function AxisRow({ y, segments, theme, opacity, xOf }: { y: number; segments: Segment[]; theme: Theme; opacity: number; xOf: (ts: number) => number }) {
  return (
    <>
      {segments.map((s) => (
        <g key={s.label + s.start}>
          <rect x={xOf(s.start)} y={y} width={xOf(s.end) - xOf(s.start)} height={AXIS_ROW_HEIGHT} fill={theme.axisBg} fillOpacity={opacity} />
          <line x1={xOf(s.start)} x2={xOf(s.start)} y1={y} y2={y + AXIS_ROW_HEIGHT} stroke={theme.axisText} strokeOpacity={0.25} />
          <text x={(xOf(s.start) + xOf(s.end)) / 2} y={y + AXIS_ROW_HEIGHT - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill={theme.axisText}>
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
function ReferenceLine({ x: cx, topY, bottomY, label, color, dash = "2 2" }: { x: number; topY: number; bottomY: number; label: string; color: string; dash?: string }) {
  return (
    <g>
      <line x1={cx} x2={cx} y1={topY} y2={bottomY} stroke={color} strokeWidth={1.25} strokeDasharray={dash} opacity={0.7} />
      <text x={cx + 4} y={topY - 4} fontSize={9} fontWeight={700} fill={color}>
        {label}
      </text>
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

function GhostBadge({ m, cx, cy }: { m: Milestone; cx: number; cy: number }) {
  const slipDays = daysBetween(m.originalDate!, m.date);
  const late = slipDays > 0;
  const label = `${late ? "+" : ""}${slipDays}d`;
  const badgeW = Math.max(22, label.length * 6 + 8);
  const bx = cx + 12;
  const by = cy - 18;
  return (
    <g data-testid={`ghost-badge-${m.id}`}>
      <rect x={bx} y={by} width={badgeW} height={13} rx={6.5} fill={late ? "#f59e0b" : "#0ea5e9"} />
      <text x={bx + badgeW / 2} y={by + 9.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="#ffffff">
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
}: {
  m: Milestone;
  cx: number;
  cy: number;
  theme: Theme;
  primary: { text: string; tier: 0 | 1 | 2 };
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
}) {
  const r = 8;
  const primaryDy = PRIMARY_TIER_DY[primary.tier];
  const dateDy = DATE_TIER_DY[date.tier];
  const tooltipW = Math.max(40, m.title.length * 6 + 16);
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
      {hasGhost && ghostMode === "outline" && <GhostOutline m={m} ghostCx={ghostCx!} cy={cy} />}
      {primary.tier === 2 && <line x1={cx} y1={cy - r - 1} x2={cx} y2={cy + primaryDy + 4} stroke="currentColor" strokeOpacity={0.3} />}
      {date.tier === 2 && <line x1={cx} y1={cy + r + 1} x2={cx} y2={cy + dateDy - 4} stroke="currentColor" strokeOpacity={0.3} />}
      {/* Critical path is an ink collar, never a red ring — red already
          means "delayed", and the two measured 1.28:1 apart, so the
          highest-severity state used to be the least legible. */}
      {critical && <CushionMarker cx={cx} cy={cy} r={r + 4} fill="none" stroke={theme.criticalPathColor} strokeWidth={2} />}
      {traceState === "in" && <CushionMarker cx={cx} cy={cy} r={r + (critical ? 7.5 : 4)} fill="none" stroke={theme.traceColor} strokeWidth={2} />}
      <CushionMarker cx={cx} cy={cy} r={r} fill={theme.statusColor[m.status]} stroke={theme.markerHalo} strokeWidth={1.5} />
      <text x={cx} y={cy + primaryDy} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor">
        {primary.text}
      </text>
      <text x={cx} y={cy + dateDy} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.6}>
        {date.text}
      </text>
      {hasGhost && ghostMode === "badge" && <GhostBadge m={m} cx={cx} cy={cy} />}
      {/* hover reveal: full title. CSS-only (no JS state) — a real <title>
          element gets hoisted by React 19 as document metadata even inside
          <svg>, which desyncs SSR/client, so this is the workaround. */}
      <g className="pointer-events-none opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        <rect x={cx - tooltipW / 2} y={cy - 58} width={tooltipW} height={hasGhost ? 34 : 20} rx={4} fill="#18181b" />
        <text x={cx} y={cy - 44} textAnchor="middle" fontSize={11} fill="#ffffff">
          {m.title}
        </text>
        {hasGhost && (
          <text x={cx} y={cy - 30} textAnchor="middle" fontSize={9} fill="#ffffff" opacity={0.7}>
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
  width?: number;
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
  /** Line treatment for critical-path connectors — a viewer preference. */
  criticalPathStyle?: CriticalPathStyle;
  /** Renders a per-lane "+" in the lane header when provided. */
  onAddMilestone?: (laneId: string) => void;
  /** Fired after a marker is dragged to a new date (snapped to a day). */
  onMilestoneDateChange?: (milestoneId: string, isoDate: string) => void;
  /** Ids in the active trace — highlighted in the theme's trace colour. */
  tracedIds?: Set<string>;
}

export function RoadmapTimeline({
  data,
  theme = defaultTheme,
  axisTiers = AXIS_PRESETS[1],
  width = 1500,
  today = new Date(),
  onMilestoneClick,
  onTopLevelItemClick,
  ghostMode = "off",
  showCriticalPath = true,
  criticalPathStyle = "thick",
  onAddMilestone,
  onMilestoneDateChange,
  tracedIds,
}: RoadmapTimelineProps) {
  const rows = computeRows(data.swimlanes);
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

  const axisHeight = AXIS_ROW_HEIGHT * tierRowCount(axisTiers);
  const topBandY = MARGIN.top + axisHeight;
  const lanesTop = topBandY + TOP_BAND_HEIGHT;
  const height = lanesTop + bodyHeight + MARGIN.bottom;

  function laneY(laneId: string): number {
    const row = rowById.get(laneId);
    if (!row) return lanesTop;
    return lanesTop + row.relY + row.height / 2;
  }

  // per-lane label collision layout
  const primaryPlacement = new Map<string, { text: string; tier: 0 | 1 | 2 }>();
  const datePlacement = new Map<string, { text: string; tier: 0 | 1 | 2 }>();
  for (const laneRow of rows.filter((r) => r.swimlane.type === "lane")) {
    // Duration-pill milestones (endDate set) show their own inline title and
    // don't participate in the point-marker tiered-label collision layout.
    const laneMilestones = data.milestones.filter((m) => m.laneId === laneRow.swimlane.id && !m.endDate);
    const primary = layoutPrimaryLabels(laneMilestones.map((m) => ({ id: m.id, x: x(m.date), text: m.shortLabel ?? deriveShortLabel(m.title) })));
    const dates = layoutDateLabels(laneMilestones.map((m) => ({ id: m.id, x: x(m.date), full: formatDateShort(m.date), compact: formatDateCompact(m.date) })));
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

  return (
    <div className="overflow-x-auto" data-testid="roadmap-timeline" style={{ background: theme.ground }}>
      {/* `color` (not a Tailwind class) drives every `currentColor` in the
          chart, so the theme owns the ink rather than the page's dark-mode
          class deciding it. */}
      <svg
        width={width}
        height={height}
        style={{ fontFamily: theme.font, color: theme.ink, background: theme.ground }}
        onPointerMove={drag ? moveDrag : undefined}
        onPointerUp={drag ? endDrag : undefined}
        onPointerCancel={drag ? endDrag : undefined}
      >
        {axisRows.map((row, i) => (
          <AxisRow key={i} y={MARGIN.top + i * AXIS_ROW_HEIGHT} segments={row.segments} theme={theme} opacity={row.opacity} xOf={xTs} />
        ))}

        {/* top-level band */}
        <text x={8} y={topBandY + 16} fontSize={11} fontWeight={600} opacity={0.5}>
          PROGRAM
        </text>
        {data.topLevelItems.map((t: TopLevelItem) => {
          const y = topBandY + TOP_BAND_HEIGHT / 2;
          if (t.type === "phase") {
            const px = x(t.startDate);
            const h = PILL_HEIGHT_LG;
            const w = Math.max(h, x(t.endDate) - px);
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
                <text x={px + h / 2} y={y + 4} fontSize={11} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          if (t.type === "milestone") {
            const cx = x(t.date);
            return (
              <g key={t.id} className={onTopLevelItemClick ? "cursor-pointer" : undefined} onClick={onTopLevelItemClick ? (e) => onTopLevelItemClick(t, e) : undefined}>
                <CushionMarker cx={cx} cy={y} r={10} fill={theme.statusColor[t.status]} stroke="#fff" strokeWidth={2} />
                <text x={cx} y={y - 18} textAnchor="middle" fontSize={11} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          const cx = x(t.date);
          return (
            <g key={t.id}>
              <line x1={cx} x2={cx} y1={y - 20} y2={height - MARGIN.bottom} stroke="#a855f7" strokeDasharray="4 3" opacity={0.7} />
              <text x={cx + 4} y={y - 22} fontSize={10} fill="#a855f7">
                {t.title}
              </text>
            </g>
          );
        })}

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
                  fontSize={10.5}
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
              <rect x={MARGIN.left} y={y0} width={innerWidth} height={row.height} fill={tint} fillOpacity={theme.laneWashOpacity} />
              <line x1={0} x2={width} y1={y0} y2={y0} stroke={theme.rowDivider} strokeWidth={1} />
              <rect x={MARGIN.left - RAIL_W} y={y0 + 1} width={RAIL_W} height={row.height - 1} fill={tint} />
              <text x={16} y={y0 + row.height / 2} fontSize={12.5} fontWeight={600} fill={theme.ink} dominantBaseline="middle">
                {row.swimlane.name}
              </text>
              {onAddMilestone && <AddMilestoneButton laneId={row.swimlane.id} x={MARGIN.left - RAIL_W - 20} y={y0 + 16} theme={theme} onAdd={onAddMilestone} />}
            </g>
          );
        })}

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
                    markerEnd="url(#roadmap-timeline-arrow)"
                  />
                );
              }
              const cs = criticalStroke(criticalPathStyle);
              return (
                <g key={`${d.id}->${m.id}`} data-testid={`critical-connector-${d.id}-${m.id}`}>
                  <path d={path} fill="none" stroke={theme.criticalPathColor} strokeWidth={cs.width} strokeDasharray={cs.dash} markerEnd="url(#roadmap-timeline-arrow)" />
                  {/* "double" = overprint the middle in the ground colour */}
                  {cs.overprint !== undefined && <path d={path} fill="none" stroke={theme.ground} strokeWidth={cs.overprint} />}
                </g>
              );
            }),
        )}

        <defs>
          <marker id="roadmap-timeline-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" opacity={0.5} />
          </marker>
        </defs>

        {/* in-lane duration pills — milestones with endDate set (wayframe#15), colored with the lane's header shade rather than status since they're a lane-scoped span, not a status marker */}
        {data.milestones
          .filter((m) => m.endDate)
          .map((m) => {
            const px = x(m.date);
            const w = Math.max(PILL_HEIGHT_SM, x(m.endDate!) - px);
            const cy = laneY(m.laneId);
            const fill = darken(laneTint(m.laneId), 0.4);
            return (
              <g key={m.id} className={onMilestoneClick ? "cursor-pointer" : undefined} onClick={onMilestoneClick ? (e) => onMilestoneClick(m, e) : undefined}>
                <rect x={px} y={cy - PILL_HEIGHT_SM / 2} width={w} height={PILL_HEIGHT_SM} rx={PILL_HEIGHT_SM / 2} fill={fill} />
                {w > 60 && (
                  <text x={px + PILL_HEIGHT_SM / 2} y={cy + 3} fontSize={9} fill="#ffffff">
                    {m.title}
                  </text>
                )}
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
              primary={primaryPlacement.get(m.id) ?? { text: m.shortLabel ?? deriveShortLabel(m.title), tier: 0 }}
              date={datePlacement.get(m.id) ?? { text: formatDateShort(m.date), tier: 0 }}
              onClick={onMilestoneClick}
              ghostMode={ghostMode}
              ghostCx={ghostMode !== "off" && m.originalDate && m.originalDate !== m.date ? x(m.originalDate) : null}
              showCriticalPath={showCriticalPath}
              traceState={tracedIds ? (tracedIds.has(m.id) ? "in" : "out") : null}
              onDragStart={onMilestoneDateChange ? beginDrag : undefined}
              dragDx={drag?.id === m.id ? drag.dx : undefined}
              dragging={drag?.id === m.id}
            />
          ))}

        {/* opt-in reference lines (wayframe#15) — any milestone, lane-level or top-level, flagged showReferenceLine */}
        {data.milestones
          .filter((m) => m.showReferenceLine)
          .map((m) => (
            <ReferenceLine key={`ref-${m.id}`} x={x(m.date)} topY={topBandY} bottomY={height - MARGIN.bottom} label={m.title} color={theme.statusColor[m.status]} />
          ))}
        {data.topLevelItems
          .filter((t): t is Extract<TopLevelItem, { type: "milestone" }> => t.type === "milestone" && t.showReferenceLine === true)
          .map((t) => (
            <ReferenceLine key={`ref-${t.id}`} x={x(t.date)} topY={topBandY} bottomY={height - MARGIN.bottom} label={t.title} color={theme.statusColor[t.status]} />
          ))}

        {/* today reference line */}
        {todayTs >= domainMin && todayTs <= domainMax && (
          <ReferenceLine x={xTs(todayTs)} topY={topBandY} bottomY={height - MARGIN.bottom} label="Today" color="#e11d48" dash="3 3" />
        )}
      </svg>
    </div>
  );
}
