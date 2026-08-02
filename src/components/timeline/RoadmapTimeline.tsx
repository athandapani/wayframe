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

import type { RoadmapData, Swimlane, Milestone, TopLevelItem } from "./types";
import type { Theme } from "./theme";
import { defaultTheme } from "./theme";
import { darken } from "./color-utils";
import { parseDate, formatDateShort, formatDateCompact } from "./date-utils";
import { deriveShortLabel } from "./short-label";
import { PRIMARY_TIER_DY, DATE_TIER_DY, layoutPrimaryLabels, layoutDateLabels } from "./label-layout";
import { yearSegments, segmentsForTier, tierRowCount, AXIS_PRESETS, type AxisTierConfig, type Segment } from "./axis-tiers";

const MARGIN = { top: 20, right: 40, bottom: 20, left: 220 };
const LANE_HEIGHT = 90;
const SEPARATOR_HEIGHT = 30;
const TOP_BAND_HEIGHT = 90;
const AXIS_ROW_HEIGHT = 22;
const PILL_HEIGHT_LG = 20;
const PILL_HEIGHT_SM = 14; // in-lane duration pills (wayframe#15)

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
          <line x1={xOf(s.start)} x2={xOf(s.start)} y1={y} y2={y + AXIS_ROW_HEIGHT} stroke="#ffffff" strokeOpacity={0.25} />
          <text x={(xOf(s.start) + xOf(s.end)) / 2} y={y + AXIS_ROW_HEIGHT - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff">
            {s.label}
          </text>
        </g>
      ))}
    </>
  );
}

// rotated rounded-square = softened "cushion" diamond
function CushionMarker({ cx, cy, r, fill, stroke, strokeWidth }: { cx: number; cy: number; r: number; fill: string; stroke: string; strokeWidth: number }) {
  return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} transform={`rotate(45 ${cx} ${cy})`} />;
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

function MilestoneMarker({
  m,
  cx,
  cy,
  theme,
  primary,
  date,
}: {
  m: Milestone;
  cx: number;
  cy: number;
  theme: Theme;
  primary: { text: string; tier: 0 | 1 | 2 };
  date: { text: string; tier: 0 | 1 | 2 };
}) {
  const r = 8;
  const primaryDy = PRIMARY_TIER_DY[primary.tier];
  const dateDy = DATE_TIER_DY[date.tier];
  const tooltipW = Math.max(40, m.title.length * 6 + 16);

  return (
    <g className="group cursor-default">
      {primary.tier === 2 && <line x1={cx} y1={cy - r - 1} x2={cx} y2={cy + primaryDy + 4} stroke="currentColor" strokeOpacity={0.3} />}
      {date.tier === 2 && <line x1={cx} y1={cy + r + 1} x2={cx} y2={cy + dateDy - 4} stroke="currentColor" strokeOpacity={0.3} />}
      <CushionMarker cx={cx} cy={cy} r={r} fill={theme.statusColor[m.status]} stroke={m.isCriticalPath ? theme.criticalPathColor : "#ffffff"} strokeWidth={m.isCriticalPath ? 3 : 1.5} />
      <text x={cx} y={cy + primaryDy} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor">
        {primary.text}
      </text>
      <text x={cx} y={cy + dateDy} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.6}>
        {date.text}
      </text>
      {/* hover reveal: full title. CSS-only (no JS state) — a real <title>
          element gets hoisted by React 19 as document metadata even inside
          <svg>, which desyncs SSR/client, so this is the workaround. */}
      <g className="pointer-events-none opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        <rect x={cx - tooltipW / 2} y={cy - 58} width={tooltipW} height={20} rx={4} fill="#18181b" />
        <text x={cx} y={cy - 44} textAnchor="middle" fontSize={11} fill="#ffffff">
          {m.title}
        </text>
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
}

export function RoadmapTimeline({ data, theme = defaultTheme, axisTiers = AXIS_PRESETS[1], width = 1500, today = new Date() }: RoadmapTimelineProps) {
  const rows = computeRows(data.swimlanes);
  const bodyHeight = rows.reduce((sum, r) => sum + r.height, 0);
  const rowById = new Map(rows.map((r) => [r.swimlane.id, r]));
  const milestoneById = new Map(data.milestones.map((m) => [m.id, m]));
  function laneTint(laneId: string): string {
    const row = rowById.get(laneId);
    return theme.laneTint[(row?.laneIndex ?? 0) % theme.laneTint.length];
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

  const axisRows: { segments: Segment[]; opacity: number }[] = [{ segments: yearSegments(domainMin, domainMax), opacity: 1 }];
  if (axisTiers.tier2 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier2, domainMin, domainMax), opacity: 0.8 });
  if (axisTiers.tier3 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier3, domainMin, domainMax), opacity: 0.6 });

  return (
    <div className="overflow-x-auto" data-testid="roadmap-timeline">
      <svg width={width} height={height} className="text-zinc-800 dark:text-zinc-200" style={{ fontFamily: theme.font }}>
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
            return (
              <g key={t.id}>
                <rect
                  x={px}
                  y={y - h / 2}
                  width={Math.max(h, x(t.endDate) - px)}
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
              <g key={t.id}>
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
                <text x={8} y={y0 + row.height / 2} fontSize={12} fontWeight={700} fill="#ffffff" dominantBaseline="middle">
                  {row.swimlane.name}
                </text>
              </g>
            );
          }
          const tint = theme.laneTint[row.laneIndex % theme.laneTint.length];
          return (
            <g key={row.swimlane.id}>
              <rect x={MARGIN.left} y={y0} width={innerWidth} height={row.height} fill={tint} fillOpacity={0.07} />
              <rect x={0} y={y0} width={MARGIN.left} height={row.height} fill={darken(tint, 0.4)} />
              <text x={8} y={y0 + row.height / 2} fontSize={12} fontWeight={700} fill="#ffffff" dominantBaseline="middle">
                {row.swimlane.name}
              </text>
            </g>
          );
        })}

        {/* dependency connectors — orthogonal "elbow" steps */}
        {data.milestones.flatMap((m) =>
          m.dependsOn
            .filter((d) => d.showConnector)
            .map((d) => {
              const from = milestoneById.get(d.id);
              if (!from) return null;
              const critical = m.isCriticalPath && from.isCriticalPath;
              const x1 = x(from.date);
              const y1 = laneY(from.laneId);
              const x2 = x(m.date);
              const y2 = laneY(m.laneId);
              const midX = x1 + (x2 - x1) / 2;
              return (
                <path
                  key={`${d.id}->${m.id}`}
                  d={`M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`}
                  fill="none"
                  stroke={critical ? theme.criticalPathColor : "currentColor"}
                  strokeOpacity={critical ? 0.9 : 0.35}
                  strokeWidth={critical ? 2.5 : 1.25}
                  markerEnd="url(#roadmap-timeline-arrow)"
                />
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
              <g key={m.id}>
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
