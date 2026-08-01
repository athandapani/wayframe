// PROTOTYPE — Variant B: D3 owns the date math (scaleTime) and connector
// curves (linkHorizontal); React still owns every DOM node — no
// d3-selection, no imperative DOM writes. Row/lane positioning is manual
// (scaleBand assumes uniform band sizes, which breaks once separators give
// rows variable heights) — same row math as Variant A. Tests: "does
// D3-for-math pull its weight over hand-rolled linear interpolation?"
"use client";

import { scaleTime } from "d3-scale";
import { linkHorizontal } from "d3-shape";
import { swimlanes, topLevelItems, milestones, lanePills, type Milestone, type Swimlane } from "./demo-data";
import { parseDate } from "./status-colors";
import { darken } from "./color-utils";
import { PRIMARY_TIER_DY, DATE_TIER_DY, formatDateShort, formatDateCompact, layoutPrimaryLabels, layoutDateLabels } from "./label-layout";
import type { Theme } from "./theme";
import { yearSegments, segmentsForTier, tierRowCount, type AxisTierConfig, type Segment } from "./axis-tiers";

const MARGIN = { top: 20, right: 40, bottom: 20, left: 220 };
const LANE_HEIGHT = 90;
const SEPARATOR_HEIGHT = 30;
const TOP_BAND_HEIGHT = 90;
const AXIS_ROW_HEIGHT = 22;
const WIDTH = 1500;
const PILL_HEIGHT_LG = 20;
const PILL_HEIGHT_SM = 14;

interface RowInfo {
  swimlane: Swimlane;
  relY: number;
  height: number;
  laneIndex: number;
}

const rows: RowInfo[] = (() => {
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
})();
const bodyHeight = rows.reduce((sum, r) => sum + r.height, 0);
const rowById = new Map(rows.map((r) => [r.swimlane.id, r]));

const allDates = [
  ...milestones.map((m) => m.date),
  ...topLevelItems.map((t) => ("date" in t ? t.date : t.endDate)),
  ...topLevelItems.map((t) => ("startDate" in t ? t.startDate : t.date)),
];
const domainMinTs = Math.min(...allDates.map(parseDate)) - 14 * 86400000;
const domainMaxTs = Math.max(...allDates.map(parseDate)) + 14 * 86400000;
const domainMin = new Date(domainMinTs);
const domainMax = new Date(domainMaxTs);

const xScale = scaleTime().domain([domainMin, domainMax]).range([MARGIN.left, WIDTH - MARGIN.right]);
const xOf = (ts: number) => xScale(new Date(ts));
const xOfDate = (dateStr: string) => xScale(new Date(dateStr + "T00:00:00Z"));

const link = linkHorizontal<
  { source: { x: number; y: number }; target: { x: number; y: number } },
  { x: number; y: number }
>()
  .x((d) => d.x)
  .y((d) => d.y);

const milestoneById = new Map(milestones.map((m) => [m.id, m]));
const TODAY_TS = parseDate("2026-08-01");

const primaryPlacement = new Map<string, { text: string; tier: 0 | 1 | 2 }>();
const datePlacement = new Map<string, { text: string; tier: 0 | 1 | 2 }>();
for (const laneRow of rows.filter((r) => r.swimlane.type === "lane")) {
  const laneMilestones = milestones.filter((m) => m.laneId === laneRow.swimlane.id);
  const primary = layoutPrimaryLabels(laneMilestones.map((m) => ({ id: m.id, x: xOfDate(m.date), text: m.shortLabel })));
  const dates = layoutDateLabels(laneMilestones.map((m) => ({ id: m.id, x: xOfDate(m.date), full: formatDateShort(m.date), compact: formatDateCompact(m.date) })));
  for (const [k, v] of primary) primaryPlacement.set(k, v);
  for (const [k, v] of dates) datePlacement.set(k, v);
}

