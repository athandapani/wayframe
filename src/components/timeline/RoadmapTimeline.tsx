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

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { RenderableProgram, RenderableMilestone, Swimlane, Milestone, TopLevelItem, LegendCategory, MarkerShape, Program, PhaseSize } from "./types";
import type { Theme } from "./theme";
import { defaultTheme } from "./theme";
import {
  resolveDateLabelPosition,
  resolveFontScale,
  resolveHidden,
  resolveMarkerColor,
  resolveMarkerScale,
  resolveMarkerShape,
  resolvePhaseShape,
  resolvePhaseSize,
  resolveTitleLabelPosition,
} from "./style-resolution";
import { darken, lighten, contrastText } from "./color-utils";
import { parseDate, formatDateShort, formatDateCompact } from "./date-utils";

import { laneColorAt } from "./lane-colors";
import { wrapText } from "./wrap-text";
import type { CriticalPathStyle } from "./use-critical-path-style";
import type { TopBandStyle } from "./use-top-band-style";
import type { PeriodGridlineStyle } from "./use-period-gridlines";
import { DATE_TIER_DY, DATE_CHAR_W, GHOST_TIER_DY, MIN_GAP, layoutDateLabels, layoutGhostBadges, type GhostBadgeItem, type GhostBlocker } from "./label-layout";
import { allocate, type Demand } from "@/lib/layout/tier-allocator";
import {
  ghostsForMilestone,
  ghostsForTopLevelItemPhase,
  ghostsForTopLevelItemMilestone,
  layoutItemGhosts,
  labelForDeltaGhost,
  MAX_DELTA_TIERS,
  type DeltaGhostKind,
  type PlacedDeltaGhost,
} from "./delta-ghosts";
import { layoutReferenceLines, type RefLineItem } from "./reference-line-layout";
import { layoutTitleLabels, shouldLabel, CHAR_W, type LabelDensity, type TitlePlacement } from "./title-layout";
import { yearSegments, segmentsForTier, tierRowCount, tier3OptionsFor, labelStride, AXIS_PRESETS, type AxisTierConfig, type Segment } from "./axis-tiers";
import { useLabelOverrides, type LabelOffset } from "./use-label-overrides";
import type { ConnectorStyle } from "./use-connector-style";
import { CONNECTOR_DASH_ARRAY, type ConnectorDash, type ConnectorArrow } from "./use-connector-line-style";
import type { PillProgressStyle } from "./use-pill-progress-style";
import type { DateLabelPlacement } from "./use-date-label-placement";
import { computeFitToScreenRatio, computeLaneRowModel, ROW_GAP, type LaneRowModel, type RowItem } from "@/lib/layout/lane-rows";

const MARGIN = { top: 20, right: 40, bottom: 20, left: 220 };
/**
 * Taller than it was: markers now carry wrapped real titles on two tiers
 * rather than a single line of initials, and that needs vertical room.
 */
const LANE_HEIGHT = 132;
/** Extra vertical room reserved per stacked overlapping duration pill within a lane. */
const PILL_ROW_HEIGHT = 18;
/**
 * In-lane duration-pill size vocabulary (wayframe#94/t20) — resolved via
 * the same resolvePhaseSize ladder (style-resolution.ts) the PROGRAM-band
 * "phase" TopLevelItems already use, but a distinct pixel table: this one
 * governs a pill's own sub-row height inside a Lane Row (lane-rows.ts),
 * not the top band's PILL_HEIGHT_LG-based sizeMultiplier scaling. `lean`
 * matches today's existing in-lane pill render height (PILL_HEIGHT_SM);
 * `normal` matches the existing per-sub-row reservation (PILL_ROW_HEIGHT);
 * `tall` is new headroom for a pill that should read as heavier regardless
 * of lane density — composes as a floor on its own sub-row, never
 * multiplied down by a lean lane's density factor (see lane-rows.ts's
 * computeRowHeight).
 */
const PILL_PHASE_HEIGHT: Record<PhaseSize, number> = { lean: 14, normal: PILL_ROW_HEIGHT, tall: 26 };
/** Line height of a wrapped marker label. */
const LABEL_LINE_H = 11;
/** Gap between the marker and the bottom line of its label block. */
const LABEL_BASE_DY = -14;
/** Extra lift for tier-1 labels so they clear a full two-line tier-0 block. */
const LABEL_TIER_LIFT = 27;
/**
 * Row 1's own floor (a lane's always-present home row), content-derived
 * rather than the old flat, content-blind LANE_HEIGHT=132 a lane made up
 * entirely of duration pills used to pay regardless of what was actually
 * in it: the tallest a pill's own sub-row can be (PILL_PHASE_HEIGHT.tall)
 * plus one line of title-label clearance above (LABEL_LINE_H) and one
 * line of date-label clearance below (DATE_TIER_DY's tiers sit 12px
 * apart) = 49px. Extra rows (2+) get no such reservation.
 *
 * Only ever the floor for a lane's *pill* content specifically
 * (lane-rows.ts's computeLaneRowModel) — a lane that also has
 * point-in-time milestones keeps the flat, density-scaled LANE_HEIGHT as
 * an additional floor for their own label-wrap clearance (see the
 * `markerFloor` composition below), since this ticket's own prototype
 * never modeled point markers at all (its item set was pills-only); a
 * real-schema correction on top of the prototype's own gist, same
 * category as t13/t14's corrections.
 */
const LANE_ROW1_FLOOR = PILL_PHASE_HEIGHT.tall + LABEL_LINE_H + (DATE_TIER_DY[1] - DATE_TIER_DY[0]);
const SEPARATOR_HEIGHT = 30;
const TOP_BAND_HEIGHT = 90;
/** Company-logo header slot (wayframe#46/#54) — reserved above the programName block only when data.companyLogo is set. */
const COMPANY_LOGO_HEIGHT = 26;
const COMPANY_LOGO_MAX_WIDTH = 140;
const COMPANY_LOGO_GAP = 6;
/** Freeform drag/resize bounds (wayframe#64) — keeps the logo from shrinking to nothing or growing enough to overlap the PROGRAM chip/programName row it sits above. */
const COMPANY_LOGO_MIN_SCALE = 0.5;
const COMPANY_LOGO_MAX_SCALE = 2.2;
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

/** "lean" lanes (Swimlane.density) render at this fraction of the normal lane height. */
const LEAN_LANE_FACTOR = 0.75;

function computeRows(
  swimlanes: Swimlane[],
  laneHeight = LANE_HEIGHT,
  separatorHeight = SEPARATOR_HEIGHT,
  /**
   * Full height for a "lane" row, keyed by swimlane id (wayframe#94/t20) —
   * overrides the flat, density-scaled default below. The caller (see
   * naturalHeightByLaneId/heightByLaneId further down) always supplies one
   * entry per lane, computed from that lane's own Lane Row model (t20) and
   * point-marker floor, and stretched by the fit-to-screen ratio; the flat
   * default here only remains as a defensive fallback.
   */
  heightByLaneId?: Map<string, number>,
): RowInfo[] {
  let y = 0;
  let laneIndex = 0;
  const out: RowInfo[] = [];
  for (const sl of [...swimlanes].sort((a, b) => a.order - b.order)) {
    const base = sl.type === "separator" ? separatorHeight : sl.density === "lean" ? laneHeight * LEAN_LANE_FACTOR : laneHeight;
    const height = sl.type === "lane" ? (heightByLaneId?.get(sl.id) ?? base) : base;
    out.push({ swimlane: sl, relY: y, height, laneIndex: sl.type === "lane" ? laneIndex : -1 });
    if (sl.type === "lane") laneIndex += 1;
    y += height;
  }
  return out;
}

/** Exported for use-zoom-window.ts (wayframe t10) — the full-document domain a zoom window clamps against. */
export function computeDomain(data: RenderableProgram): { domainMin: number; domainMax: number } {
  const allDates = [
    ...data.milestones.map((m) => m.date),
    ...data.milestones.filter((m) => m.endDate).map((m) => m.endDate!),
    ...data.milestones.filter((m) => m.originalDate).map((m) => m.originalDate!),
    ...data.milestones.filter((m) => m.potentialDate).map((m) => m.potentialDate!),
    ...data.topLevelItems.map((t) => ("date" in t ? t.date : t.endDate)),
    ...data.topLevelItems.map((t) => ("startDate" in t ? t.startDate : t.date)),
    ...data.topLevelItems.filter((t): t is Extract<TopLevelItem, { potentialDate?: string }> => "potentialDate" in t && !!t.potentialDate).map((t) => t.potentialDate!),
  ];
  const minDate = parseDate(allDates.reduce((a, b) => (a < b ? a : b)));
  const maxDate = parseDate(allDates.reduce((a, b) => (a > b ? a : b)));
  const PAD_DAYS = 14 * 86400000;
  return { domainMin: minDate - PAD_DAYS, domainMax: maxDate + PAD_DAYS };
}

function AxisRow({
  y,
  segments,
  fill,
  text,
  xOf,
  rowHeight = AXIS_ROW_HEIGHT,
  fontScale = 1,
  availablePx,
}: {
  y: number;
  segments: Segment[];
  /** Resolved fill for this row — Level 1 is the picked/theme axis color, Levels 2/3 are lighter shades of it (wayframe#70). */
  fill: string;
  /** Contrast-safe label/divider color for `fill`, not a fixed theme token — a light Level-3 shade needs dark text. */
  text: string;
  xOf: (ts: number) => number;
  rowHeight?: number;
  fontScale?: number;
  availablePx: number;
}) {
  const stride = labelStride(segments.length, availablePx);
  return (
    <>
      {segments.map((s, idx) => (
        <g key={s.label + s.start}>
          <rect x={xOf(s.start)} y={y} width={xOf(s.end) - xOf(s.start)} height={rowHeight} fill={fill} />
          <line x1={xOf(s.start)} x2={xOf(s.start)} y1={y} y2={y + rowHeight} stroke={text} strokeOpacity={0.25} />
          {idx % stride === 0 && (
            <text x={(xOf(s.start) + xOf(s.end)) / 2} y={y + rowHeight - 7} textAnchor="middle" fontSize={11 * fontScale} fontWeight={700} fill={text}>
              {s.label}
            </text>
          )}
        </g>
      ))}
    </>
  );
}

/**
 * Timeline-edge disclosure control (wayframe#70 prototype Variant E, as
 * decided) — sits in the existing MARGIN.right gutter rather than a
 * separate panel. ▶ reveals Level 2 (shown once, only while nothing's
 * expanded); ▼ opens the next level down from whichever row is currently
 * deepest; ▲ collapses any row that isn't Level 1. Only rendered when
 * `onAxisTiersChange` is provided — omitted for the off-screen export
 * capture, same convention as onEditDocument/onMilestoneClick.
 */
