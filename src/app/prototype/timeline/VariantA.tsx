// PROTOTYPE — Variant A: hand-rolled SVG, no layout library.
// Manual linear interpolation for the date scale, manual lane-index math for
// the y axis, straight-line connectors. Tests: "can we skip D3 entirely?"
"use client";

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
const minDate = parseDate(allDates.reduce((a, b) => (a < b ? a : b)));
const maxDate = parseDate(allDates.reduce((a, b) => (a > b ? a : b)));
const PAD_DAYS = 14 * 86400000;
const domainMin = minDate - PAD_DAYS;
const domainMax = maxDate + PAD_DAYS;

const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
function x(dateStr: string): number {
  const t = parseDate(dateStr);
  return MARGIN.left + ((t - domainMin) / (domainMax - domainMin)) * innerWidth;
}
function xTs(ts: number): number {
  return MARGIN.left + ((ts - domainMin) / (domainMax - domainMin)) * innerWidth;
}

const milestoneById = new Map(milestones.map((m) => [m.id, m]));

function AxisRow({ y, segments, bold, opacity }: { y: number; segments: Segment[]; bold?: boolean; opacity: number }) {
  return (
    <>
      {segments.map((s) => (
        <g key={s.label + s.start}>
          <line x1={xTs(s.start)} x2={xTs(s.start)} y1={y} y2={y + AXIS_ROW_HEIGHT} stroke="currentColor" strokeOpacity={0.12} />
          <text
            x={(xTs(s.start) + xTs(s.end)) / 2}
            y={y + AXIS_ROW_HEIGHT - 7}
            textAnchor="middle"
            fontSize={11}
            fontWeight={bold ? 700 : 400}
            fill="currentColor"
            opacity={opacity}
          >
            {s.label}
          </text>
        </g>
      ))}
    </>
  );
}

function Diamond({ m, cx, cy, theme }: { m: Milestone; cx: number; cy: number; theme: Theme }) {
  const r = 9;
  const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  return (
    <g>
      <polygon
        points={points}
        fill={theme.statusColor[m.status]}
        stroke={m.isCriticalPath ? theme.criticalPathColor : "#ffffff"}
        strokeWidth={m.isCriticalPath ? 3 : 1.5}
      />
      <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize={11} fill="currentColor">
        {m.title}
      </text>
    </g>
  );
}

export default function VariantA({ theme, axisTiers }: { theme: Theme; axisTiers: AxisTierConfig }) {
  const axisHeight = AXIS_ROW_HEIGHT * tierRowCount(axisTiers);
  const topBandY = MARGIN.top + axisHeight;
  const lanesTop = topBandY + TOP_BAND_HEIGHT;
  const height = lanesTop + lanes.length * LANE_HEIGHT + MARGIN.bottom;

  function laneY(laneId: string): number {
    const idx = lanes.findIndex((l) => l.id === laneId);
    return lanesTop + idx * LANE_HEIGHT + LANE_HEIGHT / 2;
  }

  const rows: { segments: Segment[]; bold: boolean; opacity: number }[] = [
    { segments: yearSegments(domainMin, domainMax), bold: true, opacity: 0.75 },
  ];
  if (axisTiers.tier2 !== "none") rows.push({ segments: segmentsForTier(axisTiers.tier2, domainMin, domainMax), bold: false, opacity: 0.6 });
  if (axisTiers.tier3 !== "none") rows.push({ segments: segmentsForTier(axisTiers.tier3, domainMin, domainMax), bold: false, opacity: 0.5 });

  return (
    <div className="overflow-x-auto">
      <svg width={WIDTH} height={height} className="text-zinc-800 dark:text-zinc-200" style={{ fontFamily: theme.font }}>
        {rows.map((row, i) => (
          <AxisRow key={i} y={MARGIN.top + i * AXIS_ROW_HEIGHT} segments={row.segments} bold={row.bold} opacity={row.opacity} />
        ))}

        {/* top-level band */}
        <text x={8} y={topBandY + 16} fontSize={11} fontWeight={600} opacity={0.5}>
          PROGRAM
        </text>
        {topLevelItems.map((t) => {
          const y = topBandY + TOP_BAND_HEIGHT / 2;
          if (t.type === "phase") {
            const px = x(t.startDate);
            return (
              <g key={t.id}>
                <rect
                  x={px}
                  y={y - 12}
                  width={Math.max(24, x(t.endDate) - px)}
                  height={24}
                  rx={12}
                  fill={theme.statusColor[t.status]}
                  fillOpacity={0.35}
                  stroke={theme.statusColor[t.status]}
                />
                <text x={px + 12} y={y + 4} fontSize={11} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          if (t.type === "milestone") {
            const cx = x(t.date);
            return (
              <g key={t.id}>
                <polygon
                  points={`${cx},${y - 11} ${cx + 11},${y} ${cx},${y + 11} ${cx - 11},${y}`}
                  fill={theme.statusColor[t.status]}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text x={cx} y={y - 16} textAnchor="middle" fontSize={11} fontWeight={600}>
                  {t.title}
                </text>
              </g>
            );
          }
          const cx = x(t.date);
          return (
            <g key={t.id}>
              <line x1={cx} x2={cx} y1={y - 20} y2={height - MARGIN.bottom} stroke="#a855f7" strokeDasharray="4 3" />
              <text x={cx + 4} y={y - 22} fontSize={10} fill="#a855f7">
                {t.title}
              </text>
            </g>
          );
        })}

        {/* lane bands + labels — subtle per-lane tint */}
        {lanes.map((l, i) => {
          const y0 = lanesTop + i * LANE_HEIGHT;
          const tint = theme.laneTint[i % theme.laneTint.length];
          return (
            <g key={l.id}>
              <rect x={MARGIN.left} y={y0} width={innerWidth} height={LANE_HEIGHT} fill={tint} fillOpacity={0.07} />
              <text x={8} y={y0 + LANE_HEIGHT / 2} fontSize={12} fontWeight={600} dominantBaseline="middle" fill={tint}>
                {l.name}
              </text>
            </g>
          );
        })}

        {/* dependency connectors — straight lines */}
        {milestones.flatMap((m) =>
          m.dependsOn
            .filter((d) => d.showConnector)
            .map((d) => {
              const from = milestoneById.get(d.id);
              if (!from) return null;
              const critical = m.isCriticalPath && from.isCriticalPath;
              return (
                <line
                  key={`${d.id}->${m.id}`}
                  x1={x(from.date)}
                  y1={laneY(from.laneId)}
                  x2={x(m.date)}
                  y2={laneY(m.laneId)}
                  stroke={critical ? theme.criticalPathColor : "currentColor"}
                  strokeOpacity={critical ? 0.9 : 0.35}
                  strokeWidth={critical ? 2.5 : 1.25}
                  markerEnd="url(#arrow-a)"
                />
              );
            }),
        )}

        <defs>
          <marker id="arrow-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" opacity={0.5} />
          </marker>
        </defs>

        {/* milestones on top of connectors */}
        {milestones.map((m) => (
          <Diamond key={m.id} m={m} cx={x(m.date)} cy={laneY(m.laneId)} theme={theme} />
        ))}
      </svg>
    </div>
  );
}
