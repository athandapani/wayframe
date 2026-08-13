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
import { DATE_TIER_DY, DATE_CHAR_W, GHOST_TIER_DY, layoutDateLabels, layoutGhostBadges, type GhostBadgeItem, type GhostBlocker, type TierPlacement } from "./label-layout";
import { layoutReferenceLines, type RefLineItem } from "./reference-line-layout";
import { layoutTitleLabels, shouldLabel, CHAR_W, type LabelDensity, type TitlePlacement } from "./title-layout";
import { yearSegments, segmentsForTier, tierRowCount, AXIS_PRESETS, type AxisTierConfig, type Segment } from "./axis-tiers";
import { useLabelOverrides, type LabelOffset } from "./use-label-overrides";

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
/** Company-logo header slot (wayframe#46/#54) — reserved above the programName block only when data.companyLogo is set. */
const COMPANY_LOGO_HEIGHT = 26;
const COMPANY_LOGO_MAX_WIDTH = 140;
const COMPANY_LOGO_GAP = 6;
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
  fillOpacity,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  fillOpacity?: number;
}) {
  return (
    <rect
      x={cx - r}
      y={cy - r}
      width={r * 2}
      height={r * 2}
      rx={r * 0.4}
      fill={fill}
      fillOpacity={fillOpacity}
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
 * Lane-scoped counterpart to AddMilestoneButton (wayframe#45): a "+" that
 * pops a Milestone/Phase picker rather than adding directly, mirroring
 * TopBandAddPicker below — but this one anchors its popover's *left* edge to
 * the button (opens rightward) since the lane button sits near the chart's
 * *left* margin, the opposite edge TopBandAddPicker worries about clipping
 * against. Picking a shape doesn't create anything itself; it hands the
 * shape to `onPick`, which arms the caller's placement gesture (a click for
 * a milestone, a click-drag for a phase — see beginCreateDrag/dateAtX above).
 */
function AddLanePicker({
  x,
  y,
  theme,
  onPick,
  fontScale = 1,
}: {
  x: number;
  y: number;
  theme: Theme;
  onPick: (shape: "milestone" | "phase") => void;
  fontScale?: number;
}) {
  const [open, setOpen] = useState(false);
  const r = 8;
  const popW = 124;
  const popCenter = x + popW / 2;
  return (
    <g>
      <g
        className="cursor-pointer opacity-45 transition-opacity hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        role="button"
        tabIndex={0}
        aria-label="Add a milestone or phase to this lane"
      >
        <circle cx={x} cy={y} r={r} fill="none" stroke={theme.ink} strokeWidth={1.25} />
        <line x1={x - 4} x2={x + 4} y1={y} y2={y} stroke={theme.ink} strokeWidth={1.5} strokeLinecap="round" />
        <line x1={x} x2={x} y1={y - 4} y2={y + 4} stroke={theme.ink} strokeWidth={1.5} strokeLinecap="round" />
        <title>Add a milestone or phase</title>
      </g>
      {open && (
        <g>
          <rect x={x} y={y + r + 4} width={popW} height={54} rx={6} fill={theme.panelBg} stroke={theme.panelBorder} />
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
            Milestone
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
            Phase (pill)
          </text>
        </g>
      )}
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

/** "tint" style — single "+" that pops a Milestone/Phase/Annotation picker. */
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
  onPick: (kind: "milestone" | "phase" | "annotation") => void;
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
          <rect x={popX} y={y + r + 4} width={popW} height={74} rx={6} fill={theme.panelBg} stroke={theme.panelBorder} />
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
          <text
            x={popCenter}
            y={y + r + 62}
            textAnchor="middle"
            fontSize={11 * fontScale}
            fontWeight={600}
            fill={theme.panelInk}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onPick("annotation");
            }}
          >
            + Annotation
          </text>
        </g>
      )}
    </g>
  );
}