function AxisRow({ y, segments, theme, opacity }: { y: number; segments: Segment[]; theme: Theme; opacity: number }) {
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

function CushionMarker({ cx, cy, r, fill, stroke, strokeWidth }: { cx: number; cy: number; r: number; fill: string; stroke: string; strokeWidth: number }) {
  return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} transform={`rotate(45 ${cx} ${cy})`} />;
}

function MilestoneMarker({ m, cx, cy, theme }: { m: Milestone; cx: number; cy: number; theme: Theme }) {
  const r = 8;
  const primary = primaryPlacement.get(m.id) ?? { text: m.shortLabel, tier: 0 as const };
  const date = datePlacement.get(m.id) ?? { text: formatDateShort(m.date), tier: 0 as const };
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
      <g className="pointer-events-none opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        <rect x={cx - tooltipW / 2} y={cy - 58} width={tooltipW} height={20} rx={4} fill="#18181b" />
        <text x={cx} y={cy - 44} textAnchor="middle" fontSize={11} fill="#ffffff">
          {m.title}
        </text>
      </g>
    </g>
  );
}

function ReferenceLine({ x: tx, topY, bottomY, label, color, dash }: { x: number; topY: number; bottomY: number; label: string; color: string; dash: string }) {
  return (
    <g>
      <line x1={tx} x2={tx} y1={topY} y2={bottomY} stroke={color} strokeWidth={1.25} strokeDasharray={dash} opacity={0.7} />
      <text x={tx + 4} y={topY - 4} fontSize={9} fontWeight={700} fill={color}>
        {label}
      </text>
    </g>
  );
}

