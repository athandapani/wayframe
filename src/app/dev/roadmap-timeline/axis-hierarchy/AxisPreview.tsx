// PROTOTYPE (wayframe#70) — throwaway. Mirrors the real AxisRow markup in
// RoadmapTimeline.tsx (rect + divider line + label per segment) but takes an
// explicit fill/text color per row instead of a shared theme + opacity ramp,
// so each variant can render its own live "what would this actually look
// like" preview without touching the production component.

"use client";

import type { Segment } from "@/components/timeline/axis-tiers";

export interface PreviewRow {
  segments: Segment[];
  fill: string;
  text: string;
  label: string;
}

export const ROW_HEIGHT = 26;
export const WIDTH = 1180;
// Roughly the pixel width an 11px-bold short date label needs to not
// collide with its neighbours. Below this, thin labels rather than let them
// overlap — the grid (rects + dividers) still renders every segment either
// way, only the text is sparser.
const MIN_LABEL_PX = 46;

export function labelStride(segmentCount: number): number {
  if (segmentCount === 0) return 1;
  const avgPx = WIDTH / segmentCount;
  if (avgPx >= MIN_LABEL_PX) return 1;
  return Math.ceil(MIN_LABEL_PX / avgPx);
}

export function AxisPreview({ rows, domainMin, domainMax }: { rows: PreviewRow[]; domainMin: number; domainMax: number }) {
  const xOf = (ts: number) => ((ts - domainMin) / (domainMax - domainMin)) * WIDTH;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${rows.length * ROW_HEIGHT}`}
      className="block w-full rounded border"
      style={{ borderColor: "#2b3542", background: "#0d1117" }}
    >
      {rows.map((row, i) => {
        const stride = labelStride(row.segments.length);
        return (
          <g key={row.label + i}>
            {row.segments.map((s, idx) => (
              <g key={s.label + s.start}>
                <rect
                  x={xOf(s.start)}
                  y={i * ROW_HEIGHT}
                  width={Math.max(0, xOf(s.end) - xOf(s.start))}
                  height={ROW_HEIGHT}
                  fill={row.fill}
                />
                <line x1={xOf(s.start)} x2={xOf(s.start)} y1={i * ROW_HEIGHT} y2={(i + 1) * ROW_HEIGHT} stroke={row.text} strokeOpacity={0.25} />
                {idx % stride === 0 && (
                  <text
                    x={(xOf(s.start) + xOf(s.end)) / 2}
                    y={(i + 1) * ROW_HEIGHT - 8}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill={row.text}
                  >
                    {s.label}
                  </text>
                )}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
