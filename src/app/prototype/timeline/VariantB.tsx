// PROTOTYPE — Variant B: D3 owns the math (scaleTime for dates, scaleBand for
// lanes, linkHorizontal for connector curves), React still owns every DOM
// node — no d3-selection, no imperative DOM writes. Tests: "does D3-for-math
// pull its weight over hand-rolled linear interpolation?"
"use client";

import { scaleTime, scaleBand } from "d3-scale";
import { linkHorizontal } from "d3-shape";
import { swimlanes, topLevelItems, milestones, type Milestone } from "./demo-data";
import { parseDate } from "./status-colors";
import type { Theme } from "./theme";
import { yearSegments, segmentsForTier, tierRowCount, type AxisTierConfig, type Segment } from "./axis-tiers";

const MARGIN = { top: 20, right: 40, bottom: 20, left: 220 };
const LANE_HEIGHT = 90;
const TOP_BAND_HEIGHT = 90;
const AXIS_ROW_HEIGHT = 22;
const WIDTH = 1500;

const lanes = swimlanes.filter((l) => l.type === "lane").sort((a, b) => a.order - b.order);

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

const link = linkHorizontal<
  { source: { x: number; y: number }; target: { x: number; y: number } },
  { x: number; y: number }
>()
  .x((d) => d.x)
  .y((d) => d.y);

const milestoneById = new Map(milestones.map((m) => [m.id, m]));
const TODAY_TS = parseDate("2026-08-01");

// solid colored band per tier row (inspired by Office Timeline's swimlane
// templates: a bold colored axis bar reads far more "designed" than plain
// gridlines with small labels).
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

// rotated rounded-square = softened "cushion" diamond, à la Office Timeline's
// milestone markers (an 8-point rounded diamond, not a sharp 4-point one).
function CushionMarker({ cx, cy, r, fill, stroke, strokeWidth }: { cx: number; cy: number; r: number; fill: string; stroke: string; strokeWidth: number }) {
  return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} transform={`rotate(45 ${cx} ${cy})`} />;
}

function Diamond({ m, cx, cy, theme }: { m: Milestone; cx: number; cy: number; theme: Theme }) {
  const r = 8;
  return (
    <g>
      <CushionMarker cx={cx} cy={cy} r={r} fill={theme.statusColor[m.status]} stroke={m.isCriticalPath ? theme.criticalPathColor : "#ffffff"} strokeWidth={m.isCriticalPath ? 3 : 1.5} />
      <text x={cx} y={cy - r - 7} textAnchor="middle" fontSize={11} fill="currentColor">
        {m.title}
      </text>
    </g>
  );
}

function TodayMarker({ topY, bottomY }: { topY: number; bottomY: number }) {
  if (TODAY_TS < domainMinTs || TODAY_TS > domainMaxTs) return null;
  const tx = xOf(TODAY_TS);
  return (
    <g>
      <line x1={tx} x2={tx} y1={topY} y2={bottomY} stroke="#e11d48" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.8} />
      <path d={`M${tx - 5},${topY} L${tx + 5},${topY} L${tx + 5},${topY + 12} L${tx},${topY + 17} L${tx - 5},${topY + 12} Z`} fill="#e11d48" />
      <text x={tx + 9} y={topY + 12} fontSize={10} fontWeight={700} fill="#e11d48">
        Today
      </text>
    </g>
  );
}

export default function VariantB({ theme, axisTiers }: { theme: Theme; axisTiers: AxisTierConfig }) {
  const axisHeight = AXIS_ROW_HEIGHT * tierRowCount(axisTiers);
  const topBandY = MARGIN.top + axisHeight;
  const lanesTop = topBandY + TOP_BAND_HEIGHT;

  const yScale = scaleBand<string>()
    .domain(lanes.map((l) => l.id))
    .range([lanesTop, lanesTop + lanes.length * LANE_HEIGHT])
    .paddingInner(0);
  const laneCenter = (laneId: string) => (yScale(laneId) ?? 0) + yScale.bandwidth() / 2;

  const height = lanesTop + lanes.length * LANE_HEIGHT + MARGIN.bottom;

  const rows: { segments: Segment[]; opacity: number }[] = [{ segments: yearSegments(domainMinTs, domainMaxTs), opacity: 1 }];
  if (axisTiers.tier2 !== "none") rows.push({ segments: segmentsForTier(axisTiers.tier2, domainMinTs, domainMaxTs), opacity: 0.8 });
  if (axisTiers.tier3 !== "none") rows.push({ segments: segmentsForTier(axisTiers.tier3, domainMinTs, domainMaxTs), opacity: 0.6 });

  return (
    <div className="overflow-x-auto">
      <svg width={WIDTH} height={height} className="text-zinc-800 dark:text-zinc-200" style={{ fontFamily: theme.font }}>
        {rows.map((row, i) => (
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
            const x1 = xScale(new Date(t.startDate + "T00:00:00Z"));
            const x2 = xScale(new Date(t.endDate + "T00:00:00Z"));
            return (
              <g key={t.id}>
                <rect x={x1} y={y - 12} width={Math.max(24, x2 - x1)} height={24} rx={12} fill={theme.statusColor[t.status]} fillOpacity={0.35} stroke={theme.statusColor[t.status]} />
                <text x={x1 + 12} y={y + 4} fontSize={11} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          if (t.type === "milestone") {
            const cx = xScale(new Date(t.date + "T00:00:00Z"));
            return (
              <g key={t.id}>
                <CushionMarker cx={cx} cy={y} r={10} fill={theme.statusColor[t.status]} stroke="#fff" strokeWidth={2} />
                <text x={cx} y={y - 18} textAnchor="middle" fontSize={11} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          const cx = xScale(new Date(t.date + "T00:00:00Z"));
          return (
            <g key={t.id}>
              <line x1={cx} x2={cx} y1={y - 20} y2={height - MARGIN.bottom} stroke="#a855f7" strokeDasharray="4 3" />
              <text x={cx + 4} y={y - 22} fontSize={10} fill="#a855f7">
                {t.title}
              </text>
            </g>
          );
        })}

        {/* lane bands via scaleBand — subtle per-lane tint */}
        {lanes.map((l, i) => {
          const tint = theme.laneTint[i % theme.laneTint.length];
          return (
            <g key={l.id}>
              <rect x={MARGIN.left} y={yScale(l.id)} width={WIDTH - MARGIN.left - MARGIN.right} height={yScale.bandwidth()} fill={tint} fillOpacity={0.07} />
              <text x={8} y={laneCenter(l.id)} fontSize={12} fontWeight={600} dominantBaseline="middle" fill={tint}>
                {l.name}
              </text>
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
                source: { x: xScale(new Date(from.date + "T00:00:00Z")), y: laneCenter(from.laneId) },
                target: { x: xScale(new Date(m.date + "T00:00:00Z")), y: laneCenter(m.laneId) },
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
          <Diamond key={m.id} m={m} cx={xScale(new Date(m.date + "T00:00:00Z"))} cy={laneCenter(m.laneId)} theme={theme} />
        ))}

        <TodayMarker topY={topBandY} bottomY={height - MARGIN.bottom} />
      </svg>
    </div>
  );
}