export default function VariantB({ theme, axisTiers }: { theme: Theme; axisTiers: AxisTierConfig }) {
  const axisHeight = AXIS_ROW_HEIGHT * tierRowCount(axisTiers);
  const topBandY = MARGIN.top + axisHeight;
  const lanesTop = topBandY + TOP_BAND_HEIGHT;
  const height = lanesTop + bodyHeight + MARGIN.bottom;

  function laneY(laneId: string): number {
    const row = rowById.get(laneId)!;
    return lanesTop + row.relY + row.height / 2;
  }
  function laneTint(laneId: string): string {
    const row = rowById.get(laneId)!;
    return theme.laneTint[row.laneIndex % theme.laneTint.length];
  }

  const axisRows: { segments: Segment[]; opacity: number }[] = [{ segments: yearSegments(domainMinTs, domainMaxTs), opacity: 1 }];
  if (axisTiers.tier2 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier2, domainMinTs, domainMaxTs), opacity: 0.8 });
  if (axisTiers.tier3 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier3, domainMinTs, domainMaxTs), opacity: 0.6 });

  return (
    <div className="overflow-x-auto">
      <svg width={WIDTH} height={height} className="text-zinc-800 dark:text-zinc-200" style={{ fontFamily: theme.font }}>
        {axisRows.map((row, i) => (
          <AxisRow key={i} y={MARGIN.top + i * AXIS_ROW_HEIGHT} segments={row.segments} theme={theme} opacity={row.opacity} />
        ))}
        <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={topBandY} y2={topBandY} stroke="currentColor" strokeOpacity={0.15} />

        {/* top-level band */}
        <text x={8} y={topBandY + 16} fontSize={11} fontWeight={600} opacity={0.5}>
          PROGRAM
        </text>
        {topLevelItems.map((t) => {
          const y = topBandY + TOP_BAND_HEIGHT / 2;
          if (t.type === "phase") {
            const x1 = xOfDate(t.startDate);
            const x2 = xOfDate(t.endDate);
            const h = PILL_HEIGHT_LG;
            return (
              <g key={t.id}>
                <rect x={x1} y={y - h / 2} width={Math.max(h, x2 - x1)} height={h} rx={h / 2} fill={theme.statusColor[t.status]} fillOpacity={0.35} stroke={theme.statusColor[t.status]} />
                <text x={x1 + h / 2} y={y + 4} fontSize={11} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          if (t.type === "milestone") {
            const cx = xOfDate(t.date);
            return (
              <g key={t.id}>
                <CushionMarker cx={cx} cy={y} r={10} fill={theme.statusColor[t.status]} stroke="#fff" strokeWidth={2} />
                <text x={cx} y={y - 18} textAnchor="middle" fontSize={11} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          const cx = xOfDate(t.date);
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
                <rect x={0} y={y0} width={WIDTH} height={row.height} fill={theme.axisBg} />
                <text x={8} y={y0 + row.height / 2} fontSize={12} fontWeight={700} fill="#ffffff" dominantBaseline="middle">
                  {row.swimlane.name}
                </text>
              </g>
            );
          }
          const tint = theme.laneTint[row.laneIndex % theme.laneTint.length];
          return (
            <g key={row.swimlane.id}>
              <rect x={MARGIN.left} y={y0} width={WIDTH - MARGIN.left - MARGIN.right} height={row.height} fill={tint} fillOpacity={0.07} />
              <rect x={0} y={y0} width={MARGIN.left} height={row.height} fill={darken(tint, 0.4)} />
              <text x={8} y={y0 + row.height / 2} fontSize={12} fontWeight={700} fill="#ffffff" dominantBaseline="middle">
                {row.swimlane.name}
              </text>
            </g>
          );
        })}

        {/* in-lane pills — smaller than top-band pills, colored with the lane's header shade */}
        {lanePills.map((p) => {
          const px = xOfDate(p.startDate);
          const w = Math.max(PILL_HEIGHT_SM, xOfDate(p.endDate) - px);
          const cy = laneY(p.laneId);
          const fill = darken(laneTint(p.laneId), 0.4);
          return (
            <g key={p.id}>
              <rect x={px} y={cy - PILL_HEIGHT_SM / 2} width={w} height={PILL_HEIGHT_SM} rx={PILL_HEIGHT_SM / 2} fill={fill} />
              {w > 60 && (
                <text x={px + PILL_HEIGHT_SM / 2} y={cy + 3} fontSize={9} fill="#ffffff">
                  {p.title}
                </text>
              )}
            </g>
          );
        })}

        {/* dependency connectors — D3 linkHorizontal bezier curves, not straight lines */}
        {milestones.flatMap((m) =>
          m.dependsOn
            .filter((d) => d.showConnector)
            .map((d) => {
              const from = milestoneById.get(d.id);
              if (!from) return null;
              const critical = m.isCriticalPath && from.isCriticalPath;
              const path = link({
                source: { x: xOfDate(from.date), y: laneY(from.laneId) },
                target: { x: xOfDate(m.date), y: laneY(m.laneId) },
              });
              return (
                <path
                  key={`${d.id}->${m.id}`}
                  d={path ?? undefined}
                  fill="none"
                  stroke={critical ? theme.criticalPathColor : "currentColor"}
                  strokeOpacity={critical ? 0.9 : 0.35}
                  strokeWidth={critical ? 2.5 : 1.25}
                  markerEnd="url(#arrow-b)"
                />
              );
            }),
        )}

        <defs>
          <marker id="arrow-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" opacity={0.5} />
          </marker>
        </defs>

        {milestones.map((m) => (
          <MilestoneMarker key={m.id} m={m} cx={xOfDate(m.date)} cy={laneY(m.laneId)} theme={theme} />
        ))}

        {topLevelItems
          .filter((t): t is Extract<typeof t, { type: "milestone" }> => t.type === "milestone" && t.showReferenceLine === true)
          .map((t) => (
            <ReferenceLine key={t.id} x={xOfDate(t.date)} topY={topBandY} bottomY={height - MARGIN.bottom} label={t.title} color={theme.statusColor[t.status]} dash="2 2" />
          ))}
        {TODAY_TS >= domainMinTs && TODAY_TS <= domainMaxTs && (
          <ReferenceLine x={xOf(TODAY_TS)} topY={topBandY} bottomY={height - MARGIN.bottom} label="Today" color="#e11d48" dash="3 3" />
        )}
      </svg>
    </div>
  );
}
