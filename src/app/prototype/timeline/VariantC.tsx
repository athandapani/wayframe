// PROTOTYPE — Variant C: single <canvas>, imperative 2d-context drawing, no
// DOM per shape. Hit-testing done by hand against a list of drawn regions;
// hover surfaces an absolutely-positioned HTML tooltip. Tests: "do we need
// canvas's draw-call performance, and is losing per-element DOM nodes
// (accessibility, easy click handlers) worth it?"
"use client";

import { useEffect, useRef, useState } from "react";
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
  return MARGIN.left + ((parseDate(dateStr) - domainMin) / (domainMax - domainMin)) * innerWidth;
}
function xTs(ts: number): number {
  return MARGIN.left + ((ts - domainMin) / (domainMax - domainMin)) * innerWidth;
}

const milestoneById = new Map(milestones.map((m) => [m.id, m]));

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
  const height = lanesTop + lanes.length * LANE_HEIGHT + MARGIN.bottom;
  return { axisHeight, topBandY, lanesTop, height };
}

interface HitRegion {
  milestone: Milestone;
  cx: number;
  cy: number;
}

function draw(ctx: CanvasRenderingContext2D, hoveredId: string | null, fg: string, theme: Theme, axisTiers: AxisTierConfig): HitRegion[] {
  const { topBandY, lanesTop, height } = layoutFor(axisTiers);
  const laneY = (laneId: string) => {
    const idx = lanes.findIndex((l) => l.id === laneId);
    return lanesTop + idx * LANE_HEIGHT + LANE_HEIGHT / 2;
  };

  ctx.clearRect(0, 0, WIDTH, height);
  ctx.textBaseline = "alphabetic";
  ctx.font = `11px ${theme.font}`;

  // multi-tier axis rows: Year always, Quarter/Month as configured
  const rows: { segments: Segment[]; bold: boolean }[] = [{ segments: yearSegments(domainMin, domainMax), bold: true }];
  if (axisTiers.tier2 !== "none") rows.push({ segments: segmentsForTier(axisTiers.tier2, domainMin, domainMax), bold: false });
  if (axisTiers.tier3 !== "none") rows.push({ segments: segmentsForTier(axisTiers.tier3, domainMin, domainMax), bold: false });
  rows.forEach((row, i) => {
    const y = MARGIN.top + i * AXIS_ROW_HEIGHT;
    for (const s of row.segments) {
      ctx.strokeStyle = "rgba(128,128,128,0.15)";
      ctx.beginPath();
      ctx.moveTo(xTs(s.start), y);
      ctx.lineTo(xTs(s.start), y + AXIS_ROW_HEIGHT);
      ctx.stroke();
      ctx.fillStyle = row.bold ? fg : "rgba(128,128,128,0.75)";
      ctx.font = `${row.bold ? "bold " : ""}11px ${theme.font}`;
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
      ctx.fillStyle = hexAlpha(theme.statusColor[t.status], 0.35);
      ctx.strokeStyle = theme.statusColor[t.status];
      ctx.beginPath();
      ctx.roundRect(x1, topY - 12, Math.max(24, x2 - x1), 24, 12); // pill shape: rx = height / 2
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.font = `bold 11px ${theme.font}`;
      ctx.fillText(t.title, x1 + 12, topY + 4);
    } else if (t.type === "milestone") {
      const cx = x(t.date);
      ctx.fillStyle = theme.statusColor[t.status];
      ctx.beginPath();
      ctx.moveTo(cx, topY - 11);
      ctx.lineTo(cx + 11, topY);
      ctx.lineTo(cx, topY + 11);
      ctx.lineTo(cx - 11, topY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
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

  // lane bands + labels — subtle per-lane tint
  lanes.forEach((l, i) => {
    const y0 = lanesTop + i * LANE_HEIGHT;
    const tint = theme.laneTint[i % theme.laneTint.length];
    ctx.fillStyle = hexAlpha(tint, 0.07);
    ctx.fillRect(MARGIN.left, y0, innerWidth, LANE_HEIGHT);
    ctx.fillStyle = tint;
    ctx.font = `bold 12px ${theme.font}`;
    ctx.fillText(l.name, 8, y0 + LANE_HEIGHT / 2 + 4);
  });

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

  // milestone diamonds + hit-region collection
  const regions: HitRegion[] = [];
  for (const m of milestones) {
    const cx = x(m.date);
    const cy = laneY(m.laneId);
    const r = m.id === hoveredId ? 12 : 9;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = theme.statusColor[m.status];
    ctx.fill();
    ctx.strokeStyle = m.isCriticalPath ? theme.criticalPathColor : "#ffffff";
    ctx.lineWidth = m.isCriticalPath ? 3 : 1.5;
    ctx.stroke();
    if (m.id === hoveredId) {
      ctx.fillStyle = fg;
      ctx.font = `bold 11px ${theme.font}`;
      ctx.textAlign = "center";
      ctx.fillText(m.title, cx, cy - r - 6);
      ctx.textAlign = "left";
    }
    regions.push({ milestone: m, cx, cy });
  }

  return regions;
}

export default function VariantC({ theme, axisTiers }: { theme: Theme; axisTiers: AxisTierConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const regionsRef = useRef<HitRegion[]>([]);
  const [hovered, setHovered] = useState<HitRegion | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
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
    setMousePos({ x: e.clientX, y: e.clientY });
    const hit = regionsRef.current.find((r) => Math.abs(r.cx - mx) < 10 && Math.abs(r.cy - my) < 10);
    if (hit?.milestone.id !== hovered?.milestone.id) {
      setHovered(hit ?? null);
    }
  }

  return (
    <div className="relative overflow-x-auto text-zinc-800 dark:text-zinc-200">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        className="cursor-default"
      />
      {hovered && mousePos && (
        <div
          className="pointer-events-none fixed z-50 rounded bg-black px-2 py-1 text-xs text-white shadow-lg dark:bg-white dark:text-black"
          style={{ left: mousePos.x + 12, top: mousePos.y + 12, fontFamily: theme.font }}
        >
          {hovered.milestone.title} — {hovered.milestone.status}
          {hovered.milestone.owner ? ` — ${hovered.milestone.owner}` : ""}
        </div>
      )}
    </div>
  );
}
