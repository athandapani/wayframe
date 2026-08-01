// PROTOTYPE — Variant C: single <canvas>, imperative 2d-context drawing, no
// DOM per shape. Hit-testing done by hand against a list of drawn regions;
// hover surfaces an absolutely-positioned HTML tooltip. Tests: "do we need
// canvas's draw-call performance, and is losing per-element DOM nodes
// (accessibility, easy click handlers) worth it?"
"use client";

import { useEffect, useRef, useState } from "react";
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
const minDate = parseDate(allDates.reduce((a, b) => (a < b ? a : b)));
const maxDate = parseDate(allDates.reduce((a, b) => (a > b ? a : b)));
const PAD_DAYS = 14 * 86400000;
const domainMin = minDate - PAD_DAYS;
const domainMax = maxDate + PAD_DAYS;
const innerWidth = WIDTH - MARGIN.left - MARGIN.right;

function x(dateStr: string): number {
  return MARGIN.left + ((parseDate(dateStr) - domainMin) / (domainMax - domainMin)) * innerWidth;
}
function xTs(ts: number): number {
  return MARGIN.left + ((ts - domainMin) / (domainMax - domainMin)) * innerWidth;
}

const milestoneById = new Map(milestones.map((m) => [m.id, m]));
const TODAY_TS = parseDate("2026-08-01");

const primaryPlacement = new Map<string, { text: string; tier: 0 | 1 | 2 }>();
const datePlacement = new Map<string, { text: string; tier: 0 | 1 | 2 }>();
for (const laneRow of rows.filter((r) => r.swimlane.type === "lane")) {
  const laneMilestones = milestones.filter((m) => m.laneId === laneRow.swimlane.id);
  const primary = layoutPrimaryLabels(laneMilestones.map((m) => ({ id: m.id, x: x(m.date), text: m.shortLabel })));
  const dates = layoutDateLabels(laneMilestones.map((m) => ({ id: m.id, x: x(m.date), full: formatDateShort(m.date), compact: formatDateCompact(m.date) })));
  for (const [k, v] of primary) primaryPlacement.set(k, v);
  for (const [k, v] of dates) datePlacement.set(k, v);
}

function hexAlpha(hex: string, opacity: number): string {
  const a = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
}

function layoutFor(axisTiers: AxisTierConfig) {
  const axisHeight = AXIS_ROW_HEIGHT * tierRowCount(axisTiers);
  const topBandY = MARGIN.top + axisHeight;
  const lanesTop = topBandY + TOP_BAND_HEIGHT;
  const height = lanesTop + bodyHeight + MARGIN.bottom;
  return { axisHeight, topBandY, lanesTop, height };
}

// rotated rounded-square = softened "cushion" diamond, à la Office Timeline's
// milestone markers (an 8-point rounded diamond, not a sharp 4-point one).
function drawCushion(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, stroke: string, lineWidth: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.4);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

interface HitRegion {
  milestone: Milestone;
  cx: number;
  cy: number;
}