/** "border" style — explicit labeled buttons under the header column, no picker. */
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
// line keeps the plain dashed-line-plus-text treatment. `topY` reaches all
// the way to the chart's top margin on every call site (was topBandY /
// topBandY+22, which landed the line's top — and the label right above it —
// on the axis band's own tier-row text, illegible red-on-gray colliding
// with e.g. the Quarter row's label).
//
// Placement (dx/dy) comes from the shared collision-avoidance layout pass in
// reference-line-layout.ts, decided in wayframe#51: Today's chip centers
// over its triangle with fixed clearance below it (the top margin grows to
// make room); every other reference line packs into one of two rows between
// Today and the axis, or gets pushed right with a leader line on overflow.
// Every chip is drag-to-reposition on top of that — RoadmapTimeline layers a
// manual per-id override on the computed dx/dy — for the one case the
// automatic layout doesn't resolve on its own: a reference line whose date
// sits close enough to Today's that their chips collide horizontally rather
// than by row.
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
  dx = 0,
  dy = 0,
  onDragStart,
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
  /** Horizontal offset from layoutReferenceLines, plus any manual drag override/in-flight drag. */
  dx?: number;
  /** Vertical offset from layoutReferenceLines, plus any manual drag override/in-flight drag. */
  dy?: number;
  onDragStart: (evt: React.PointerEvent<SVGGElement>) => void;
}) {
  const chipX = cx + 8 + dx;
  const chipY = topY + dy;
  const chipW = Math.max(40, label.length * 6.2 * metricsScale + 10);
  const chipCenterX = topMarker ? chipX + chipW / 2 : chipX - 4 + chipW / 2;
  return (
    // Reference lines are painted after the markers, so without this they
    // swallow clicks on any milestone sitting on the same date — the GA
    // milestone sits exactly on the GA reference line and couldn't be
    // opened at all. The chip subgroup below re-enables pointer events on
    // just itself (for drag), so that stays true everywhere else on the line.
    <g pointerEvents="none">
      <line x1={cx} x2={cx} y1={topY} y2={bottomY} stroke={color} strokeWidth={1.25} strokeDasharray={dash} opacity={0.7} />
      {topMarker && <path d={`M${cx - 5},${topY - 9} L${cx + 5},${topY - 9} L${cx},${topY} Z`} fill={color} />}
      {(dx !== 0 || dy !== 0) && <line x1={cx} y1={topY} x2={chipCenterX} y2={chipY - 6.5} stroke={color} strokeWidth={1} strokeOpacity={0.5} />}
      <g pointerEvents="auto" className="cursor-grab select-none active:cursor-grabbing" onPointerDown={onDragStart}>
        {topMarker ? (
          <>
            <rect x={chipX} y={chipY - 13} width={chipW} height={13} rx={4} fill={color} />
            <text x={chipX + chipW / 2} y={chipY - 4} textAnchor="middle" fontSize={9 * fontScale} fontWeight={700} fill="#ffffff">
              {label}
            </text>
          </>
        ) : (
          <text x={chipX - 4} y={chipY - 4} fontSize={9 * fontScale} fontWeight={700} fill={color}>
            {label}
          </text>
        )}
      </g>
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

/** Shared between the per-lane collision-layout pass and the badge's own render so the two never disagree on size (wayframe#47). */
function ghostBadgeLabel(m: Milestone): { label: string; late: boolean } {
  const slipDays = daysBetween(m.originalDate!, m.date);
  const late = slipDays > 0;
  return { label: `${late ? "+" : ""}${slipDays}d`, late };
}
function ghostBadgeWidth(label: string, metricsScale: number): number {
  return Math.max(22, label.length * 6 * metricsScale + 8);
}

// PROTOTYPE (wayfinder#61) -- forward-looking slip-risk projection: unlike
// Ghost* above, which draws where a milestone WAS before a correction moved
// it, this draws where it MIGHT land if a named risk materializes. The
// committed date doesn't move; a second, lighter marker previews the
// potential one. Three structurally different treatments to react to, not
// a decided design -- delete two of them (and the slipRisks/slipRiskVariant
// plumbing below) once #61 resolves, and fold the winner into GhostBadge's
// neighborhood for real.
export type SlipRiskVariant = "A" | "B" | "C";

function SlipRiskProjection({
  variant,
  cx,
  cy,
  riskCx,
  color,
  label,
}: {
  variant: SlipRiskVariant;
  cx: number;
  cy: number;
  riskCx: number;
  color: string;
  label: string;
}) {
  if (variant === "A") {
    // "Ghost sibling" -- same grammar as GhostOutline/GhostBadge (dashed
    // outline + pill), just pointed forward instead of back, in the
    // at-risk hue so it never reads as a second real milestone.
    const badgeW = Math.max(30, label.length * 5.4 + 10);
    const bx = riskCx - badgeW / 2;
    const by = cy - 30;
    return (
      <g data-testid="slip-risk-a">
        <line x1={cx + 9} y1={cy} x2={riskCx - 9} y2={cy} stroke={color} strokeWidth={1.5} strokeDasharray="1 3" strokeLinecap="round" />
        <CushionMarker cx={riskCx} cy={cy} r={8} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="2 2" />
        <line x1={riskCx} y1={cy - 9} x2={riskCx} y2={by + 13} stroke={color} strokeOpacity={0.4} />
        <rect x={bx} y={by} width={badgeW} height={13} rx={6.5} fill={color} />
        <text x={bx + badgeW / 2} y={by + 9.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="#ffffff">
          {label}
        </text>
      </g>
    );
  }
  if (variant === "B") {
    // "Comet" -- a streak that fades as it reaches into the future, ending
    // in a soft halo instead of a hard outline; the date rides on the line
    // itself rather than in a separate pill, so nothing new competes with
    // the marker's own title/date labels for vertical space.
    const midX = (cx + riskCx) / 2;
    return (
      <g data-testid="slip-risk-b">
        {[0, 1, 2, 3].map((i) => {
          const t0 = 0.12 + i * 0.22;
          const t1 = t0 + 0.16;
          return (
            <line
              key={i}
              x1={cx + (riskCx - cx) * t0}
              y1={cy}
              x2={cx + (riskCx - cx) * t1}
              y2={cy}
              stroke={color}
              strokeWidth={2 - i * 0.35}
              strokeOpacity={0.85 - i * 0.18}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={riskCx} cy={cy} r={11} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={4} />
        <CushionMarker cx={riskCx} cy={cy} r={6.5} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1.5} />
        <text x={midX} y={cy - 8} textAnchor="middle" fontSize={8} fontWeight={600} fill={color}>
          {label}
        </text>
      </g>
    );
  }
  // "Hazard zone" -- the odd one out on purpose: not a second marker at all,
  // a translucent wedge spanning committed-to-projected date, ending in a
  // flag pin. Reads as a range of uncertainty rather than a discrete
  // alternate position, closer to the reference-line vocabulary than the
  // ghost one.
  const wedgeHalf = 5;
  return (
    <g data-testid="slip-risk-c">
      <polygon
        points={`${cx},${cy - wedgeHalf} ${riskCx},${cy - wedgeHalf * 2.4} ${riskCx},${cy + wedgeHalf * 2.4} ${cx},${cy + wedgeHalf}`}
        fill={color}
        fillOpacity={0.14}
        stroke={color}
        strokeOpacity={0.5}
        strokeWidth={1}
        strokeDasharray="1 3"
      />
      <line x1={riskCx} y1={cy - wedgeHalf * 2.4} x2={riskCx} y2={cy + wedgeHalf * 2.4} stroke={color} strokeWidth={1.5} />
      <polygon
        points={`${riskCx},${cy - wedgeHalf * 2.4} ${riskCx + 14},${cy - wedgeHalf * 2.4 + 4} ${riskCx},${cy - wedgeHalf * 2.4 + 8}`}
        fill={color}
      />
      <text x={riskCx + 3} y={cy + wedgeHalf * 2.4 + 11} fontSize={8} fontWeight={600} fill={color}>
        {label}
      </text>
    </g>
  );
}

function GhostOutline({ m, ghostCx, cy }: { m: Milestone; ghostCx: number; cy: number }) {
  return (
    <g data-testid={`ghost-outline-${m.id}`}>
      <CushionMarker cx={ghostCx} cy={cy} r={8} fill="none" stroke="currentColor" strokeWidth={1.25} strokeDasharray="2 2" />
    </g>
  );
}

// Ghost badge collision-avoidance (wayframe#47): folded into the same
// tiered-escalation idiom as date labels (layoutGhostBadges, seeded with
// each lane's tier-0 title blocks as blockers) — resolves most collisions
// without the viewer doing anything. The manual drag-to-reposition-with-
// connector affordance, generalized from the reference-line-only mechanism
// wayframe#51 shipped, layers on top for the residual case tiering alone
// doesn't reach (e.g. a badge crowded by two neighbors on both sides).
function GhostBadge({
  m,
  cx,
  cy,
  tier = 0,
  dx = 0,
  dy = 0,
  onDragStart,
  fontScale = 1,
  metricsScale = 1,
}: {
  m: Milestone;
  cx: number;
  cy: number;
  /** From layoutGhostBadges — 0 is the original fixed cx+12/cy-18 offset, 1/2 escalate further above the marker. */
  tier?: 0 | 1 | 2;
  /** Manual drag override/in-flight drag, layered on top of the tier position. */
  dx?: number;
  dy?: number;
  onDragStart?: (evt: React.PointerEvent<SVGGElement>) => void;
  fontScale?: number;
  metricsScale?: number;
}) {
  const { label, late } = ghostBadgeLabel(m);
  const badgeW = ghostBadgeWidth(label, metricsScale);
  const bx = cx + 12 + dx;
  const by = cy + GHOST_TIER_DY[tier] + dy;
  const moved = tier > 0 || dx !== 0 || dy !== 0;
  return (
    <g data-testid={`ghost-badge-${m.id}`}>
      {moved && <line x1={cx} y1={cy} x2={bx + badgeW / 2} y2={by + 6.5} stroke="currentColor" strokeOpacity={0.3} />}
      <g pointerEvents={onDragStart ? "auto" : "none"} className={onDragStart ? "cursor-grab select-none active:cursor-grabbing" : undefined} onPointerDown={onDragStart}>
        <rect x={bx} y={by} width={badgeW} height={13} rx={6.5} fill={late ? "#f59e0b" : "#0ea5e9"} />
        <text x={bx + badgeW / 2} y={by + 9.5} textAnchor="middle" fontSize={8 * fontScale} fontWeight={700} fill="#ffffff">
          {label}
        </text>
      </g>
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
  ghostTier = 0,
  showCriticalPath,
  traceState,
  onDragStart,
  dragDx,
  dragging,
  fontScale = 1,
  metricsScale = 1,
  titleOffset = { dx: 0, dy: 0 },
  onTitleDragStart,
  dateOffset = { dx: 0, dy: 0 },
  onDateDragStart,
  ghostOffset = { dx: 0, dy: 0 },
  onGhostDragStart,
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
  /** From layoutGhostBadges (wayframe#47) — escalates the badge above the marker when it would land on a title. */
  ghostTier?: 0 | 1 | 2;
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
  /** Manual drag-to-reposition-with-connector (wayframe#47, generalized from #51) — title label, date label, ghost badge each independently draggable. */
  titleOffset?: LabelOffset;
  onTitleDragStart?: (evt: React.PointerEvent<SVGGElement>) => void;
  dateOffset?: LabelOffset;
  onDateDragStart?: (evt: React.PointerEvent<SVGGElement>) => void;
  ghostOffset?: LabelOffset;
  onGhostDragStart?: (evt: React.PointerEvent<SVGGElement>) => void;
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
          line back to it, or they read as belonging to the lane above. A
          manually-dragged label (wayframe#47) gets the same leader line
          regardless of tier, so a nudged label still reads as belonging to
          this marker. */}
      {primary && (primary.tier === 1 || titleOffset.dx !== 0 || titleOffset.dy !== 0) && (
        <line x1={cx} y1={cy - r - 1} x2={cx + titleOffset.dx} y2={cy + labelBaseDy + 3 + titleOffset.dy} stroke="currentColor" strokeOpacity={0.25} />
      )}
      {(date.tier === 2 || dateOffset.dx !== 0 || dateOffset.dy !== 0) && (
        <line x1={cx} y1={cy + r + 1} x2={cx + dateOffset.dx} y2={cy + dateDy - 4 + dateOffset.dy} stroke="currentColor" strokeOpacity={0.3} />
      )}
      {/* Critical path is an ink collar, never a red ring — red already
          means "delayed", and the two measured 1.28:1 apart, so the
          highest-severity state used to be the least legible. */}
      {critical && <CushionMarker cx={cx} cy={cy} r={r + 4} fill="none" stroke={theme.criticalPathColor} strokeWidth={2} />}
      {traceState === "in" && <CushionMarker cx={cx} cy={cy} r={r + (critical ? 7.5 : 4)} fill="none" stroke={theme.traceColor} strokeWidth={2} />}
      <CushionMarker cx={cx} cy={cy} r={r} fill={theme.statusColor[m.status]} stroke={theme.markerHalo} strokeWidth={1.5} />
      {primary && (
        <g
          transform={titleOffset.dx || titleOffset.dy ? `translate(${titleOffset.dx} ${titleOffset.dy})` : undefined}
          className={onTitleDragStart ? "cursor-grab select-none active:cursor-grabbing" : undefined}
          onPointerDown={onTitleDragStart}
        >
          {primary.lines.map((line, i) => (
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
        </g>
      )}
      <g
        transform={dateOffset.dx || dateOffset.dy ? `translate(${dateOffset.dx} ${dateOffset.dy})` : undefined}
        className={onDateDragStart ? "cursor-grab select-none active:cursor-grabbing" : undefined}
        onPointerDown={onDateDragStart}
      >
        <text x={cx} y={cy + dateDy} textAnchor="middle" fontSize={9 * fontScale} fill="currentColor" opacity={0.6}>
          {date.text}
        </text>
      </g>
      {hasGhost && ghostMode === "badge" && (
        <GhostBadge
          m={m}
          cx={cx}
          cy={cy}
          tier={ghostTier}
          dx={ghostOffset.dx}
          dy={ghostOffset.dy}
          onDragStart={onGhostDragStart}
          fontScale={fontScale}
          metricsScale={metricsScale}
        />
      )}
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
  /** Opens the lighter phase/top-level-milestone/annotation editor (wayframe#19, annotation added in wayframe#59). */
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
  /**
   * Fired once a lane's manual creation gesture completes (wayframe#45): a
   * click places a point milestone, a click-drag draws a phase and supplies
   * `endDate`. Renders a per-lane "+" (shape picker) in the lane header when
   * provided — omit to keep lanes create-only-via-AI.
   */
  onAddMilestone?: (laneId: string, date: string, endDate?: string) => void;
  /** Fired when a lane's "+" picker resolves to a shape — the caller arms `placementMode` in response. */
  onPickShape?: (laneId: string, shape: "milestone" | "phase") => void;
  /** Which lane is armed for placement and which shape it'll create; controlled by the caller so it can render a "click to place"/"Cancel" affordance outside the chart. */
  placementMode?: { laneId: string; shape: "milestone" | "phase" } | null;
  /** Fired after a marker is dragged to a new date (snapped to a day). */
  onMilestoneDateChange?: (milestoneId: string, isoDate: string) => void;
  /** Ids in the active trace — highlighted in the theme's trace colour. */
  tracedIds?: Set<string>;
  /** Which markers carry a label — a viewer preference for dense programmes. */
  labelDensity?: LabelDensity;
  /** PROGRAM-band highlight treatment (wayframe#41) — a viewer preference, see use-top-band-style.ts. */
  topBandStyle?: TopBandStyle;
  /** Renders the PROGRAM band's manual "+" (in whichever shape topBandStyle calls for) when provided. Annotation is only offered by the "tint"/"border" pickers — "chip" stays milestone-only, an accepted tradeoff from wayframe#41 unchanged by wayframe#59. */
  onAddTopLevelItem?: (kind: "milestone" | "phase" | "annotation") => void;
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
  /** Click-to-edit on programName/owner in the chart header (wayframe#55/#60) — omit to keep them static text (dev preview / off-screen export capture). */
  onEditDocument?: (patch: { programName?: string; owner?: string }) => void;
  /** PROTOTYPE (wayfinder#61) — milestone id -> projected at-risk date (ISO). Not a real Milestone field yet; dev-preview-only plumbing for the slip-risk visualization prototype. */
  slipRisks?: Record<string, string>;
  /** PROTOTYPE (wayfinder#61) — which of the three slip-risk visual treatments to render. Defaults to "A". */
  slipRiskVariant?: SlipRiskVariant;
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
  onPickShape,
  placementMode = null,
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
  onEditDocument,
  slipRisks,
  slipRiskVariant = "A",
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

  // Click-to-edit on programName/owner (wayframe#55/#60) — plain text, not
  // rich text like the BLUF panel, so a bare foreignObject<input> is enough
  // rather than RichTextEditableLine's contentEditable/Range-API machinery.
  const [editingHeaderField, setEditingHeaderField] = useState<"programName" | "owner" | null>(null);
  const [headerDraft, setHeaderDraft] = useState("");

  function commitHeaderEdit() {
    if (editingHeaderField) onEditDocument?.({ [editingHeaderField]: headerDraft });
    setEditingHeaderField(null);
  }

  // Drag-to-reposition-with-connector (wayframe#51, generalized to every
  // label type in wayframe#47). One shared mechanism covers reference-line
  // chips, ghost badges, and marker title/date labels, keyed by a per-id
  // string ("today", `ref-<id>`, `ann-<id>`, `ghost-<id>`, `title-<id>`,
  // `date-<id>`). `labelOverrides` is a per-id manual (dx, dy) pin, added on
  // top of each element's own automatic placement rather than replacing it,
  // so nudging one label doesn't fight the collision math for every other
  // one. `labelDrag` is the in-flight gesture (mirrors `drag` above).
  // Persisted viewer-local via use-label-overrides.ts — resolves the
  // persistence question wayframe#47 asked and #51 left open (its
  // equivalent state never survived a reload).
  const [labelDrag, setLabelDrag] = useState<{ id: string; startX: number; startY: number; dx: number; dy: number } | null>(null);
  const { overrides: labelOverrides, addOverride: addLabelOverride } = useLabelOverrides();

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

  // Every reference line (Today, annotations, showReferenceLine milestones/
  // top-level-items) collected into one list so a shared layout pass
  // (reference-line-layout.ts, decided in wayframe#51) can see all of them
  // at once instead of each ReferenceLine call site sizing/positioning
  // itself in isolation. Computed here, not inline in the render below,
  // because the layout's reserved top margin feeds the axis/lane layout.
  // Every non-Today label carries its own short mm/dd date (`title · 6/14`)
  // so a repositioned chip still reads standalone.
  const todayVisible = todayTs >= domainMin && todayTs <= domainMax;
  const todayLabel = `Today · ${today.getUTCMonth() + 1}/${today.getUTCDate()}`;
  const refAnnotations = data.topLevelItems.filter((t): t is Extract<TopLevelItem, { type: "annotation" }> => t.type === "annotation");
  const refLaneRefs = data.milestones.filter((m) => m.showReferenceLine);
  const refTopRefs = data.topLevelItems.filter(
    (t): t is Extract<TopLevelItem, { type: "milestone" }> => t.type === "milestone" && t.showReferenceLine === true,
  );
  const refLabel = (title: string, date: string) => `${title} · ${formatDateCompact(date)}`;
  const allRefLines: RefLineItem[] = [
    ...(todayVisible ? [{ id: "today", x: xTs(todayTs), label: todayLabel, priority: 0, movable: false }] : []),
    ...refTopRefs.map((t) => ({ id: `ref-${t.id}`, x: x(t.date), label: refLabel(t.title, t.date), priority: 1, movable: true })),
    ...refLaneRefs.map((m) => ({ id: `ref-${m.id}`, x: x(m.date), label: refLabel(m.title, m.date), priority: 2, movable: true })),
    ...refAnnotations.map((t) => ({ id: `ann-${t.id}`, x: x(t.date), label: refLabel(t.title, t.date), priority: 3, movable: true })),
  ];
  const { placements: refPlacements, topMarginExtra: refTopMarginExtra } = layoutReferenceLines(allRefLines, 6.2 * metricsScale);
  /**
   * Manual override + in-flight drag for any label id, layered on top of
   * `auto` (that element's own computed placement — reference lines carry
   * dx/dy from layoutReferenceLines; titles/dates/ghost badges bake their
   * auto position into a tier lookup at the render call site instead, so
   * they call this with no `auto` arg).
   */
  const placementFor = (id: string, auto?: { dx: number; dy: number }): { dx: number; dy: number } => {
    const a = auto ?? { dx: 0, dy: 0 };
    const override = labelOverrides[id];
    const live = labelDrag?.id === id ? labelDrag : null;
    return {
      dx: a.dx + (override?.dx ?? 0) + (live?.dx ?? 0),
      dy: a.dy + (override?.dy ?? 0) + (live?.dy ?? 0),
    };
  };
  const chartTopMargin = MARGIN.top + refTopMarginExtra;

  const axisRowHeight = AXIS_ROW_HEIGHT * boxScale;
  const axisHeight = axisRowHeight * tierRowCount(axisTiers);
  const companyLogoExtra = data.companyLogo ? COMPANY_LOGO_HEIGHT + COMPANY_LOGO_GAP : 0;
  const topBandHeight = TOP_BAND_HEIGHT * boxScale + companyLogoExtra;
  const topBandY = chartTopMargin + axisHeight;
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
  const ghostPlacement = new Map<string, TierPlacement>();
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

    // Ghost-badge collision-avoidance (wayframe#47): fold badges into the
    // same tiered-escalation idiom as dates, seeded with this lane's
    // already-placed tier-0 title blocks as blockers, so a badge competes
    // for the same collision-free slots titles claimed instead of landing
    // on one. Skipped entirely when ghosts aren't rendering as badges —
    // no placement to compute.
    if (ghostMode === "badge") {
      const ghosted = laneMilestones.filter((m) => m.originalDate && m.originalDate !== m.date);
      if (ghosted.length > 0) {
        const badgeItems: GhostBadgeItem[] = ghosted.map((m) => {
          const { label } = ghostBadgeLabel(m);
          const w = ghostBadgeWidth(label, metricsScale);
          return { id: m.id, x: x(m.date) + 12 + w / 2, text: label };
        });
        // Both title tiers are blockers, not just tier 0: tier-1 titles sit
        // higher (title-layout.ts's LABEL_TIER_LIFT) but a lane tight enough
        // to need ghost-tier escalation in the first place often has a
        // neighbor's tier-1 title landing right where the badge escalates
        // to (caught live against this fixture's own Lab Slot Confirmed
        // case). The check is horizontal-only, so this can escalate a badge
        // a tier further than strictly necessary when a tier-1 blocker
        // doesn't truly reach its row — an accepted looseness, same as the
        // rest of this file's approximate text-width-estimate math.
        const blockers: GhostBlocker[] = laneMilestones
          .filter((m) => (primary.get(m.id)?.lines.length ?? 0) > 0)
          .map((m) => {
            const lines = primary.get(m.id)!.lines;
            const widestLine = Math.max(...lines.map((l) => l.length));
            return { x: x(m.date), w: widestLine * CHAR_W * metricsScale };
          });
        const ghosts = layoutGhostBadges(badgeItems, blockers, 6 * metricsScale);
        for (const [k, v] of ghosts) ghostPlacement.set(k, v);
      }
    }
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

  // Label drag-to-reposition (wayframe#51, generalized in wayframe#47).
  // Unlike marker drag (beginDrag above), this never touches the document:
  // it's a pure viewer-local visual nudge, so there's no "moved past
  // threshold to count as a drag vs. a click" distinction and no onXChange
  // callback to fire — it just commits into labelOverrides on pointer-up.
  // `stopPropagation` matters here: title/date/ghost drag handles are
  // nested inside the marker's own draggable <g> (reschedule-drag), and
  // without it a pointerdown on a label would also arm the marker's own
  // beginDrag, silently rescheduling the milestone on what was meant to be
  // a label nudge.
  function beginLabelDrag(id: string, evt: React.PointerEvent<SVGGElement>) {
    evt.currentTarget.setPointerCapture(evt.pointerId);
    evt.stopPropagation();
    setLabelDrag({ id, startX: evt.clientX, startY: evt.clientY, dx: 0, dy: 0 });
  }
  function moveLabelDrag(evt: React.PointerEvent<SVGSVGElement>) {
    if (!labelDrag) return;
    setLabelDrag({ ...labelDrag, dx: evt.clientX - labelDrag.startX, dy: evt.clientY - labelDrag.startY });
  }
  function endLabelDrag() {
    if (!labelDrag) return;
    addLabelOverride(labelDrag.id, { dx: labelDrag.dx, dy: labelDrag.dy });
    setLabelDrag(null);
  }

  // Manual phase placement (wayframe#45): a click-drag on empty lane space
  // draws a new phase's span while `placementMode` targets that lane with
  // shape "phase" — the milestone case needs no drag state at all, a plain
  // click on the lane (below) is enough. Reuses the drag-to-reschedule
  // mechanism above rather than a second one; only what gets committed at
  // the end differs.
  const [createDrag, setCreateDrag] = useState<{ laneId: string; startX: number; curX: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  /** clientX -> local SVG x. getBoundingClientRect already accounts for the container's horizontal scroll. */
  function localX(clientX: number): number {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? clientX - rect.left : clientX;
  }
  function beginCreateDrag(laneId: string, evt: React.PointerEvent<SVGRectElement>) {
    if (placementMode?.laneId !== laneId || placementMode.shape !== "phase" || !onAddMilestone) return;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    const lx = localX(evt.clientX);
    setCreateDrag({ laneId, startX: lx, curX: lx });
  }
  function moveCreateDrag(evt: React.PointerEvent<SVGSVGElement>) {
    if (!createDrag) return;
    setCreateDrag({ ...createDrag, curX: localX(evt.clientX) });
  }
  function endCreateDrag() {
    if (!createDrag) return;
    if (Math.abs(createDrag.curX - createDrag.startX) > DRAG_THRESHOLD_PX) {
      const lo = Math.min(createDrag.startX, createDrag.curX);
      const hi = Math.max(createDrag.startX, createDrag.curX);
      const date = dateAtX(lo);
      const endDate = dateAtX(hi);
      if (endDate > date) onAddMilestone?.(createDrag.laneId, date, endDate);
    }
    setCreateDrag(null);
  }

  const axisRows: { segments: Segment[]; opacity: number }[] = [{ segments: yearSegments(domainMin, domainMax), opacity: 1 }];
  if (axisTiers.tier2 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier2, domainMin, domainMax), opacity: 0.8 });
  if (axisTiers.tier3 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier3, domainMin, domainMax), opacity: 0.6 });

  const programNameLines = wrapText(data.programName, Math.max(6, Math.floor(26 / metricsScale)), 3);
  const headerY = topBandY + companyLogoExtra + (topBandStyle === "chip" ? 30 : 14);
  const ownerY = headerY + programNameLines.length * 15 * fontScale + 4 * fontScale;

  return (
    <div ref={containerRef} className="overflow-x-auto" data-testid="roadmap-timeline" style={{ background: theme.ground }}>
      {/* `color` (not a Tailwind class) drives every `currentColor` in the
          chart, so the theme owns the ink rather than the page's dark-mode
          class deciding it. */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ fontFamily: fontFamily ?? theme.font, color: theme.ink, background: theme.ground }}
        onPointerMove={
          drag || createDrag || labelDrag
            ? (e) => {
                moveDrag(e);
                moveCreateDrag(e);
                moveLabelDrag(e);
              }
            : undefined
        }
        onPointerUp={
          drag || createDrag || labelDrag
            ? () => {
                endDrag();
                endCreateDrag();
                endLabelDrag();
              }
            : undefined
        }
        onPointerCancel={
          drag || createDrag || labelDrag
            ? () => {
                setDrag(null);
                setCreateDrag(null);
                setLabelDrag(null);
              }
            : undefined
        }
      >
        {axisRows.map((row, i) => (
          <AxisRow key={i} y={chartTopMargin + i * axisRowHeight} segments={row.segments} theme={theme} opacity={row.opacity} xOf={xTs} rowHeight={axisRowHeight} fontScale={fontScale} />
        ))}

        {/* PROGRAM-band highlight treatment (wayframe#41) — "tint"/"border" paint the band itself; "chip" leaves it unpainted. */}
        {topBandStyle === "tint" && <rect x={0} y={topBandY} width={width} height={topBandHeight} fill={theme.accent} fillOpacity={0.08} />}
        {topBandStyle === "border" && (
          <>
            <rect x={0} y={topBandY} width={width} height={3} fill={theme.accent} />
            <rect x={0} y={topBandY + topBandHeight - 1} width={width} height={1} fill={theme.accent} fillOpacity={0.4} />
          </>
        )}
        {/* Company logo (wayframe#46/#54) — top-left header column, same x=16
            margin as the programme name/owner below it, directly above them.
            Distinct from the fixed WayframeLogo mark in the page chrome
            (RoadmapWorkspace's top-left bar); both are visible at once.
            preserveAspectRatio keeps an arbitrary uploaded image from
            distorting inside its reserved box. */}
        {data.companyLogo && (
          <image
            href={data.companyLogo.dataUrl}
            x={16}
            y={topBandY + 2}
            width={COMPANY_LOGO_MAX_WIDTH * metricsScale}
            height={COMPANY_LOGO_HEIGHT * fontScale}
            preserveAspectRatio="xMinYMid meet"
          />
        )}

        {/* "chip" — a small "PROGRAM" chip ahead of the programme name, no band fill. Its box
            was fixed-size before the font-scale system (wayframe#42/#50) — now derived from
            "PROGRAM"'s own text length so it doesn't clip at large fontScale like every other
            chip/badge/button in this file. */}
        {topBandStyle === "chip" && (
          <>
            <rect x={16} y={topBandY + 3 + companyLogoExtra} width={"PROGRAM".length * 5.4 * metricsScale + 20} height={13} rx={6.5} fill={theme.accent} />
            <text
              x={16 + ("PROGRAM".length * 5.4 * metricsScale + 20) / 2}
              y={topBandY + 12 + companyLogoExtra}
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
            instead of running into the phase timeline beside it.
            Click-to-edit (wayframe#55/#60) — plain text, not the BLUF
            panel's rich-text surface, so a single-line input covers
            multi-line wrapped display; the underlying field is one string
            either way. */}
        {editingHeaderField === "programName" ? (
          <foreignObject x={14} y={headerY - 14 * fontScale} width={260} height={22 * fontScale}>
            <input
              autoFocus
              value={headerDraft}
              onChange={(e) => setHeaderDraft(e.target.value)}
              onBlur={commitHeaderEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitHeaderEdit();
                if (e.key === "Escape") setEditingHeaderField(null);
              }}
              aria-label="Program name"
              style={{ fontSize: 13 * fontScale, fontWeight: 700, color: theme.ink, background: theme.ground, width: "100%", border: `1px dashed ${theme.ink}`, outline: "none", padding: "0 2px" }}
            />
          </foreignObject>
        ) : (
          programNameLines.map((line, i) => (
            <text
              key={i}
              x={16}
              y={headerY + i * 15 * fontScale}
              fontSize={13 * fontScale}
              fontWeight={700}
              fill={theme.ink}
              className={onEditDocument ? "cursor-text" : undefined}
              onClick={
                onEditDocument
                  ? () => {
                      setHeaderDraft(data.programName);
                      setEditingHeaderField("programName");
                    }
                  : undefined
              }
            >
              {line}
            </text>
          ))
        )}
        {editingHeaderField === "owner" ? (
          <foreignObject x={14} y={ownerY - 10 * fontScale} width={220} height={18 * fontScale}>
            <input
              autoFocus
              value={headerDraft}
              onChange={(e) => setHeaderDraft(e.target.value)}
              onBlur={commitHeaderEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitHeaderEdit();
                if (e.key === "Escape") setEditingHeaderField(null);
              }}
              aria-label="Program owner"
              style={{ fontSize: 10 * fontScale, color: theme.inkMuted, background: theme.ground, width: "100%", border: `1px dashed ${theme.inkMuted}`, outline: "none", padding: "0 2px" }}
            />
          </foreignObject>
        ) : data.owner ? (
          <text
            x={16}
            y={ownerY}
            fontSize={10 * fontScale}
            fill={theme.inkMuted}
            className={onEditDocument ? "cursor-text" : undefined}
            onClick={
              onEditDocument
                ? () => {
                    setHeaderDraft(data.owner);
                    setEditingHeaderField("owner");
                  }
                : undefined
            }
          >
            {data.owner}
          </text>
        ) : (
          onEditDocument && (
            <text
              x={16}
              y={ownerY}
              fontSize={10 * fontScale}
              fill={theme.inkMuted}
              opacity={0.6}
              className="cursor-text"
              onClick={() => {
                setHeaderDraft("");
                setEditingHeaderField("owner");
              }}
            >
              + Add owner
            </text>
          )
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
          // An annotation's full-height reference line is drawn separately,
          // in the vertical-marker layer below (running after the swimlane
          // rows, so a lane wash/separator band can't paint over it the way
          // it did when this used to be emitted here — see wayframe#47's
          // history). This is just its click target: a small flag at the
          // top-band row, mirroring the milestone/phase markers above so
          // "click a PROGRAM-band item to edit it" holds for every kind
          // (wayframe#59 — annotations were the one kind with no manual
          // click-to-edit affordance at all).
          if (t.type === "annotation") {
            const cx = x(t.date);
            return (
              <g key={t.id} className={onTopLevelItemClick ? "cursor-pointer" : undefined} onClick={onTopLevelItemClick ? (e) => onTopLevelItemClick(t, e) : undefined}>
                <path d={`M${cx - 6},${y - 8} L${cx + 6},${y - 8} L${cx},${y} Z`} fill={theme.accent} stroke="#fff" strokeWidth={1} />
                <title>{t.title}</title>
              </g>
            );
          }
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
            <TopBandLabeledButton x={180} y={topBandY + topBandHeight - 22} theme={theme} label="+ Annotation" onAdd={() => onAddTopLevelItem("annotation")} fontScale={fontScale} metricsScale={metricsScale} />
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
            const separatorNameLines = wrapText(row.swimlane.name, Math.max(8, Math.floor(24 / metricsScale)), 2, { breakWords: false });
            return (
              <g key={row.swimlane.id}>
                <rect x={0} y={y0} width={width} height={row.height} fill={theme.separatorBg} />
                <text
                  fontSize={10.5 * fontScale}
                  fontWeight={700}
                  letterSpacing="0.09em"
                  fill={theme.separatorText}
                  // CSS, not .toUpperCase() — keeps the real string in the DOM
                  // so assistive tech doesn't announce it as an initialism.
                  style={{ textTransform: "uppercase" }}
                >
                  {separatorNameLines.map((line, i) => (
                    <tspan key={i} x={16} y={y0 + row.height / 2 + (i - (separatorNameLines.length - 1) / 2) * 12 * fontScale} dominantBaseline="middle">
                      {line}
                    </tspan>
                  ))}
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
          const laneNameLines = wrapText(row.swimlane.name, Math.max(8, Math.floor(24 / metricsScale)), 3, { breakWords: false });
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
                style={placementMode?.laneId === row.swimlane.id ? { cursor: "crosshair" } : undefined}
                onPointerDown={placementMode?.laneId === row.swimlane.id ? (e) => beginCreateDrag(row.swimlane.id, e) : undefined}
                onClick={
                  placementMode?.laneId === row.swimlane.id && placementMode.shape === "milestone"
                    ? (e) => onAddMilestone?.(row.swimlane.id, dateAtX(localX(e.clientX)))
                    : undefined
                }
              />
              {/* Live preview while drawing a new phase by drag (wayframe#45). Painted right after
                  the wash so lane content (markers, other pills) still draws on top of it. */}
              {createDrag && createDrag.laneId === row.swimlane.id && (
                <rect
                  x={Math.min(createDrag.startX, createDrag.curX)}
                  y={y0 + row.height / 2 - (PILL_HEIGHT_SM * boxScale) / 2}
                  width={Math.abs(createDrag.curX - createDrag.startX)}
                  height={PILL_HEIGHT_SM * boxScale}
                  rx={(PILL_HEIGHT_SM * boxScale) / 2}
                  fill={darken(tint, 0.4)}
                  fillOpacity={0.5}
                  stroke={darken(tint, 0.4)}
                  strokeDasharray="3 2"
                />
              )}
              <rect x={MARGIN.left - RAIL_W} y={y0 + LANE_GUTTER} width={RAIL_W} height={row.height - LANE_GUTTER * 2} fill={tint} />
              <text fontSize={12.5 * fontScale} fontWeight={600} fill={theme.ink}>
                {laneNameLines.map((line, i) => (
                  <tspan key={i} x={16} y={y0 + row.height / 2 + (i - (laneNameLines.length - 1) / 2) * 15 * fontScale} dominantBaseline="middle">
                    {line}
                  </tspan>
                ))}
              </text>
              {onAddMilestone && onPickShape && (
                <AddLanePicker x={MARGIN.left - RAIL_W - 20} y={y0 + 16} theme={theme} fontScale={fontScale} onPick={(shape) => onPickShape(row.swimlane.id, shape)} />
              )}
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
              ghostTier={ghostPlacement.get(m.id)?.tier ?? 0}
              showCriticalPath={showCriticalPath}
              traceState={tracedIds ? (tracedIds.has(m.id) ? "in" : "out") : null}
              onDragStart={onMilestoneDateChange ? beginDrag : undefined}
              dragDx={drag?.id === m.id ? drag.dx : undefined}
              dragging={drag?.id === m.id}
              fontScale={fontScale}
              metricsScale={metricsScale}
              titleOffset={placementFor(`title-${m.id}`)}
              onTitleDragStart={(evt) => beginLabelDrag(`title-${m.id}`, evt)}
              dateOffset={placementFor(`date-${m.id}`)}
              onDateDragStart={(evt) => beginLabelDrag(`date-${m.id}`, evt)}
              ghostOffset={placementFor(`ghost-${m.id}`)}
              onGhostDragStart={(evt) => beginLabelDrag(`ghost-${m.id}`, evt)}
            />
          ))}

        {/* PROTOTYPE (wayfinder#61) -- forward-looking slip-risk projection. See SlipRiskProjection above. */}
        {slipRisks &&
          data.milestones
            .filter((m) => !m.endDate && slipRisks[m.id])
            .map((m) => {
              const riskDate = slipRisks[m.id];
              const days = daysBetween(m.date, riskDate);
              return (
                <SlipRiskProjection
                  key={`risk-${m.id}`}
                  variant={slipRiskVariant}
                  cx={x(m.date)}
                  cy={laneY(m.laneId)}
                  riskCx={x(riskDate)}
                  color={theme.statusColor["at-risk"]}
                  label={`+${days}d risk · ${formatDateShort(riskDate)}`}
                />
              );
            })}

        {/* Vertical marker layer. Everything full-height is drawn here,
            after the lanes, so a date line always reads across the whole
            chart instead of being interrupted by a lane wash or a
            separator band. Reference-line placements (dx/dy/hidden) come
            from the shared layout pass computed above, alongside
            chartTopMargin — see wayframe#51/#47. */}
        {refAnnotations.map((t) => (
          <ReferenceLine
            key={`ann-${t.id}`}
            x={x(t.date)}
            topY={chartTopMargin}
            bottomY={height - MARGIN.bottom}
            label={refLabel(t.title, t.date)}
            color="#a855f7"
            dash="4 3"
            fontScale={fontScale}
            metricsScale={metricsScale}
            onDragStart={(evt) => beginLabelDrag(`ann-${t.id}`, evt)}
            {...placementFor(`ann-${t.id}`, refPlacements.get(`ann-${t.id}`))}
          />
        ))}

        {/* opt-in reference lines (wayframe#15) — any milestone, lane-level or top-level, flagged showReferenceLine */}
        {refLaneRefs.map((m) => (
          <ReferenceLine
            key={`ref-${m.id}`}
            x={x(m.date)}
            topY={chartTopMargin}
            bottomY={height - MARGIN.bottom}
            label={refLabel(m.title, m.date)}
            color={theme.statusColor[m.status]}
            fontScale={fontScale}
            metricsScale={metricsScale}
            onDragStart={(evt) => beginLabelDrag(`ref-${m.id}`, evt)}
            {...placementFor(`ref-${m.id}`, refPlacements.get(`ref-${m.id}`))}
          />
        ))}
        {refTopRefs.map((t) => (
          <ReferenceLine
            key={`ref-${t.id}`}
            x={x(t.date)}
            topY={chartTopMargin}
            bottomY={height - MARGIN.bottom}
            label={refLabel(t.title, t.date)}
            color={theme.statusColor[t.status]}
            fontScale={fontScale}
            metricsScale={metricsScale}
            onDragStart={(evt) => beginLabelDrag(`ref-${t.id}`, evt)}
            {...placementFor(`ref-${t.id}`, refPlacements.get(`ref-${t.id}`))}
          />
        ))}

        {/* today reference line — the only one that gets the downward-pointing
            top triangle (wayframe#38 item 5 / #39), distinct from every other
            reference line's plain dashed-line-plus-text treatment. */}
        {todayVisible && (
          <ReferenceLine
            x={xTs(todayTs)}
            topY={chartTopMargin}
            bottomY={height - MARGIN.bottom}
            label={todayLabel}
            color="#e11d48"
            dash="3 3"
            topMarker
            fontScale={fontScale}
            metricsScale={metricsScale}
            onDragStart={(evt) => beginLabelDrag("today", evt)}
            {...placementFor("today", refPlacements.get("today"))}
          />
        )}
      </svg>
    </div>
  );
}