function AxisLevelControl({
  y,
  rowHeight,
  x,
  color,
  onCollapse,
  expandKind,
  onExpand,
}: {
  y: number;
  rowHeight: number;
  x: number;
  color: string;
  onCollapse?: () => void;
  expandKind?: "right" | "down";
  onExpand?: () => void;
}) {
  const cy = y + rowHeight / 2;
  return (
    <>
      {onCollapse && <AxisTriangleButton kind="up" cx={x + 11} cy={cy} color={color} label="Collapse this level" onActivate={onCollapse} />}
      {expandKind && onExpand && (
        <AxisTriangleButton
          kind={expandKind}
          cx={x + 27}
          cy={cy}
          color={color}
          label={expandKind === "right" ? "Reveal Level 2" : "Go one level deeper"}
          onActivate={onExpand}
        />
      )}
    </>
  );
}

function AxisTriangleButton({
  kind,
  cx,
  cy,
  color,
  label,
  onActivate,
}: {
  kind: "up" | "down" | "right";
  cx: number;
  cy: number;
  color: string;
  label: string;
  onActivate: () => void;
}) {
  const points =
    kind === "right"
      ? `${cx - 4},${cy - 5} ${cx - 4},${cy + 5} ${cx + 5},${cy}`
      : kind === "down"
        ? `${cx - 5},${cy - 4} ${cx + 5},${cy - 4} ${cx},${cy + 5}`
        : `${cx - 5},${cy + 4} ${cx + 5},${cy + 4} ${cx},${cy - 5}`;

  function onKeyDown(e: React.KeyboardEvent<SVGGElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  }

  return (
    <g
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      onKeyDown={onKeyDown}
    >
      <title>{label}</title>
      <rect x={cx - 8} y={cy - 8} width={16} height={16} fill="transparent" />
      <polygon points={points} fill={color} />
    </g>
  );
}

/** 5-point star path, outer radius `rOuter`, inner radius `rInner`, apex pointing up (wayframe#t19 markerShape). */
function starPath(cx: number, cy: number, rOuter: number, rInner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * (Math.PI / 5);
    const radius = i % 2 === 0 ? rOuter : rInner;
    const px = cx + radius * Math.cos(angle);
    const py = cy + radius * Math.sin(angle);
    points.push(`${i === 0 ? "M" : "L"}${px},${py}`);
  }
  return `${points.join(" ")} Z`;
}

// Marker silhouette (wayframe#t19 markerShape) — "diamond" is the original,
// still-default rotated rounded-square = softened "cushion" diamond; the
// other five are a pure editorial choice (theme.ts's own doc: status stays
// color-only, silhouette is never an automatic status encoding). Every
// variant is parameterized purely by (cx, cy, r) so an existing call site
// drawing a bigger ring via a bigger `r` keeps working unmodified for any
// shape.
function CushionMarker({
  cx,
  cy,
  r,
  shape = "diamond",
  fill,
  stroke,
  strokeWidth,
  strokeDasharray,
  fillOpacity,
}: {
  cx: number;
  cy: number;
  r: number;
  shape?: MarkerShape;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  fillOpacity?: number;
}) {
  const common = { fill, fillOpacity, stroke, strokeWidth, strokeDasharray };
  switch (shape) {
    case "square":
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.4} {...common} />;
    case "rectangle":
      return <rect x={cx - r * 1.2} y={cy - r * 0.8} width={r * 2.4} height={r * 1.6} rx={3} {...common} />;
    case "circle":
      return <circle cx={cx} cy={cy} r={r} {...common} />;
    case "star":
      return <path d={starPath(cx, cy, r, r * 0.42)} {...common} />;
    case "flag":
      return <path d={`M${cx - r},${cy - r} L${cx + r},${cy - r} L${cx},${cy + r * 0.5} Z`} {...common} />;
    case "diamond":
    default:
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.4} transform={`rotate(45 ${cx} ${cy})`} {...common} />;
  }
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
/**
 * Dependency-connector path shape — a viewer
 * preference (use-connector-style.ts), independent of the
 * critical/traced/plain stroke treatment above. "elbow" is the original
 * orthogonal three-segment path; "s-curve" replaces it with a single cubic
 * bezier; "rounded" keeps the same three waypoints but arcs the two
 * corners instead of squaring them off. Degenerate spans (same-lane
 * dependency, y1 === y2) fall back cleanly since the corner radius floors
 * at a fixed value rather than dividing by a zero span.
 */
