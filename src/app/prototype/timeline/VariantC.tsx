// PROTOTYPE — Variant C: single <canvas>, imperative 2d-context drawing, no
// DOM per shape. Hit-testing done by hand against a list of drawn regions;
// hover surfaces an absolutely-positioned HTML tooltip. Tests: "do we need
// canvas's draw-call performance, and is losing per-element DOM nodes
// (accessibility, easy click handlers) worth it?"
"use client";

import { useEffect, useRef, useState } from "react";
import { swimlanes, topLevelItems, milestones, type Milestone } from "./demo-data";
import { STATUS_COLOR, CRITICAL_PATH_COLOR, parseDate, formatMonth } from "./status-colors";

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
const minDate = parseDate(allDates.reduce((a, b) => (a < b ? a : b)));
const maxDate = parseDate(allDates.reduce((a, b) => (a > b ? a : b)));
const PAD_DAYS = 14 * 86400000;
const domainMin = minDate - PAD_DAYS;
const domainMax = maxDate + PAD_DAYS;
const innerWidth = WIDTH - MARGIN.left - MARGIN.right;

function x(dateStr: string): number {
  return MARGIN.left + ((parseDate(dateStr) - domainMin) / (domainMax - domainMin)) * innerWidth;
}
function laneY(laneId: string): number {
  const idx = lanes.findIndex((l) => l.id === laneId);
  return MARGIN.top + AXIS_HEIGHT + TOP_BAND_HEIGHT + idx * LANE_HEIGHT + LANE_HEIGHT / 2;
}

const HEIGHT = MARGIN.top + AXIS_HEIGHT + TOP_BAND_HEIGHT + lanes.length * LANE_HEIGHT + MARGIN.bottom;
const milestoneById = new Map(milestones.map((m) => [m.id, m]));

function monthTicks(): number[] {
  const ticks: number[] = [];
  const d = new Date(domainMin);
  d.setUTCDate(1);
  while (d.getTime() < domainMax) {
    ticks.push(d.getTime());
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return ticks;
}

interface HitRegion {
  milestone: Milestone;
  cx: number;
  cy: number;
}

function draw(ctx: CanvasRenderingContext2D, hoveredId: string | null, fg: string): HitRegion[] {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";

  // month gridlines + axis labels
  for (const t of monthTicks()) {
    const gx = MARGIN.left + ((t - domainMin) / (domainMax - domainMin)) * innerWidth;
    ctx.strokeStyle = "rgba(128,128,128,0.15)";
    ctx.beginPath();
    ctx.moveTo(gx, MARGIN.top);
    ctx.lineTo(gx, HEIGHT - MARGIN.bottom);
    ctx.stroke();
    ctx.fillStyle = "rgba(128,128,128,0.7)";
    ctx.font = "11px sans-serif";
    ctx.fillText(formatMonth(t), gx, MARGIN.top + 14);
  }

  // top-level band
  const topY = MARGIN.top + AXIS_HEIGHT + TOP_BAND_HEIGHT / 2;
  ctx.fillStyle = "rgba(128,128,128,0.6)";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("PROGRAM", 8, MARGIN.top + AXIS_HEIGHT + 16);
  for (const t of topLevelItems) {
    if (t.type === "phase") {
      const x1 = x(t.startDate);
      const x2 = x(t.endDate);
      ctx.fillStyle = STATUS_COLOR[t.status] + "59";
      ctx.strokeStyle = STATUS_COLOR[t.status];
      ctx.beginPath();
      ctx.roundRect(x1, topY - 12, Math.max(2, x2 - x1), 24, 6);
      ctx.fill();
      ctx.stroke();
    } else if (t.type === "milestone") {
      const cx = x(t.date);
      ctx.fillStyle = STATUS_COLOR[t.status];
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
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t.title, cx, topY - 16);
      ctx.textAlign = "left";
    } else {
      const cx = x(t.date);
      ctx.strokeStyle = "#a855f7";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, topY - 20);
      ctx.lineTo(cx, HEIGHT - MARGIN.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#a855f7";
      ctx.font = "10px sans-serif";
      ctx.fillText(t.title, cx + 4, topY - 22);
    }
  }

  // lane bands + labels
  lanes.forEach((l, i) => {
    const y0 = MARGIN.top + AXIS_HEIGHT + TOP_BAND_HEIGHT + i * LANE_HEIGHT;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(128,128,128,0.04)";
      ctx.fillRect(MARGIN.left, y0, innerWidth, LANE_HEIGHT);
    }
    ctx.fillStyle = fg;
    ctx.font = "bold 12px sans-serif";
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
      ctx.strokeStyle = critical ? CRITICAL_PATH_COLOR : "rgba(128,128,128,0.5)";
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
    ctx.fillStyle = STATUS_COLOR[m.status];
    ctx.fill();
    ctx.strokeStyle = m.isCriticalPath ? CRITICAL_PATH_COLOR : "#ffffff";
    ctx.lineWidth = m.isCriticalPath ? 3 : 1.5;
    ctx.stroke();
    if (m.id === hoveredId) {
      ctx.fillStyle = fg;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(m.title, cx, cy - r - 6);
      ctx.textAlign = "left";
    }
    regions.push({ milestone: m, cx, cy });
  }

  return regions;
}

export default function VariantC() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const regionsRef = useRef<HitRegion[]>([]);
  const [hovered, setHovered] = useState<HitRegion | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${HEIGHT}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const fg = getComputedStyle(canvas).color;
    regionsRef.current = draw(ctx, hovered?.milestone.id ?? null, fg);
  }, [hovered]);

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
          style={{ left: mousePos.x + 12, top: mousePos.y + 12 }}
        >
          {hovered.milestone.title} — {hovered.milestone.status}
          {hovered.milestone.owner ? ` — ${hovered.milestone.owner}` : ""}
        </div>
      )}
    </div>
  );
}
