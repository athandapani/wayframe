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
const TODAY_TS = parseDate("2026-08-01");

// solid colored band per tier row (inspired by Office Timeline's swimlane
// templates: a bold colored axis bar reads far more "designed" than plain
// gridlines with small labels).
function AxisRow({ y, segments, theme, opacity }: { y: number; segments: Segment[]; theme: Theme; opacity: number }) {
  return (
    <>
      {segments.map((s) => (
        <g key={s.label + s.start}>
          <rect x={xTs(s.start)} y={y} width={xTs(s.end) - xTs(s.start)} height={AXIS_ROW_HEIGHT} fill={theme.axisBg} fillOpacity={opacity} />
          <line x1={xTs(s.start)} x2={xTs(s.start)} y1={y} y2={y + AXIS_ROW_HEIGHT} stroke="#ffffff" strokeOpacity={0.25} />
          <text x={(xTs(s.start) + xTs(s.end)) / 2} y={y + AXIS_ROW_HEIGHT - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff">
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
  if (TODAY_TS < domainMin || TODAY_TS > domainMax) return null;
  const tx = xTs(TODAY_TS);
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

export default function VariantA({ theme, axisTiers }: { theme: Theme; axisTiers: AxisTierConfig }) {
  const axisHeight = AXIS_ROW_HEIGHT * tierRowCount(axisTiers);
  const topBandY = MARGIN.top + axisHeight;
  const lanesTop = topBandY + TOP_BAND_HEIGHT;
  const height = lanesTop + lanes.length * LANE_HEIGHT + MARGIN.bottom;

  function laneY(laneId: string): number {
    const idx = lanes.findIndex((l) => l.id === laneId);
    return lanesTop + idx * LANE_HEIGHT + LANE_HEIGHT / 2;
  }

  const rows: { segments: Segment[]; opacity: number }[] = [{ segments: yearSegments(domainMin, domainMax), opacity: 1 }];
  if (axisTiers.tier2 !== "none") rows.push({ segments: segmentsForTier(axisTiers.tier2, domainMin, domainMax), opacity: 0.8 });
  if (axisTiers.tier3 !== "none") rows.push({ segments: segmentsForTier(axisTiers.tier3, domainMin, domainMax), opacity: 0.6 });

  return (
    <div className="overflow-x-auto">
      <svg width={WIDTH} height={height} className="text-zinc-800 dark:text-zinc-200" style={{ fontFamily: theme.font }}>
        {rows.map((row, i) => (
          <AxisRow key={i} y={MARGIN.top + i * AXIS_ROW_HEIGHT} segments={row.segments} theme={theme} opacity={row.opacity} />
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

        <TodayMarker topY={topBandY} bottomY={height - MARGIN.bottom} />
      </svg>
    </div>
  );
}
