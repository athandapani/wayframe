// PROTOTYPE — Variant B: D3 owns the math (scaleTime for dates, scaleBand for
// lanes, linkHorizontal for connector curves), React still owns every DOM
// node — no d3-selection, no imperative DOM writes. Tests: "does D3-for-math
// pull its weight over hand-rolled linear interpolation?"
"use client";

import { scaleTime, scaleBand } from "d3-scale";
import { linkHorizontal } from "d3-shape";
import { swimlanes, topLevelItems, milestones, type Milestone } from "./demo-data";
import { STATUS_COLOR, CRITICAL_PATH_COLOR, parseDate } from "./status-colors";

const MARGIN = { top: 20, right: 40, bottom: 20, left: 220 };
const LANE_HEIGHT = 90;
const TOP_BAND_HEIGHT = 90;
const AXIS_HEIGHT = 30;
const WIDTH = 1500;

const lanes = swimlanes.filter((l) => l.type === "lane").sort((a, b) => a.order - b.order);

const allDates = [
  ...milestones.map((m) => m.date),
  ...topLevelItems.map((t) => ("date" in t ? t.date : t.endDate)),
  ...topLevelItems.map((t) => ("startDate" in t ? t.startDate : t.date)),
];
const domainMin = new Date(Math.min(...allDates.map(parseDate)) - 14 * 86400000);
const domainMax = new Date(Math.max(...allDates.map(parseDate)) + 14 * 86400000);

const topBandY = MARGIN.top + AXIS_HEIGHT;
const lanesTop = topBandY + TOP_BAND_HEIGHT;

const xScale = scaleTime().domain([domainMin, domainMax]).range([MARGIN.left, WIDTH - MARGIN.right]);
const yScale = scaleBand<string>()
  .domain(lanes.map((l) => l.id))
  .range([lanesTop, lanesTop + lanes.length * LANE_HEIGHT])
  .paddingInner(0);

const height = lanesTop + lanes.length * LANE_HEIGHT + MARGIN.bottom;
const laneCenter = (laneId: string) => (yScale(laneId) ?? 0) + yScale.bandwidth() / 2;

const link = linkHorizontal<
  { source: { x: number; y: number }; target: { x: number; y: number } },
  { x: number; y: number }
>()
  .x((d) => d.x)
  .y((d) => d.y);

const milestoneById = new Map(milestones.map((m) => [m.id, m]));

function Diamond({ m }: { m: Milestone }) {
  const cx = xScale(new Date(m.date + "T00:00:00Z"));
  const cy = laneCenter(m.laneId);
  const r = 9;
  const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  return (
    <g>
      <polygon
        points={points}
        fill={STATUS_COLOR[m.status]}
        stroke={m.isCriticalPath ? CRITICAL_PATH_COLOR : "#ffffff"}
        strokeWidth={m.isCriticalPath ? 3 : 1.5}
      />
      {/* NOTE: not using <title> here — React 19 hoists it to <head> as
          document metadata even inside <svg>, causing an SSR/client mismatch. */}
      <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize={11} fill="currentColor">
        {m.title}
      </text>
    </g>
  );
}

export default function VariantB() {
  const ticks = xScale.ticks(10);
  const tickFormat = xScale.tickFormat(10, "%b %y");

  return (
    <div className="overflow-x-auto">
      <svg width={WIDTH} height={height} className="text-zinc-800 dark:text-zinc-200">
        {/* axis: real D3 ticks, not hand-picked months */}
        {ticks.map((t) => (
          <g key={t.getTime()}>
            <line x1={xScale(t)} x2={xScale(t)} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke="currentColor" strokeOpacity={0.08} />
            <text x={xScale(t)} y={MARGIN.top + 14} fontSize={11} fill="currentColor" opacity={0.6}>
              {tickFormat(t)}
            </text>
          </g>
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
                <rect x={x1} y={y - 12} width={Math.max(2, x2 - x1)} height={24} rx={6} fill={STATUS_COLOR[t.status]} fillOpacity={0.35} stroke={STATUS_COLOR[t.status]} />
                <text x={x1 + 6} y={y + 4} fontSize={11} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          if (t.type === "milestone") {
            const cx = xScale(new Date(t.date + "T00:00:00Z"));
            return (
              <g key={t.id}>
                <polygon points={`${cx},${y - 11} ${cx + 11},${y} ${cx},${y + 11} ${cx - 11},${y}`} fill={STATUS_COLOR[t.status]} stroke="#fff" strokeWidth={2} />
                <text x={cx} y={y - 16} textAnchor="middle" fontSize={11} fontWeight={600}>
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

        {/* lane bands via scaleBand */}
        {lanes.map((l, i) => (
          <g key={l.id}>
            <rect x={MARGIN.left} y={yScale(l.id)} width={WIDTH - MARGIN.left - MARGIN.right} height={yScale.bandwidth()} fill="currentColor" fillOpacity={i % 2 === 0 ? 0.03 : 0} />
            <text x={8} y={laneCenter(l.id)} fontSize={12} fontWeight={600} dominantBaseline="middle">
              {l.name}
            </text>
          </g>
        ))}

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
                  stroke={critical ? CRITICAL_PATH_COLOR : "currentColor"}
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
          <Diamond key={m.id} m={m} />
        ))}
      </svg>
    </div>
  );
}