function buildConnectorPath(x1: number, y1: number, x2: number, y2: number, midX: number, style: ConnectorStyle): string {
  if (style === "s-curve") {
    return `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
  }
  if (style === "rounded") {
    const r = Math.min(10, Math.abs(midX - x1) || 10, Math.abs(midX - x2) || 10, Math.abs(y2 - y1) / 2 || 10);
    const signX1 = midX >= x1 ? 1 : -1;
    const signX2 = midX >= x2 ? 1 : -1;
    const signY = y2 >= y1 ? 1 : -1;
    return `M${x1},${y1} L${midX - signX1 * r},${y1} Q${midX},${y1} ${midX},${y1 + signY * r} L${midX},${y2 - signY * r} Q${midX},${y2} ${midX + signX2 * r},${y2} L${x2},${y2}`;
  }
  return `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`;
}

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

// Unified delta-annotation rendering (t23, wayframe#96) — replaces the two
// independent slip-ghost (badge/outline) and at-risk-projection
// (sibling/comet/zone) systems documented as the bug in
// docs/research/t9-ghost-tier-inventory.md: two blind `layoutGhostBadges`
// passes that could both land a label at tier 0 for the same milestone.
// One shape (delta-ghosts.ts's DeltaGhost), one rendering primitive: every
// item's own priority-sorted ghosts (layoutItemGhosts) share the same
// GHOST_TIER_DY vertical ladder, and only the top-priority one gets a text
// label — the rest render as unlabeled dashed outlines, escalated outward
// so they never stack on the labeled one or each other.
function widthForDeltaGhostLabel(label: string, metricsScale: number): number {
  return Math.max(22, label.length * 6 * metricsScale + 8);
}

function DeltaGhostMarker({
  ghost,
  cx,
  cy,
  ghostX,
  color,
  fontScale = 1,
  metricsScale = 1,
  dx = 0,
  dy = 0,
  onDragStart,
}: {
  ghost: PlacedDeltaGhost;
  /** Anchor point of the REAL marker/pill this ghost belongs to. */
  cx: number;
  cy: number;
  /**
   * Position the ghost circle is drawn at — the "from" side of the delta
   * for a slip (mirrors today's GhostOutline), the "to"/projected side for
   * at-risk and scenario-diff (mirrors today's AtRiskProjection's riskCx) —
   * already resolved to a pixel x by the caller.
   */
  ghostX: number;
  color: string;
  fontScale?: number;
  metricsScale?: number;
  dx?: number;
  dy?: number;
  onDragStart?: (evt: React.PointerEvent<SVGGElement>) => void;
}) {
  // Field is part of the id too — a phase can carry two same-kind "slip"
  // ghosts at once (startDate + endDate each slipping independently), which
  // would otherwise collide on a single kind+item testid.
  const testId = `delta-ghost-${ghost.kind}-${ghost.field}-${ghost.itemId}`;
  // The labeled (rank-0) ghost's outline sits at a fixed cy, exactly like
  // today's GhostOutline/AtRiskProjection-sibling diamond — only its label
  // pill rides the tiered offset. An unlabeled (lower-priority) ghost has no
  // historical precedent (today never showed two systems on one item at
  // once); it gets its own vertical slot too, via the same GHOST_TIER_DY
  // ladder, purely so it doesn't visually stack on the labeled one.
  const outlineCy = ghost.labeled ? cy : cy + GHOST_TIER_DY[ghost.tier];

  if (!ghost.labeled) {
    return (
      <g data-testid={testId}>
        <CushionMarker cx={ghostX} cy={outlineCy} r={8} fill="none" stroke={color} strokeWidth={1.25} strokeDasharray="2 2" />
      </g>
    );
  }

  const label = labelForDeltaGhost(ghost);
  const badgeW = widthForDeltaGhostLabel(label, metricsScale);
  // Slip's label anchors near the current/committed marker (today's
  // GhostBadge: cx+12); at-risk/scenario-diff anchor at their own projected
  // position (today's AtRiskProjection-sibling: riskCx) — two different,
  // deliberately-preserved horizontal anchor formulas, not one unified one.
  const labelCenterX = (ghost.kind === "slip" ? cx + 12 : ghostX) + dx;
  const bx = labelCenterX - badgeW / 2;
  const by = cy + GHOST_TIER_DY[ghost.tier] + dy;
  const moved = ghost.tier > 0 || dx !== 0 || dy !== 0;
  return (
    <g data-testid={testId}>
      <CushionMarker cx={ghostX} cy={outlineCy} r={8} fill="none" stroke={color} strokeWidth={1.25} strokeDasharray="2 2" />
      {moved && <line x1={cx} y1={cy} x2={bx + badgeW / 2} y2={by + 6.5} stroke={color} strokeOpacity={0.3} />}
      <g pointerEvents={onDragStart ? "auto" : "none"} className={onDragStart ? "cursor-grab select-none active:cursor-grabbing" : undefined} onPointerDown={onDragStart}>
        <rect x={bx} y={by} width={badgeW} height={13} rx={6.5} fill={color} />
        <text x={bx + badgeW / 2} y={by + 9.5} textAnchor="middle" fontSize={8 * fontScale} fontWeight={700} fill="#ffffff">
          {label}
        </text>
      </g>
    </g>
  );
}

/** "+N more" — a small unobtrusive indicator for ghosts beyond MAX_DELTA_TIERS (t23), rendered just past the last real tier slot. */
function DeltaGhostOverflow({ count, cx, cy, fontScale = 1 }: { count: number; cx: number; cy: number; fontScale?: number }) {
  if (count <= 0) return null;
  const label = `+${count} more`;
  const w = Math.max(30, label.length * 5.2 + 8);
  const y = cy + GHOST_TIER_DY[MAX_DELTA_TIERS - 1] - 14;
  return (
    <g data-testid="delta-ghost-overflow">
      <rect x={cx - w / 2} y={y} width={w} height={12} rx={6} fill="none" stroke="currentColor" strokeOpacity={0.4} strokeDasharray="1 2" />
      <text x={cx} y={y + 9} textAnchor="middle" fontSize={7.5 * fontScale} fontWeight={600} fill="currentColor" opacity={0.7}>
        {label}
      </text>
    </g>
  );
}

/** Per-kind color for DeltaGhostMarker — slip keeps GhostOutline's old `currentColor` (inherits ink, no late/early split anymore), at-risk keeps its unchanged status color, scenario-diff uses the same accent token t18's theme editor already exposes. */
function colorForDeltaGhostKind(kind: DeltaGhostKind, theme: Theme): string {
  if (kind === "at-risk") return theme.statusColor["at-risk"];
  if (kind === "scenario-diff") return theme.accent;
  return "currentColor";
}

function MilestoneMarker({
  m,
  cx,
  cy,
  theme,
  primary,
  date,
  onClick,
  deltaGhosts = [],
  deltaGhostOverflow = 0,
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
  resolveX,
  category,
  dateLabelPlacement = "below",
  selected = false,
  remoteColor,
  program,
}: {
  m: RenderableMilestone;
  cx: number;
  cy: number;
  theme: Theme;
  /** Needed for t19's style-resolution ladder's Program-default rung. */
  program: Program;
  primary: TitlePlacement | null;
  date: { text: string; tier: 0 | 1 | 2 };
  onClick?: (m: Milestone, evt: React.MouseEvent<SVGGElement>) => void;
  /** This item's own placed ghosts (t23) — from deltaGhostPlacement, already priority-ranked/tiered by layoutItemGhosts + escalated by cross-item collision. Empty when annotations are off or this milestone has none. */
  deltaGhosts?: PlacedDeltaGhost[];
  /** Ghosts beyond MAX_DELTA_TIERS that didn't get a slot at all (t23) — rendered as a small "+N more" indicator, not a 4th tier. */
  deltaGhostOverflow?: number;
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
  /** Date -> pixel-x, so a delta ghost's own outline can resolve its position (the "from" side for a slip, the "to"/projected side for at-risk/scenario-diff) without RoadmapTimeline's domain scale living inside this component. */
  resolveX: (isoDate: string) => number;
  /** Legend category tag — resolved from Milestone.categoryId, only when category-fill encoding is on (see resolveMarkerPaint). */
  category?: LegendCategory;
  /** Marker date-label placement — "inline" skips the tiered below-marker slot entirely for a fixed beside-the-marker position. */
  dateLabelPlacement?: DateLabelPlacement;
  /** Rubber-band/click multi-select — renders a dashed accent ring, same layering idea as the critical/trace rings below but its own visual so the three never get confused for one another. */
  selected?: boolean;
  /**
   * A remote collaborator's selection color (wayframe t36), rendered as an
   * extra ring outside the local selection ring — reuses this exact
   * mechanism rather than a separate visual so "someone else has this
   * selected" reads as a variant of "I have this selected," not an
   * unrelated concept. Caller resolves peer id -> color from live awareness
   * state; RoadmapTimeline has no notion of peers itself.
   */
  remoteColor?: string;
}) {
  const shape = resolveMarkerShape(m, program, theme);
  const markerScale = resolveMarkerScale(m, program, theme);
  const r = 8 * markerScale;
  const effectiveFontScale = fontScale * resolveFontScale(m, program);
  const titlePos = resolveTitleLabelPosition(m);
  const datePos = resolveDateLabelPosition(m);
  const dateDy = DATE_TIER_DY[date.tier];
  const paint = resolveMarkerColor(m, theme, program, category);
  const strikeDate = m.status === "delayed";
  // Label block grows upward from its baseline, so the last line sits
  // closest to the marker and the first line ends up on top. The gap and
  // tier lift scale with fontScale — otherwise a bigger label's lines
  // close in on the fixed-size gap below them and start overlapping the
  // marker or, at tier 1, the tier-0 block they're meant to clear.
  const labelBaseDy = LABEL_BASE_DY * fontScale - (primary ? primary.tier * LABEL_TIER_LIFT * fontScale : 0);
  const tooltipW = Math.max(40, m.title.length * 6 * metricsScale + 16);
  // Scoped to slip specifically (not "has any delta ghost at all") — the
  // hover tooltip's old->new line only makes sense for a milestone that
  // actually moved from a prior committed date, same condition as today.
  const hasSlipGhost = !!(m.originalDate && m.originalDate !== m.date);
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
      {critical && <CushionMarker cx={cx} cy={cy} r={r + 4} shape={shape} fill="none" stroke={theme.criticalPathColor} strokeWidth={2} />}
      {traceState === "in" && <CushionMarker cx={cx} cy={cy} r={r + (critical ? 7.5 : 4)} shape={shape} fill="none" stroke={theme.traceColor} strokeWidth={2} />}
      {selected && <CushionMarker cx={cx} cy={cy} r={r + 11} shape={shape} fill="none" stroke={theme.accent} strokeWidth={1.5} strokeDasharray="2 2" />}
      {remoteColor && <CushionMarker cx={cx} cy={cy} r={r + 15} shape={shape} fill="none" stroke={remoteColor} strokeWidth={2} strokeDasharray="4 2" />}
      <CushionMarker cx={cx} cy={cy} r={r} shape={shape} fill={paint.fill} stroke={paint.stroke} strokeWidth={paint.strokeWidth} />
      {titlePos ? (
        // Fixed-position title override (wayframe#t19 titleLabelPosition) —
        // bypasses the tiered collision-avoidance layout entirely; no leader
        // line, no drag handle, since there's no collision math to escalate
        // against for a fixed compass placement.
        <text
          x={titlePos === "left" ? cx - r - 6 : titlePos === "right" ? cx + r + 6 : cx}
          y={titlePos === "top" ? cy - r - 6 : titlePos === "bottom" ? cy + r + 14 : titlePos === "inside" ? cy + 3 : cy + 3}
          textAnchor={titlePos === "left" ? "end" : titlePos === "right" ? "start" : "middle"}
          fontSize={(titlePos === "inside" ? 8 : 10) * effectiveFontScale}
          fontWeight={600}
          fill="currentColor"
        >
          {primary?.lines[0] ?? m.title}
        </text>
      ) : (
        primary && (
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
                fontSize={10 * effectiveFontScale}
                fontWeight={600}
                fill="currentColor"
              >
                {line}
              </text>
            ))}
          </g>
        )
      )}
      {datePos ? (
        // Fixed-position date override (wayframe#t19 dateLabelPosition) —
        // same treatment as titlePos above, independent of
        // dateLabelPlacement's inline/tiered choice.
        <text
          x={datePos === "left" ? cx - r - 6 : datePos === "right" ? cx + r + 6 : cx}
          y={datePos === "top" ? cy - r - 6 : datePos === "bottom" ? cy + r + 14 : datePos === "inside" ? cy + 3 : cy + 3}
          textAnchor={datePos === "left" ? "end" : datePos === "right" ? "start" : "middle"}
          fontSize={9 * effectiveFontScale}
          fill="currentColor"
          opacity={0.6}
          textDecoration={strikeDate ? "line-through" : undefined}
        >
          {date.text}
        </text>
      ) : dateLabelPlacement === "inline" ? (
        // Inline placement — a fixed slot beside the
        // marker rather than the tiered below-marker system, so it opts out
        // of drag-to-reposition (dateOffset) entirely; there's no collision
        // math to escalate against here.
        <text x={cx + r + 6} y={cy + 3} textAnchor="start" fontSize={9 * effectiveFontScale} fill="currentColor" opacity={0.6} textDecoration={strikeDate ? "line-through" : undefined}>
          {date.text}
        </text>
      ) : (
        <g
          transform={dateOffset.dx || dateOffset.dy ? `translate(${dateOffset.dx} ${dateOffset.dy})` : undefined}
          className={onDateDragStart ? "cursor-grab select-none active:cursor-grabbing" : undefined}
          onPointerDown={onDateDragStart}
        >
          <text x={cx} y={cy + dateDy} textAnchor="middle" fontSize={9 * effectiveFontScale} fill="currentColor" opacity={0.6} textDecoration={strikeDate ? "line-through" : undefined}>
            {date.text}
          </text>
        </g>
      )}
      {deltaGhosts.map((ghost) => (
        <DeltaGhostMarker
          key={`${ghost.kind}-${ghost.field}`}
          ghost={ghost}
          cx={cx}
          cy={cy}
          ghostX={ghost.kind === "slip" ? resolveX(ghost.from) : resolveX(ghost.to)}
          color={colorForDeltaGhostKind(ghost.kind, theme)}
          fontScale={effectiveFontScale}
          metricsScale={metricsScale}
          // Only one ghost per item can ever carry a manual drag offset,
          // matching today's one-badge-per-milestone drag model — that's
          // always the labeled (rank-0) one.
          dx={ghost.labeled ? ghostOffset.dx : 0}
          dy={ghost.labeled ? ghostOffset.dy : 0}
          onDragStart={ghost.labeled ? onGhostDragStart : undefined}
        />
      ))}
      {deltaGhostOverflow > 0 && <DeltaGhostOverflow count={deltaGhostOverflow} cx={cx} cy={cy} fontScale={effectiveFontScale} />}
      {/* hover reveal: full title. CSS-only (no JS state) — a real <title>
          element gets hoisted by React 19 as document metadata even inside
          <svg>, which desyncs SSR/client, so this is the workaround. */}
      <g className="pointer-events-none opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        <rect x={cx - tooltipW / 2} y={cy - 58} width={tooltipW} height={hasSlipGhost ? 34 : 20} rx={4} fill={theme.tooltipBg} />
        <text x={cx} y={cy - 44} textAnchor="middle" fontSize={11 * effectiveFontScale} fill={theme.tooltipInk}>
          {m.title}
        </text>
        {hasSlipGhost && (
          <text x={cx} y={cy - 30} textAnchor="middle" fontSize={9 * effectiveFontScale} fill={theme.tooltipInk} opacity={0.7}>
            <tspan textDecoration="line-through">{formatDateShort(m.originalDate!)}</tspan> → {formatDateShort(m.date)}
          </text>
        )}
      </g>
    </g>
  );
}

export interface RoadmapTimelineProps {
  data: RenderableProgram;
  theme?: Theme;
  axisTiers?: AxisTierConfig;
  /** Level 1 (Year) color — Levels 2/3 are always derived as lighter shades of it (wayframe#70); a picker lives in the Options menu, not here. Defaults to theme.axisBg. */
  axisYearColor?: string;
  /**
   * Fired with the fully-resolved next `{tier2, tier3}` when a timeline-edge
   * triangle is clicked (wayframe#70). Omit to render the axis read-only —
   * used for the off-screen export capture, same convention as
   * onEditDocument/onMilestoneClick.
   */
  onAxisTiersChange?: (next: AxisTierConfig) => void;
  /** Defaults to the real current date; override for tests/screenshots. */
  today?: Date;
  /** Opens the manual milestone editor (wayframe#19) — omit to keep markers non-interactive. */
  onMilestoneClick?: (m: Milestone, evt: React.MouseEvent<SVGGElement>) => void;
  /** Opens the lighter phase/top-level-milestone/annotation editor (wayframe#19, annotation added in wayframe#59). */
  onTopLevelItemClick?: (t: TopLevelItem, evt: React.MouseEvent<SVGGElement>) => void;
  /** Unified delta-annotation layer (t23, wayframe#96) — slip/at-risk/scenario-diff ghosts, one shared rendering primitive. Replaces the old independent ghostMode/atRiskMode viewer preferences. Defaults on, matching both old defaults. */
  deltaAnnotationsEnabled?: boolean;
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
  /** Fired once a logo drag or resize gesture ends (wayframe#64) — omit to keep the logo fixed/non-interactive (dev preview / off-screen export capture). */
  onCompanyLogoChange?: (patch: { dx: number; dy: number; scale: number }) => void;
  // --- Later additions ---
  /** Dependency-connector shape — a viewer preference, see use-connector-style.ts. */
  connectorStyle?: ConnectorStyle;
  /** Ordinary connector dash pattern — a viewer preference, see use-connector-line-style.ts. Critical-path/traced connectors keep their own fixed treatment regardless. */
  connectorDash?: ConnectorDash;
  /** Ordinary connector arrowhead — a viewer preference, see use-connector-line-style.ts. */
  connectorArrow?: ConnectorArrow;
  /** Today progress overlay: translucent elapsed-time fill + axis caret — off by default. */
  todayOverlayEnabled?: boolean;
  /** Duration-pill %-complete visualization — a viewer preference, see use-pill-progress-style.ts. */
  pillProgressStyle?: PillProgressStyle;
  /**
   * Stretches lanes to fill surplus viewport room — a viewer preference,
   * expand-only (wayframe#94/t20; see lane-rows.ts's
   * computeFitToScreenRatio). Content is never forced smaller than its
   * natural height; over-budget content just scrolls. Replaces the old
   * shrink-based "Auto lane height" toggle entirely — that one only ever
   * shrank below the flat LANE_HEIGHT, never grew past it; this is its
   * vertical-fit-to-screen successor, the sibling to #84/t10's horizontal
   * zoom/fit-to-screen.
   */
  fitToScreen?: boolean;
  /** Marker date-label placement — a viewer preference, see use-date-label-placement.ts. */
  dateLabelPlacement?: DateLabelPlacement;
  /** Legend category-fill / status-outline encoding — a viewer preference, see use-legend-category-style.ts and Milestone.categoryId. */
  legendCategoryFillEnabled?: boolean;
  /**
   * Per-category show/hide (t22) — a viewer preference (see
   * use-hidden-categories.ts), unlike Swimlane.hidden's lane-hide, which is
   * document content. A milestone whose categoryId is hidden stays in
   * layout/collision for everyone; it's only unpainted here, mirroring t19's
   * `resolveHidden` — suppresses just this milestone's own marker + its own
   * at-risk projection, not connectors, not layout. Omit (or return nothing
   * hidden) to render everything, e.g. the off-screen export capture.
   */
  isCategoryHidden?: (categoryId: string) => boolean;
  /** Shows each lane's Swimlane.owner below its name — a viewer preference, see use-swimlane-owner-visibility.ts. */
  swimlaneOwnerVisible?: boolean;
  /** Fired once a duration pill is dragged to a new date range, both ends shifted by the same delta — omit to keep pills reschedule-only via the editor. */
  onMilestoneDateRangeChange?: (milestoneId: string, isoDate: string, isoEndDate: string) => void;
  /** Rubber-band/click multi-select (mass-edit) — when on, a marker click toggles selection instead of opening its editor, and empty lane space can be marquee-dragged. */
  selectionModeEnabled?: boolean;
  /** Currently selected milestone ids — rendered with a distinct selection ring. */
  selectedIds?: Set<string>;
  /** Fired when a marker is clicked while selection mode is on. */
  onToggleSelect?: (id: string) => void;
  /** Fired once a marquee drag completes, with every milestone id it covered. */
  onMarqueeSelect?: (ids: string[]) => void;
  /**
   * Forces the rendered date domain instead of deriving it from `data` via
   * computeDomain (wayframe t10) — computeDomain's own ±14-day content-derived
   * pad otherwise floors how tight a zoomed-in window can render. Set by
   * use-zoom-window.ts once a requested window settles; omit to render the
   * full document (the default, unzoomed behavior).
   */
  domainOverride?: { min: number; max: number };
  /**
   * Milestone id -> remote collaborator's selection color (wayframe t36) —
   * rendered as an extra ring outside the local selection ring, reusing the
   * exact mechanism mass-edit's local `selectedIds` already uses (see
   * MilestoneMarker's `remoteColor`). RoadmapTimeline stays presence-agnostic:
   * the caller resolves live awareness state (peer id -> color -> selected
   * milestone) into this flat map; omit to render with no remote-selection
   * rings at all, same as today. No caller supplies this yet — real
   * awareness data doesn't exist in the app until t14/t37/t38 land; this is
   * the rendering half only, same "scaffolded, unconsumed" treatment t4 gave
   * party/ and src/lib/realtime/provider.ts.
   */
  remoteSelections?: Record<string, string>;
}

export function RoadmapTimeline({
  data,
  theme = defaultTheme,
  axisTiers = AXIS_PRESETS[1],
  axisYearColor,
  onAxisTiersChange,
  width: fixedWidth,
  today = new Date(),
  onMilestoneClick,
  onTopLevelItemClick,
  deltaAnnotationsEnabled = true,
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
  onCompanyLogoChange,
  connectorStyle = "elbow",
  connectorDash = "solid",
  connectorArrow = "standard",
  todayOverlayEnabled = false,
  pillProgressStyle = "off",
  fitToScreen = false,
  dateLabelPlacement = "below",
  legendCategoryFillEnabled = false,
  isCategoryHidden,
  swimlaneOwnerVisible = true,
  onMilestoneDateRangeChange,
  selectionModeEnabled = false,
  selectedIds,
  onToggleSelect,
  onMarqueeSelect,
  domainOverride,
  remoteSelections,
}: RoadmapTimelineProps) {
  // Fit to screen (wayframe#94/t20) — expand-only, replacing the old
  // shrink-based "Auto lane height" toggle entirely. Measures window
  // height, not the container's own (the container's height is driven BY
  // the chart, not the other way around — there's nothing else to measure
  // it against).
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!fitToScreen || typeof window === "undefined") return;
    const measure = () => setViewportHeight(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fitToScreen]);
  // Rough chrome budget above the first lane row (margin + a 2-row axis +
  // the PROGRAM band + some slack for reference-line chips) — an estimate,
  // not the real lanesTop, which isn't computable yet this early (it
  // depends on refTopMarginExtra, computed further down from state this
  // function hasn't built yet). Good enough for "fit to screen," which
  // only needs to be approximately right, not pixel-exact.
  const reservedChromeEstimate = MARGIN.top + AXIS_ROW_HEIGHT * 2 * boxScale + TOP_BAND_HEIGHT * boxScale + MARGIN.bottom + 80;

  // Lane Rows & vertical allocation (wayframe#94/t20) — two allocators
  // layered, not one (see lane-rows.ts's own doc). Level 1 buckets a
  // lane's duration pills by Milestone.laneRow (document content); Level 2
  // is the existing stack-intervals.ts greedy stacker, run within
  // whichever row a pill lands in — an item's row assignment overrides
  // which row it collides inside, never turns off collision safety there.
  // Point milestones never participate, same restriction stack-
  // intervals.ts always had.
  // Lane-hide (t22) — excluded from layout entirely, not just unpainted: a hidden
  // lane reserves no row slot, so it's filtered out before any row computation.
  const visibleSwimlanes = data.swimlanes.filter((sl) => sl.type !== "lane" || !sl.hidden);

  const laneRowModelByLaneId = new Map<string, LaneRowModel>();
  const naturalHeightByLaneId = new Map<string, number>();
  for (const lane of visibleSwimlanes) {
    if (lane.type !== "lane") continue;
    const densityFactor = lane.density === "lean" ? LEAN_LANE_FACTOR : 1;
    const pills = data.milestones.filter((m) => m.laneId === lane.id && m.endDate);
    if (pills.length === 0) {
      // No pills at all — nothing for the Lane Row model to bucket, so
      // this lane keeps today's flat, density-scaled height unchanged
      // (with or without point markers; that clearance is what
      // LANE_HEIGHT always provided).
      naturalHeightByLaneId.set(lane.id, LANE_HEIGHT * boxScale * densityFactor);
      continue;
    }
    // A lane mixing point markers with duration pills still needs the flat
    // LANE_HEIGHT floor for the markers' own label-wrap clearance
    // (laneY() centers both point markers and pills on the same lane
    // midpoint) regardless of what the pills need — see LANE_ROW1_FLOOR's
    // own doc for why this is a real correction on top of the prototype's
    // gist, not something its pills-only model ever had to account for.
    const hasPointMarkers = data.milestones.some((m) => m.laneId === lane.id && !m.endDate);
    const markerFloor = hasPointMarkers ? LANE_HEIGHT * boxScale * densityFactor : 0;
    const items: RowItem[] = pills.map((m) => ({
      id: m.id,
      start: parseDate(m.date),
      end: parseDate(m.endDate!),
      laneRow: m.laneRow,
      sizeFloor: PILL_PHASE_HEIGHT[resolvePhaseSize(m, data, theme)] * boxScale * densityFactor,
    }));
    const model = computeLaneRowModel(items, {
      baseSlotHeight: PILL_ROW_HEIGHT * boxScale * densityFactor,
      row1Floor: LANE_ROW1_FLOOR * boxScale * densityFactor,
    });
    laneRowModelByLaneId.set(lane.id, model);
    naturalHeightByLaneId.set(lane.id, Math.max(markerFloor, model.naturalHeight));
  }

  const totalNaturalHeight = [...naturalHeightByLaneId.values()].reduce((sum, h) => sum + h, 0);
  const fitRatio = fitToScreen && viewportHeight ? computeFitToScreenRatio(totalNaturalHeight, viewportHeight - reservedChromeEstimate) : 1;
  const heightByLaneId = new Map<string, number>();
  for (const [laneId, natural] of naturalHeightByLaneId) heightByLaneId.set(laneId, natural * fitRatio);

  const rows = computeRows(visibleSwimlanes, LANE_HEIGHT * boxScale, SEPARATOR_HEIGHT * boxScale, heightByLaneId);
  const bodyHeight = rows.reduce((sum, r) => sum + r.height, 0);
  const rowById = new Map(rows.map((r) => [r.swimlane.id, r]));
  // Lane-hide (t22) — rowById only contains visible lanes as a side effect
  // of filtering above; use this to guard direct data.milestones iteration
  // (not scoped to `rows`) so a hidden lane's milestone doesn't get drawn
  // floating at lanesTop.
  const laneVisible = (laneId: string) => rowById.has(laneId);
  const milestoneById = new Map(data.milestones.map((m) => [m.id, m]));
  const categoryById = new Map((data.legendCategories ?? []).map((c) => [c.id, c]));
  /**
   * Vertical offset for a pill's cy within its (possibly grown) lane — 0
   * for every lane with no pills at all. The whole stack of Lane-Row
   * bands (wayframe#94/t20; possibly just one, the common case) is
   * centered on the lane's own middle (laneY), same placement the single
   * flat stacking band had before Lane Rows existed — a document with no
   * explicit `laneRow` assignments renders byte-identical to today, since
   * bucketRows then produces exactly that one row. Row heights here are
   * deliberately the *natural* (un-fit-to-screen-stretched) ones — a
   * grown lane gets more breathing room around this band, not a
   * distorted, stretched one; only the lane's own outer height (laneY's
   * `row.height`) is ever multiplied by the fit ratio.
   */
  function pillSubRowOffset(laneId: string, milestoneId: string): number {
    const model = laneRowModelByLaneId.get(laneId);
    if (!model) return 0;
    const rowGapPx = ROW_GAP * boxScale;
    const totalBandHeight = model.rows.reduce((sum, r) => sum + r.slotHeights.reduce((a, b) => a + b, 0), 0) + Math.max(0, model.rows.length - 1) * rowGapPx;
    let rowTop = -totalBandHeight / 2;
    for (const row of model.rows) {
      const subRow = row.subRowById.get(milestoneId);
      if (subRow !== undefined) {
        let slotTop = rowTop;
        for (let r = 0; r < subRow; r++) slotTop += row.slotHeights[r];
        return slotTop + row.slotHeights[subRow] / 2;
      }
      rowTop += row.slotHeights.reduce((a, b) => a + b, 0) + rowGapPx;
    }
    return 0;
  }
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

  // Freeform logo drag/resize (wayframe#64) — unlike labelDrag above, this
  // commits to the document (onCompanyLogoChange), not use-label-overrides.ts,
  // per the ticket's resolution: the logo's placement travels with the file.
  // `mode` distinguishes a move-gesture (both axes, from the image body) from
  // a resize-gesture (uniform scale, from the corner handle) sharing one
  // piece of state so only one can be in flight at a time.
  const [logoDrag, setLogoDrag] = useState<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    baseDx: number;
    baseDy: number;
    baseScale: number;
    dx: number;
    dy: number;
    scale: number;
  } | null>(null);
  // Resize-handle visibility — hidden by default so it doesn't clutter a
  // chart nobody's actively adjusting, revealed on hover (which a click has
  // to pass through anyway) and while a drag/resize is in flight, hidden
  // again once a resize gesture completes or the pointer leaves.
  const [logoHovered, setLogoHovered] = useState(false);

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
  const { domainMin, domainMax } = domainOverride ? { domainMin: domainOverride.min, domainMax: domainOverride.max } : computeDomain(data);
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
  const refLaneRefs = data.milestones.filter((m) => m.showReferenceLine && laneVisible(m.laneId));
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
  // The logo's default position sits flush with the very top of the chart
  // (chartTopMargin, same y the axis rows start at), in the left margin
  // column the axis never paints into (AxisRow's segments start at
  // MARGIN.left) — not a dedicated strip carved out of the top band, so
  // topBandHeight/the PROGRAM chip/programName no longer need pushing down
  // to make room for it (wayframe#64, revising #46/#54's original layout).
  const topBandHeight = TOP_BAND_HEIGHT * boxScale;
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
  /** Per-milestone delta-ghost placement (t23) — replaces ghostPlacement/atRiskPlacement, the two independently-blind tiered passes documented as the bug in docs/research/t9-ghost-tier-inventory.md. */
  const deltaGhostPlacement = new Map<string, { placed: PlacedDeltaGhost[]; overflowCount: number }>();
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

    // Unified delta-ghost collision reconciliation (t23, wayframe#96):
    // replaces the two independent layoutGhostBadges passes that used to
    // seed ghostPlacement/atRiskPlacement blind to each other — the exact
    // bug docs/research/t9-ghost-tier-inventory.md documents (both could
    // independently land at tier 0 for the same milestone). One pass per
    // lane: each milestone's own ghosts are priority-ranked/tiered locally
    // (layoutItemGhosts) first, then only the labeled (rank-0) ghost per
    // item — the one that needs text-collision avoidance — is fed into a
    // single shared layoutGhostBadges call, same as before. The resulting
    // cross-item tier overrides the labeled ghost's local tier (always 0
    // from layoutItemGhosts); the item's other, unlabeled ghosts keep their
    // local tier unchanged — a deliberate simplification (this ticket never
    // modeled cross-item collision for secondary same-item ghosts, mirroring
    // t19's own fixed-offset label positions bypassing collision math).
    if (deltaAnnotationsEnabled) {
      const perItem = new Map<string, { placed: PlacedDeltaGhost[]; overflowCount: number }>();
      const labeledItems: GhostBadgeItem[] = [];
      for (const m of laneMilestones) {
        const ghosts = ghostsForMilestone(m);
        if (ghosts.length === 0) continue;
        const result = layoutItemGhosts(ghosts);
        perItem.set(m.id, result);
        const labeled = result.placed.find((g) => g.labeled);
        if (!labeled) continue;
        const label = labelForDeltaGhost(labeled);
        const w = widthForDeltaGhostLabel(label, metricsScale);
        // Today's two systems anchored their labels differently (see
        // docs/research/t9-ghost-tier-inventory.md): slip near the current
        // committed date (x(m.date)+12+w/2), at-risk/scenario-diff at their
        // own projected position (x(ghost.to)) — which formula applies now
        // depends on which kind won this item's priority ranking, not on a
        // single unified anchor.
        const anchorX = labeled.kind === "slip" ? x(m.date) + 12 + w / 2 : x(labeled.to);
        labeledItems.push({ id: m.id, x: anchorX, text: label });
      }
      if (labeledItems.length > 0) {
        // Same title-blockers construction as before, unchanged.
        const blockers: GhostBlocker[] = laneMilestones
          .filter((m) => (primary.get(m.id)?.lines.length ?? 0) > 0)
          .map((m) => {
            const lines = primary.get(m.id)!.lines;
            const widestLine = Math.max(...lines.map((l) => l.length));
            return { x: x(m.date), w: widestLine * CHAR_W * metricsScale };
          });
        const crossItemTiers = layoutGhostBadges(labeledItems, blockers, 6 * metricsScale);
        for (const [id, tierPlacement] of crossItemTiers) {
          const result = perItem.get(id)!;
          result.placed = result.placed.map((g) => (g.labeled ? { ...g, tier: tierPlacement.tier } : g));
        }
      }
      for (const [id, result] of perItem) deltaGhostPlacement.set(id, result);
    }
  }

  /**
   * cx for a "phase" TopLevelItem's delta ghosts — the pill's right edge.
   * Factored out so the pre-pass below and the render loop's own JSX use
   * the exact same formula rather than risking two copies silently
   * drifting apart (both need it: the pre-pass to seed the cross-item
   * zone, the render loop to actually draw the marker).
   */
  function phaseGhostAnchorX(t: Extract<TopLevelItem, { type: "phase" }>): number {
    const px = x(t.startDate);
    const phaseSize = resolvePhaseSize(t, data, theme);
    const sizeMultiplier = phaseSize === "lean" ? 0.75 : phaseSize === "tall" ? 1.35 : 1;
    const h = PILL_HEIGHT_LG * boxScale * sizeMultiplier;
    const w = Math.max(h, x(t.endDate) - px);
    return px + w;
  }

  /**
   * PROGRAM-band cross-item delta-ghost collision (t24) — a genuine
   * gap-fill, not a migration: today's phase/milestone TopLevelItem render
   * loop calls layoutItemGhosts per item with zero awareness of
   * neighboring items, so two adjacent phases' at-risk projections could
   * silently overlap. Mirrors the lane-milestone block above exactly: each
   * item's own ghosts stay ranked/tiered locally (layoutItemGhosts,
   * unchanged), but only the labeled (rank-0) ghost per item is fed into
   * one shared cross-item zone spanning the whole program band (phase and
   * milestone variants share one row, so they're real neighbors) — the
   * same conservative "only the labeled ghost gets real collision math"
   * treatment lane milestones already have, not a "full fusion" of every
   * ghost.
   */
  const programBandGhostPlacement = new Map<string, { placed: PlacedDeltaGhost[]; overflowCount: number }>();
  if (deltaAnnotationsEnabled) {
    const perItem = new Map<string, { placed: PlacedDeltaGhost[]; overflowCount: number }>();
    const labeledDemands: Demand[] = [];
    for (const t of data.topLevelItems) {
      if (t.type !== "phase" && t.type !== "milestone") continue;
      if (resolveHidden(t, data)) continue;
      const ghosts = t.type === "phase" ? ghostsForTopLevelItemPhase(t) : ghostsForTopLevelItemMilestone(t);
      if (ghosts.length === 0) continue;
      const result = layoutItemGhosts(ghosts);
      perItem.set(t.id, result);
      const labeled = result.placed.find((g) => g.labeled);
      if (!labeled) continue;
      const cx = t.type === "phase" ? phaseGhostAnchorX(t) : x(t.date);
      const label = labelForDeltaGhost(labeled);
      labeledDemands.push({ id: t.id, x: cx, priority: 0, variants: [{ key: "only", width: widthForDeltaGhostLabel(label, metricsScale) }] });
    }
    if (labeledDemands.length > 0) {
      const { results } = allocate(labeledDemands, { tierCount: 2, gap: MIN_GAP, onExhausted: "overflow" });
      for (const [id, placement] of results) {
        const result = perItem.get(id)!;
        result.placed = result.placed.map((g) => (g.labeled ? { ...g, tier: placement.tier as 0 | 1 | 2 } : g));
      }
    }
    for (const [id, result] of perItem) programBandGhostPlacement.set(id, result);
  }

  /** Inverse of x(): a pixel position back to an ISO date, snapped to a day. */
  function dateAtX(px: number): string {
    const ts = domainMin + ((px - MARGIN.left) / innerWidth) * (domainMax - domainMin);
    const d = new Date(ts);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
  }

  function beginDrag(m: Milestone, evt: React.PointerEvent<SVGGElement>) {
    // A pill (m.endDate set) drags via onMilestoneDateRangeChange
    // (translates both ends together); a point marker drags
    // via onMilestoneDateChange as before. Guard on whichever one this
    // milestone actually needs, not just onMilestoneDateChange, or pills
    // silently stop being draggable when only the range handler is wired.
    if (m.endDate ? !onMilestoneDateRangeChange : !onMilestoneDateChange) return;
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
    if (m && drag.moved) {
      if (m.endDate && onMilestoneDateRangeChange) {
        const nextDate = dateAtX(x(m.date) + drag.dx);
        const nextEndDate = dateAtX(x(m.endDate) + drag.dx);
        if (nextDate !== m.date || nextEndDate !== m.endDate) onMilestoneDateRangeChange(m.id, nextDate, nextEndDate);
      } else if (!m.endDate && onMilestoneDateChange) {
        const next = dateAtX(x(m.date) + drag.dx);
        if (next !== m.date) onMilestoneDateChange(m.id, next);
      }
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

  // Freeform logo drag/resize bounds (wayframe#64) — the logo's default top
  // sits flush with chartTopMargin (the timeline's own top, where the axis
  // rows start), so dy=0 means "aligned with the timeline top," not "just
  // above the PROGRAM band" like the original #46/#54 layout. Bounds keep it
  // from dragging/growing down into the PROGRAM chip/programName row
  // (topBandY, where that band starts) or shrinking past
  // COMPANY_LOGO_MIN_SCALE. Resize clamps scale against the *current* dy
  // rather than nudging dy to fit, so growing the logo never silently
  // repositions it.
  function clampLogoDy(dy: number, scale: number): number {
    const logoH = COMPANY_LOGO_HEIGHT * fontScale * scale;
    const minDy = -chartTopMargin;
    const maxDy = topBandY - 2 - chartTopMargin - logoH;
    return Math.max(minDy, Math.min(maxDy, dy));
  }
  function clampLogoDx(dx: number, scale: number): number {
    const logoW = COMPANY_LOGO_MAX_WIDTH * metricsScale * scale;
    const minDx = -16;
    const maxDx = Math.max(minDx, width - MARGIN.right - 16 - logoW);
    return Math.max(minDx, Math.min(maxDx, dx));
  }
  function clampLogoScale(scale: number, dy: number): number {
    const maxByOverlap = (topBandY - 2 - chartTopMargin - dy) / (COMPANY_LOGO_HEIGHT * fontScale);
    return Math.max(COMPANY_LOGO_MIN_SCALE, Math.min(COMPANY_LOGO_MAX_SCALE, maxByOverlap, scale));
  }
  function beginLogoDrag(mode: "move" | "resize", evt: React.PointerEvent<SVGElement>) {
    if (!onCompanyLogoChange || !data.companyLogo) return;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    evt.stopPropagation();
    const dx = data.companyLogo.dx ?? 0;
    const dy = data.companyLogo.dy ?? 0;
    const scale = data.companyLogo.scale ?? 1;
    setLogoDrag({ mode, startX: evt.clientX, startY: evt.clientY, baseDx: dx, baseDy: dy, baseScale: scale, dx, dy, scale });
  }
  function moveLogoDrag(evt: React.PointerEvent<SVGSVGElement>) {
    if (!logoDrag) return;
    if (logoDrag.mode === "move") {
      const dx = clampLogoDx(logoDrag.baseDx + (evt.clientX - logoDrag.startX), logoDrag.baseScale);
      const dy = clampLogoDy(logoDrag.baseDy + (evt.clientY - logoDrag.startY), logoDrag.baseScale);
      setLogoDrag({ ...logoDrag, dx, dy });
    } else {
      const rawScale = logoDrag.baseScale + (evt.clientX - logoDrag.startX) / COMPANY_LOGO_MAX_WIDTH;
      const scale = clampLogoScale(rawScale, logoDrag.baseDy);
      setLogoDrag({ ...logoDrag, scale });
    }
  }
  function endLogoDrag() {
    if (!logoDrag) return;
    onCompanyLogoChange?.({ dx: logoDrag.dx, dy: logoDrag.dy, scale: logoDrag.scale });
    // Hide the handle immediately once a resize completes, rather than
    // waiting for a pointerleave that pointer capture may have suppressed.
    if (logoDrag.mode === "resize") setLogoHovered(false);
    setLogoDrag(null);
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
  function localY(clientY: number): number {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? clientY - rect.top : clientY;
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

  // Rubber-band marquee select (mass-edit): a
  // pointer-down on empty lane background while selection mode is armed
  // draws a rect; on release, every point milestone whose marker center
  // falls inside it gets added to the selection. Mirrors createDrag's
  // shape/lifecycle above (own state, doesn't touch the document — the
  // eventual bulk edit is what goes through undo, not the selection act
  // itself). Duration pills don't participate — the plan scopes mass-edit
  // to milestones, matching SelectionToolbar's own selection type.
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  function beginMarquee(evt: React.PointerEvent<SVGRectElement>) {
    if (!selectionModeEnabled || placementMode) return;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    const x0 = localX(evt.clientX);
    const y0 = localY(evt.clientY);
    setMarquee({ startX: x0, startY: y0, curX: x0, curY: y0 });
  }
  function moveMarquee(evt: React.PointerEvent<SVGSVGElement>) {
    if (!marquee) return;
    setMarquee({ ...marquee, curX: localX(evt.clientX), curY: localY(evt.clientY) });
  }
  function endMarquee() {
    if (!marquee) return;
    const lo = { x: Math.min(marquee.startX, marquee.curX), y: Math.min(marquee.startY, marquee.curY) };
    const hi = { x: Math.max(marquee.startX, marquee.curX), y: Math.max(marquee.startY, marquee.curY) };
    if (hi.x - lo.x > DRAG_THRESHOLD_PX || hi.y - lo.y > DRAG_THRESHOLD_PX) {
      const hits = data.milestones
        .filter((m) => !m.endDate)
        .filter((m) => {
          const cx = x(m.date);
          const cy = laneY(m.laneId);
          return cx >= lo.x && cx <= hi.x && cy >= lo.y && cy <= hi.y;
        })
        .map((m) => m.id);
      if (hits.length > 0) onMarqueeSelect?.(hits);
    }
    setMarquee(null);
  }

  // Level 1 is the picked (or theme-default) axis color; Levels 2/3 are
  // always lighter shades of it, never independently colored (wayframe#70).
  const axisYearColorResolved = axisYearColor ?? theme.axisBg;
  const axisShades = [axisYearColorResolved, lighten(axisYearColorResolved, 0.22), lighten(axisYearColorResolved, 0.42)];
  const tier3Choices = tier3OptionsFor(axisTiers.tier2).filter((t) => t !== "none");

  interface AxisRowSpec {
    segments: Segment[];
    fill: string;
    text: string;
    onCollapse?: () => void;
    expandKind?: "right" | "down";
    onExpand?: () => void;
  }
  const axisRows: AxisRowSpec[] = [
    {
      segments: yearSegments(domainMin, domainMax),
      fill: axisShades[0],
      text: contrastText(axisShades[0]),
      expandKind: onAxisTiersChange && axisTiers.tier2 === "none" ? "right" : undefined,
      onExpand: onAxisTiersChange && axisTiers.tier2 === "none" ? () => onAxisTiersChange({ ...axisTiers, tier2: "quarter", tier3: "none" }) : undefined,
    },
  ];
  if (axisTiers.tier2 !== "none") {
    axisRows.push({
      segments: segmentsForTier(axisTiers.tier2, domainMin, domainMax),
      fill: axisShades[1],
      text: contrastText(axisShades[1]),
      onCollapse: onAxisTiersChange ? () => onAxisTiersChange({ ...axisTiers, tier2: "none", tier3: "none" }) : undefined,
      expandKind: onAxisTiersChange && axisTiers.tier3 === "none" ? "down" : undefined,
      onExpand: onAxisTiersChange && axisTiers.tier3 === "none" ? () => onAxisTiersChange({ ...axisTiers, tier3: tier3Choices[0] ?? "none" }) : undefined,
    });
  }
  if (axisTiers.tier2 !== "none" && axisTiers.tier3 !== "none") {
    axisRows.push({
      segments: segmentsForTier(axisTiers.tier3, domainMin, domainMax),
      fill: axisShades[2],
      text: contrastText(axisShades[2]),
      onCollapse: onAxisTiersChange ? () => onAxisTiersChange({ ...axisTiers, tier3: "none" }) : undefined,
    });
  }

  const programNameLines = wrapText(data.programName, Math.max(6, Math.floor(26 / metricsScale)), 3);
  const headerY = topBandY + (topBandStyle === "chip" ? 30 : 14);
  const ownerY = headerY + programNameLines.length * 15 * fontScale + 4 * fontScale;

  // Freeform logo geometry (wayframe#64) — an in-flight drag/resize
  // (logoDrag) previews ahead of the committed data.companyLogo.dx/dy/scale,
  // same "live gesture overlays committed state" shape as labelDrag/drag above.
  const logoDx = logoDrag ? logoDrag.dx : (data.companyLogo?.dx ?? 0);
  const logoDy = logoDrag ? logoDrag.dy : (data.companyLogo?.dy ?? 0);
  const logoScale = logoDrag ? logoDrag.scale : (data.companyLogo?.scale ?? 1);
  const logoX = 16 + logoDx;
  // Default top flush with the timeline's own top (chartTopMargin, same y
  // the axis rows start at) — a left-margin masthead spot the axis never
  // paints into, not a strip carved out of the PROGRAM band below it.
  const logoY = chartTopMargin + logoDy;
  const logoW = COMPANY_LOGO_MAX_WIDTH * metricsScale * logoScale;
  const logoH = COMPANY_LOGO_HEIGHT * fontScale * logoScale;

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
          drag || createDrag || labelDrag || logoDrag || marquee
            ? (e) => {
                moveDrag(e);
                moveCreateDrag(e);
                moveLabelDrag(e);
                moveLogoDrag(e);
                moveMarquee(e);
              }
            : undefined
        }
        onPointerUp={
          drag || createDrag || labelDrag || logoDrag || marquee
            ? () => {
                endDrag();
                endCreateDrag();
                endLabelDrag();
                endLogoDrag();
                endMarquee();
              }
            : undefined
        }
        onPointerCancel={
          drag || createDrag || labelDrag || logoDrag || marquee
            ? () => {
                setDrag(null);
                setCreateDrag(null);
                setLabelDrag(null);
                setLogoDrag(null);
                setMarquee(null);
              }
            : undefined
        }
      >
        {axisRows.map((row, i) => (
          <AxisRow
            key={i}
            y={chartTopMargin + i * axisRowHeight}
            segments={row.segments}
            fill={row.fill}
            text={row.text}
            xOf={xTs}
            rowHeight={axisRowHeight}
            fontScale={fontScale}
            availablePx={innerWidth}
          />
        ))}
        {onAxisTiersChange &&
          axisRows.map((row, i) => (
            <AxisLevelControl
              key={i}
              y={chartTopMargin + i * axisRowHeight}
              rowHeight={axisRowHeight}
              x={width - MARGIN.right}
              color={theme.accent}
              onCollapse={row.onCollapse}
              expandKind={row.expandKind}
              onExpand={row.onExpand}
            />
          ))}

        {/* PROGRAM-band highlight treatment (wayframe#41) — "tint"/"border" paint the band itself; "chip" leaves it unpainted. */}
        {topBandStyle === "tint" && <rect x={0} y={topBandY} width={width} height={topBandHeight} fill={theme.accent} fillOpacity={0.08} />}
        {topBandStyle === "border" && (
          <>
            <rect x={0} y={topBandY} width={width} height={3} fill={theme.accent} />
            <rect x={0} y={topBandY + topBandHeight - 1} width={width} height={1} fill={theme.accent} fillOpacity={0.4} />
          </>
        )}
        {/* Company logo (wayframe#46/#54, freeform drag/resize in #64) —
            top-left masthead spot, default-aligned with the timeline's own
            top (chartTopMargin) in the left margin column the axis never
            paints into — same x=16 margin the programme name/owner sit in
            further down, just not tied to their position anymore. Distinct
            from the fixed WayframeLogo mark in the page chrome
            (RoadmapWorkspace's top-left bar); both are visible at once.
            preserveAspectRatio keeps an arbitrary uploaded image from
            distorting as it's resized. */}
        {data.companyLogo && (
          <g
            onPointerEnter={onCompanyLogoChange ? () => setLogoHovered(true) : undefined}
            onPointerLeave={onCompanyLogoChange && !logoDrag ? () => setLogoHovered(false) : undefined}
          >
            <image
              href={data.companyLogo.dataUrl}
              x={logoX}
              y={logoY}
              width={logoW}
              height={logoH}
              preserveAspectRatio="xMinYMid meet"
              pointerEvents={onCompanyLogoChange ? "auto" : "none"}
              className={onCompanyLogoChange ? "cursor-grab select-none active:cursor-grabbing" : undefined}
              onPointerDown={onCompanyLogoChange ? (e) => beginLogoDrag("move", e) : undefined}
            />
            {/* Direct-manipulation resize handle (wayframe#64) — bottom-right
                corner, uniform scale from horizontal drag distance. Hidden
                until the logo is hovered/clicked, hidden again once a resize
                ends or the pointer leaves — a permanently-visible handle
                cluttered the chart for every viewer, not just the one
                editing it. Omitted entirely (like the drag above) whenever
                the logo itself is (dev preview / off-screen export capture). */}
            {onCompanyLogoChange && (logoHovered || !!logoDrag) && (
              <rect
                x={logoX + logoW - 6}
                y={logoY + logoH - 6}
                width={10}
                height={10}
                rx={2}
                fill={theme.accent}
                stroke={theme.ground}
                strokeWidth={1}
                className="cursor-nwse-resize"
                onPointerDown={(e) => beginLogoDrag("resize", e)}
              />
            )}
          </g>
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
            if (resolveHidden(t, data)) return null;
            const px = x(t.startDate);
            const phaseSize = resolvePhaseSize(t, data, theme);
            const sizeMultiplier = phaseSize === "lean" ? 0.75 : phaseSize === "tall" ? 1.35 : 1;
            const h = PILL_HEIGHT_LG * boxScale * sizeMultiplier;
            const phaseShape = resolvePhaseShape(t, data, theme);
            const rx = phaseShape === "pill" ? h / 2 : 3;
            const w = Math.max(h, x(t.endDate) - px);
            const effectiveFontScale = fontScale * resolveFontScale(t, data);
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
                  rx={rx}
                  fill={theme.statusColor[t.status]}
                  fillOpacity={0.35}
                  stroke={theme.statusColor[t.status]}
                />
                {label && (
                  <text x={px + h / 2} y={y + 4} fontSize={11 * effectiveFontScale} fontWeight={600}>
                    {label}
                  </text>
                )}
                {/* Unified delta ghosts (t23) — up to 3 real kinds can co-occur
                    here (both slip edges + at-risk), the one render context
                    that can. Each still gets its own GHOST_TIER_DY vertical
                    slot from layoutItemGhosts so multiple ghosts don't
                    collapse into one. The labeled (rank-0) ghost's tier now
                    comes from programBandGhostPlacement's cross-item pass
                    (t24) — real collision-aware, spanning the whole program
                    band; every other (unlabeled) ghost on this item keeps
                    its fixed local offset, same as before. */}
                {deltaAnnotationsEnabled &&
                  (() => {
                    const { placed, overflowCount } = programBandGhostPlacement.get(t.id) ?? { placed: [], overflowCount: 0 };
                    return (
                      <>
                        {placed.map((ghost) => (
                          <DeltaGhostMarker
                            key={`${ghost.kind}-${ghost.field}`}
                            ghost={ghost}
                            cx={phaseGhostAnchorX(t)}
                            cy={y}
                            ghostX={ghost.kind === "slip" ? x(ghost.from) : x(ghost.to)}
                            color={colorForDeltaGhostKind(ghost.kind, theme)}
                            fontScale={fontScale}
                            metricsScale={metricsScale}
                          />
                        ))}
                        {overflowCount > 0 && <DeltaGhostOverflow count={overflowCount} cx={phaseGhostAnchorX(t)} cy={y} fontScale={fontScale} />}
                      </>
                    );
                  })()}
              </g>
            );
          }
          if (t.type === "milestone") {
            if (resolveHidden(t, data)) return null;
            const cx = x(t.date);
            const shape = resolveMarkerShape(t, data, theme);
            const markerScale = resolveMarkerScale(t, data, theme);
            const r = 10 * markerScale;
            const effectiveFontScale = fontScale * resolveFontScale(t, data);
            const titlePos = resolveTitleLabelPosition(t);
            return (
              <g key={t.id} className={onTopLevelItemClick ? "cursor-pointer" : undefined} onClick={onTopLevelItemClick ? (e) => onTopLevelItemClick(t, e) : undefined}>
                <CushionMarker cx={cx} cy={y} r={r} shape={shape} fill={theme.statusColor[t.status]} stroke={theme.markerHalo} strokeWidth={2} />
                <text
                  x={titlePos === "left" ? cx - r - 6 : titlePos === "right" ? cx + r + 6 : cx}
                  y={titlePos === "top" ? y - r - 6 : titlePos === "bottom" ? y + r + 14 : titlePos === "inside" ? y + 3 : titlePos === "left" || titlePos === "right" ? y + 3 : y - 18}
                  textAnchor={titlePos === "left" ? "end" : titlePos === "right" ? "start" : "middle"}
                  fontSize={(titlePos === "inside" ? 8 : 11) * effectiveFontScale}
                  fontWeight={600}
                >
                  {t.title}
                </text>
                {/* Unified delta ghosts (t23) — this variant has no slip
                    support (no originalDate field), so only at-risk/
                    scenario-diff can ever appear. Same cross-item-tiered
                    treatment as the phase case above (t24): the labeled
                    ghost's tier comes from programBandGhostPlacement. */}
                {deltaAnnotationsEnabled &&
                  (() => {
                    const { placed, overflowCount } = programBandGhostPlacement.get(t.id) ?? { placed: [], overflowCount: 0 };
                    return (
                      <>
                        {placed.map((ghost) => (
                          <DeltaGhostMarker
                            key={`${ghost.kind}-${ghost.field}`}
                            ghost={ghost}
                            cx={cx}
                            cy={y}
                            ghostX={ghost.kind === "slip" ? x(ghost.from) : x(ghost.to)}
                            color={colorForDeltaGhostKind(ghost.kind, theme)}
                            fontScale={fontScale}
                            metricsScale={metricsScale}
                          />
                        ))}
                        {overflowCount > 0 && <DeltaGhostOverflow count={overflowCount} cx={cx} cy={y} fontScale={fontScale} />}
                      </>
                    );
                  })()}
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
                <path d={`M${cx - 6},${y - 8} L${cx + 6},${y - 8} L${cx},${y} Z`} fill={theme.accent} stroke={theme.markerHalo} strokeWidth={1} />
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
              {/* The wash and rail are inset by theme.laneGutter so bare
                  ground shows between lanes. Adjacent washes that touch read
                  as one continuous field with a hairline in it; a real gap
                  is what makes the lane change register. */}
              <rect
                x={MARGIN.left}
                y={y0 + theme.laneGutter}
                width={innerWidth}
                height={row.height - theme.laneGutter * 2}
                fill={tint}
                fillOpacity={theme.laneWashOpacity}
                style={placementMode?.laneId === row.swimlane.id ? { cursor: "crosshair" } : selectionModeEnabled ? { cursor: "crosshair" } : undefined}
                onPointerDown={placementMode?.laneId === row.swimlane.id ? (e) => beginCreateDrag(row.swimlane.id, e) : selectionModeEnabled ? beginMarquee : undefined}
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
              <rect x={MARGIN.left - RAIL_W} y={y0 + theme.laneGutter} width={RAIL_W} height={row.height - theme.laneGutter * 2} fill={tint} />
              <text fontSize={12.5 * fontScale} fontWeight={600} fill={theme.ink}>
                {laneNameLines.map((line, i) => (
                  <tspan
                    key={i}
                    x={16}
                    y={y0 + row.height / 2 + (i - (laneNameLines.length - 1) / 2 - (swimlaneOwnerVisible && row.swimlane.owner ? 0.5 : 0)) * 15 * fontScale}
                    dominantBaseline="middle"
                  >
                    {line}
                  </tspan>
                ))}
              </text>
              {/* Per-lane owner — a viewer-toggleable
                  second line under the lane name, same muted-caption
                  treatment as the header's owner line. */}
              {swimlaneOwnerVisible && row.swimlane.owner && (
                <text
                  x={16}
                  y={y0 + row.height / 2 + ((laneNameLines.length - 1) / 2 + 1) * 15 * fontScale}
                  fontSize={10 * fontScale}
                  fill={theme.inkMuted}
                >
                  {row.swimlane.owner}
                </text>
              )}
              {onAddMilestone && onPickShape && (
                <AddLanePicker x={MARGIN.left - RAIL_W - 20} y={y0 + 16} theme={theme} fontScale={fontScale} onPick={(shape) => onPickShape(row.swimlane.id, shape)} />
              )}
            </g>
          );
        })}

        {/* Today progress overlay — a second, denser
            reading of "what's elapsed" layered on top of the always-on
            Today reference line: a translucent wash from the plot's left
            edge up to today, plus a caret notch on the axis row itself.
            Painted after the lane washes/rails but before gridlines and
            markers, so it reads as ground-level context rather than
            competing with content. */}
        {todayOverlayEnabled && todayVisible && (
          <>
            <rect x={MARGIN.left} y={lanesTop} width={Math.max(0, xTs(todayTs) - MARGIN.left)} height={bodyHeight} fill={theme.todayColor} fillOpacity={0.05} />
            <path d={`M${xTs(todayTs) - 5},${chartTopMargin + axisHeight} L${xTs(todayTs) + 5},${chartTopMargin + axisHeight} L${xTs(todayTs)},${chartTopMargin + axisHeight - 8} Z`} fill={theme.todayColor} />
          </>
        )}

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
              // Lane-hide (t22) — a hidden-lane milestone's edges are filtered
              // out same as any other "don't draw this edge" case.
              return laneVisible(m.laneId) && (d.showConnector || traced || (showCriticalPath && m.isCriticalPath && from?.isCriticalPath));
            })
            .map((d) => {
              const from = milestoneById.get(d.id);
              if (!from) return null;
              // Lane-hide (t22) — the edge's source (dependency target) being
              // in a hidden lane also drops the edge, not just the target `m`.
              if (!laneVisible(from.laneId)) return null;
              const critical = showCriticalPath && m.isCriticalPath && from.isCriticalPath;
              const traced = !!tracedIds && tracedIds.has(m.id) && tracedIds.has(from.id);
              const x1 = x(from.date);
              const y1 = laneY(from.laneId);
              const x2 = x(m.date);
              const y2 = laneY(m.laneId);
              const midX = x1 + (x2 - x1) / 2;
              const path = buildConnectorPath(x1, y1, x2, y2, midX, connectorStyle);
              if (!critical) {
                // Critical wins the line where the two overlap; the trace
                // still lifts the markers, so a traced critical edge
                // doesn't lose which one it is. Dash/arrowhead choice
                // only applies to this plain treatment —
                // critical/traced connectors keep their own fixed look
                // below, same reasoning theme.criticalPathColor is never
                // overridable per-viewer.
                return (
                  <path
                    key={`${d.id}->${m.id}`}
                    data-testid={traced ? `traced-connector-${d.id}-${m.id}` : undefined}
                    d={path}
                    fill="none"
                    stroke={traced ? theme.traceColor : theme.connector}
                    strokeOpacity={traced ? 0.95 : 0.55}
                    strokeWidth={traced ? 2.5 : 1.25}
                    strokeDasharray={traced ? undefined : CONNECTOR_DASH_ARRAY[connectorDash]}
                    markerEnd={traced ? "url(#roadmap-arrow-trace)" : `url(#roadmap-arrow-connector-${connectorArrow})`}
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
          {/* Ordinary-connector arrowhead choice — three
              variants of the same fixed-size, userSpaceOnUse marker above,
              selected per viewer preference (use-connector-line-style.ts).
              Critical/trace connectors never use these — see the dash/arrow
              comment at the connector render call site. */}
          <marker id="roadmap-arrow-connector-standard" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,1.5 L9,5 L0,8.5 z" fill={theme.connector} opacity={0.55} />
          </marker>
          <marker id="roadmap-arrow-connector-open" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,1.5 L9,5 L0,8.5" fill="none" stroke={theme.connector} strokeWidth={1.5} opacity={0.55} />
          </marker>
          <marker id="roadmap-arrow-connector-circle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <circle cx="5" cy="5" r="3.2" fill={theme.connector} opacity={0.55} />
          </marker>
          {/* Duration-pill %-complete "hatch" style —
              diagonal-line pattern applied to the completed portion of a
              pill instead of a flat fill/bar, see use-pill-progress-style.ts. */}
          <pattern id="pill-hatch" width={5} height={5} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width={5} height={5} fill="#ffffff" fillOpacity={0.85} />
            <line x1={0} y1={0} x2={0} y2={5} stroke={theme.ink} strokeOpacity={0.55} strokeWidth={2} />
          </pattern>
        </defs>

        {/* in-lane duration pills — milestones with endDate set (wayframe#15), colored with the lane's header shade rather than status since they're a lane-scoped span, not a status marker */}
        {data.milestones
          .filter((m) => m.endDate && laneVisible(m.laneId))
          .map((m) => {
            const pillHeightSm = PILL_HEIGHT_SM * boxScale;
            const pillDragging = drag?.id === m.id;
            const pillDx = pillDragging ? drag.dx : 0;
            const px = x(m.date);
            const w = Math.max(pillHeightSm, x(m.endDate!) - px);
            // Sub-row offset (stack-intervals.ts) — 0 for
            // every lane that isn't stacking overlapping pills.
            const cy = laneY(m.laneId) + pillSubRowOffset(m.laneId, m.id);
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
            // %-complete visualization — only draws
            // anything when a style is chosen and the milestone actually
            // carries a percentComplete; a pill with no progress tracked
            // renders exactly as before.
            const pct = m.percentComplete;
            const completeW = pct !== undefined ? Math.max(0, Math.min(w, (w * pct) / 100)) : 0;
            return (
              <g
                key={m.id}
                data-testid={`pill-${m.id}`}
                className={onMilestoneClick || onMilestoneDateRangeChange ? "cursor-pointer" : undefined}
                opacity={traceState === "out" ? 0.22 : pillDragging ? 0.85 : 1}
                transform={pillDx ? `translate(${pillDx} 0)` : undefined}
                onClick={onMilestoneClick ? (e) => onMilestoneClick(m, e) : undefined}
                onPointerDown={onMilestoneDateRangeChange ? (e) => beginDrag(m, e) : undefined}
              >
                <rect x={px} y={cy - pillHeightSm / 2} width={w} height={pillHeightSm} rx={pillHeightSm / 2} fill={fill} />
                {pillProgressStyle === "fill" && pct !== undefined && (
                  <rect x={px} y={cy - pillHeightSm / 2} width={completeW} height={pillHeightSm} rx={pillHeightSm / 2} fill={lighten(fill, 0.35)} />
                )}
                {pillProgressStyle === "hatch" && pct !== undefined && (
                  <rect x={px} y={cy - pillHeightSm / 2} width={completeW} height={pillHeightSm} rx={pillHeightSm / 2} fill="url(#pill-hatch)" fillOpacity={0.5} />
                )}
                {pillProgressStyle === "bar" && pct !== undefined && (
                  <>
                    <rect x={px} y={cy + pillHeightSm / 2 + 2} width={w} height={3} rx={1.5} fill={theme.rowDivider} />
                    <rect x={px} y={cy + pillHeightSm / 2 + 2} width={completeW} height={3} rx={1.5} fill={theme.accent} />
                  </>
                )}
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
                {/* Unified delta ghosts (t23) on a duration pill — a pill only
                    ever gets an at-risk ghost today (projects endDate
                    forward; the start is already underway), so no cross-item
                    collision is needed here, same as before. Fixed offset:
                    pills already sit outside the point-marker tiered-label
                    system above. */}
                {deltaAnnotationsEnabled &&
                  layoutItemGhosts(ghostsForMilestone(m)).placed.map((ghost) => (
                    <DeltaGhostMarker
                      key={`${ghost.kind}-${ghost.field}`}
                      ghost={ghost}
                      cx={px + w}
                      cy={cy}
                      ghostX={ghost.kind === "slip" ? x(ghost.from) : x(ghost.to)}
                      color={colorForDeltaGhostKind(ghost.kind, theme)}
                      fontScale={fontScale}
                      metricsScale={metricsScale}
                    />
                  ))}
              </g>
            );
          })}

        {/* milestones on top of connectors — point-in-time only; endDate milestones render as duration pills above instead */}
        {data.milestones
          .filter((m) => !m.endDate && !resolveHidden(m, data) && laneVisible(m.laneId) && !(m.categoryId && isCategoryHidden?.(m.categoryId)))
          .map((m) => (
            <MilestoneMarker
              key={m.id}
              m={m}
              cx={x(m.date)}
              cy={laneY(m.laneId)}
              theme={theme}
              program={data}
              primary={primaryPlacement.get(m.id) ?? null}
              date={datePlacement.get(m.id) ?? { text: formatDateShort(m.date), tier: 0 }}
              onClick={selectionModeEnabled ? (mm) => onToggleSelect?.(mm.id) : onMilestoneClick}
              selected={selectedIds?.has(m.id)}
              remoteColor={remoteSelections?.[m.id]}
              deltaGhosts={deltaGhostPlacement.get(m.id)?.placed ?? []}
              deltaGhostOverflow={deltaGhostPlacement.get(m.id)?.overflowCount ?? 0}
              resolveX={x}
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
              category={legendCategoryFillEnabled && m.categoryId ? categoryById.get(m.categoryId) : undefined}
              dateLabelPlacement={dateLabelPlacement}
            />
          ))}

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
            color={theme.annotationColor}
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
            color={theme.todayColor}
            dash="3 3"
            topMarker
            fontScale={fontScale}
            metricsScale={metricsScale}
            onDragStart={(evt) => beginLabelDrag("today", evt)}
            {...placementFor("today", refPlacements.get("today"))}
          />
        )}

        {/* Rubber-band marquee (mass-edit) — live
            preview rect while dragging; selection itself commits on
            pointer-up (endMarquee above). */}
        {marquee && (
          <rect
            x={Math.min(marquee.startX, marquee.curX)}
            y={Math.min(marquee.startY, marquee.curY)}
            width={Math.abs(marquee.curX - marquee.startX)}
            height={Math.abs(marquee.curY - marquee.startY)}
            fill={theme.accent}
            fillOpacity={0.1}
            stroke={theme.accent}
            strokeDasharray="3 2"
          />
        )}
      </svg>
    </div>
  );
}