function draw(ctx: CanvasRenderingContext2D, hoveredId: string | null, fg: string, theme: Theme, axisTiers: AxisTierConfig): HitRegion[] {
  const { topBandY, lanesTop, height } = layoutFor(axisTiers);
  const laneY = (laneId: string) => {
    const row = rowById.get(laneId)!;
    return lanesTop + row.relY + row.height / 2;
  };
  const laneTint = (laneId: string) => {
    const row = rowById.get(laneId)!;
    return theme.laneTint[row.laneIndex % theme.laneTint.length];
  };

  ctx.clearRect(0, 0, WIDTH, height);
  ctx.textBaseline = "alphabetic";
  ctx.font = `11px ${theme.font}`;

  // multi-tier axis rows: Year always, Quarter/Month as configured — solid
  // colored bands (à la Office Timeline) rather than faint gridlines.
  const axisRows: { segments: Segment[]; opacity: number }[] = [{ segments: yearSegments(domainMin, domainMax), opacity: 1 }];
  if (axisTiers.tier2 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier2, domainMin, domainMax), opacity: 0.8 });
  if (axisTiers.tier3 !== "none") axisRows.push({ segments: segmentsForTier(axisTiers.tier3, domainMin, domainMax), opacity: 0.6 });
  axisRows.forEach((row, i) => {
    const y = MARGIN.top + i * AXIS_ROW_HEIGHT;
    for (const s of row.segments) {
      ctx.fillStyle = hexAlpha(theme.axisBg, row.opacity);
      ctx.fillRect(xTs(s.start), y, xTs(s.end) - xTs(s.start), AXIS_ROW_HEIGHT);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(xTs(s.start), y);
      ctx.lineTo(xTs(s.start), y + AXIS_ROW_HEIGHT);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold 11px ${theme.font}`;
      ctx.textAlign = "center";
      ctx.fillText(s.label, (xTs(s.start) + xTs(s.end)) / 2, y + AXIS_ROW_HEIGHT - 7);
      ctx.textAlign = "left";
    }
  });

  // top-level band
  const topY = topBandY + TOP_BAND_HEIGHT / 2;
  ctx.fillStyle = "rgba(128,128,128,0.6)";
  ctx.font = `bold 11px ${theme.font}`;
  ctx.fillText("PROGRAM", 8, topBandY + 16);
  for (const t of topLevelItems) {
    if (t.type === "phase") {
      const x1 = x(t.startDate);
      const x2 = x(t.endDate);
      const h = PILL_HEIGHT_LG;
      ctx.fillStyle = hexAlpha(theme.statusColor[t.status], 0.35);
      ctx.strokeStyle = theme.statusColor[t.status];
      ctx.beginPath();
      ctx.roundRect(x1, topY - h / 2, Math.max(h, x2 - x1), h, h / 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.font = `bold 11px ${theme.font}`;
      ctx.fillText(t.title, x1 + h / 2, topY + 4);
    } else if (t.type === "milestone") {
      const cx = x(t.date);
      drawCushion(ctx, cx, topY, 10, theme.statusColor[t.status], "#fff", 2);
      ctx.fillStyle = fg;
      ctx.font = `bold 11px ${theme.font}`;
      ctx.textAlign = "center";
      ctx.fillText(t.title, cx, topY - 16);
      ctx.textAlign = "left";
    } else {
      const cx = x(t.date);
      ctx.strokeStyle = "#a855f7";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, topY - 20);
      ctx.lineTo(cx, height - MARGIN.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#a855f7";
      ctx.font = `10px ${theme.font}`;
      ctx.fillText(t.title, cx + 4, topY - 22);
    }
  }

  // swimlane rows: separators (group headers) + lanes with a solid darker header block
  rows.forEach((row) => {
    const y0 = lanesTop + row.relY;
    if (row.swimlane.type === "separator") {
      ctx.fillStyle = theme.separatorBg;
      ctx.fillRect(0, y0, WIDTH, row.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold 12px ${theme.font}`;
      ctx.fillText(row.swimlane.name, 8, y0 + row.height / 2 + 4);
      return;
    }
    const tint = theme.laneTint[row.laneIndex % theme.laneTint.length];
    ctx.fillStyle = hexAlpha(tint, 0.07);
    ctx.fillRect(MARGIN.left, y0, innerWidth, row.height);
    ctx.fillStyle = darken(tint, 0.4);
    ctx.fillRect(0, y0, MARGIN.left, row.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 12px ${theme.font}`;
    ctx.fillText(row.swimlane.name, 8, y0 + row.height / 2 + 4);
  });

  // in-lane pills — smaller than top-band pills, colored with the lane's header shade
  for (const p of lanePills) {
    const px = x(p.startDate);
    const w = Math.max(PILL_HEIGHT_SM, x(p.endDate) - px);
    const cy = laneY(p.laneId);
    ctx.fillStyle = darken(laneTint(p.laneId), 0.4);
    ctx.beginPath();
    ctx.roundRect(px, cy - PILL_HEIGHT_SM / 2, w, PILL_HEIGHT_SM, PILL_HEIGHT_SM / 2);
    ctx.fill();
    if (w > 60) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `9px ${theme.font}`;
      ctx.fillText(p.title, px + PILL_HEIGHT_SM / 2, cy + 3);
    }
  }

  // dependency connectors — orthogonal "elbow" step lines (canvas path, no generator lib)
  for (const m of milestones) {
    for (const d of m.dependsOn) {
      if (!d.showConnector) continue;
      const from = milestoneById.get(d.id);
      if (!from) continue;
      const critical = m.isCriticalPath && from.isCriticalPath;
      const x1 = x(from.date);
      const y1 = laneY(from.laneId);
      const x2 = x(m.date);
      const y2 = laneY(m.laneId);
      const midX = x1 + (x2 - x1) / 2;
      ctx.strokeStyle = critical ? theme.criticalPathColor : "rgba(128,128,128,0.5)";
      ctx.lineWidth = critical ? 2.5 : 1.25;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(midX, y1);
      ctx.lineTo(midX, y2);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // arrowhead
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 6, y2 - 4);
      ctx.lineTo(x2 - 6, y2 + 4);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  }

  // milestone markers: cushion diamond + always-visible short label & date
  // (tiered to avoid collisions), full title revealed via hover tooltip
  const regions: HitRegion[] = [];
  for (const m of milestones) {
    const cx = x(m.date);
    const cy = laneY(m.laneId);
    const r = m.id === hoveredId ? 11 : 8;
    const primary = primaryPlacement.get(m.id) ?? { text: m.shortLabel, tier: 0 as const };
    const date = datePlacement.get(m.id) ?? { text: formatDateShort(m.date), tier: 0 as const };
    const primaryDy = PRIMARY_TIER_DY[primary.tier];
    const dateDy = DATE_TIER_DY[date.tier];

    ctx.strokeStyle = "rgba(128,128,128,0.3)";
    ctx.lineWidth = 1;
    if (primary.tier === 2) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r - 1);
      ctx.lineTo(cx, cy + primaryDy + 4);
      ctx.stroke();
    }
    if (date.tier === 2) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + r + 1);
      ctx.lineTo(cx, cy + dateDy - 4);
      ctx.stroke();
    }

    drawCushion(ctx, cx, cy, r, theme.statusColor[m.status], m.isCriticalPath ? theme.criticalPathColor : "#ffffff", m.isCriticalPath ? 3 : 1.5);

    ctx.fillStyle = fg;
    ctx.font = `bold 10px ${theme.font}`;
    ctx.textAlign = "center";
    ctx.fillText(primary.text, cx, cy + primaryDy);
    ctx.globalAlpha = 0.6;
    ctx.font = `9px ${theme.font}`;
    ctx.fillText(date.text, cx, cy + dateDy);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    regions.push({ milestone: m, cx, cy });
  }

  // hover tooltip: full title, drawn last so it sits above everything else
  if (hoveredId) {
    const m = milestoneById.get(hoveredId);
    const region = regions.find((r) => r.milestone.id === hoveredId);
    if (m && region) {
      const w = Math.max(40, m.title.length * 6 + 16);
      ctx.font = `11px ${theme.font}`;
      ctx.fillStyle = "#18181b";
      ctx.beginPath();
      ctx.roundRect(region.cx - w / 2, region.cy - 68, w, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(m.title, region.cx, region.cy - 54);
      ctx.textAlign = "left";
    }
  }

  // reference lines: Today is always on; top-level milestones opt in via showReferenceLine
  function drawReferenceLine(tx: number, label: string, color: string, dash: number[]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(tx, topBandY);
    ctx.lineTo(tx, height - MARGIN.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.font = `bold 9px ${theme.font}`;
    ctx.fillText(label, tx + 4, topBandY - 4);
  }
  for (const t of topLevelItems) {
    if (t.type === "milestone" && t.showReferenceLine) {
      drawReferenceLine(x(t.date), t.title, theme.statusColor[t.status], [2, 2]);
    }
  }
  if (TODAY_TS >= domainMin && TODAY_TS <= domainMax) {
    drawReferenceLine(xTs(TODAY_TS), "Today", "#e11d48", [3, 3]);
  }

  return regions;
}

export default function VariantC({ theme, axisTiers }: { theme: Theme; axisTiers: AxisTierConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const regionsRef = useRef<HitRegion[]>([]);
  const [hovered, setHovered] = useState<HitRegion | null>(null);
  const { height } = layoutFor(axisTiers);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const fg = getComputedStyle(canvas).color;
    regionsRef.current = draw(ctx, hovered?.milestone.id ?? null, fg, theme, axisTiers);
  }, [hovered, theme, axisTiers, height]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = regionsRef.current.find((r) => Math.abs(r.cx - mx) < 10 && Math.abs(r.cy - my) < 10);
    if (hit?.milestone.id !== hovered?.milestone.id) {
      setHovered(hit ?? null);
    }
  }

  return (
    <div className="relative overflow-x-auto text-zinc-800 dark:text-zinc-200">
      <canvas ref={canvasRef} onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)} className="cursor-default" />
    </div>
  );
}
