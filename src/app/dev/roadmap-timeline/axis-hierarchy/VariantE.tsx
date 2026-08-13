// PROTOTYPE (wayframe#70) — throwaway. Variant E: "Timeline-edge disclosure"
// (per user request after seeing D).
//
// No separate control panel at all — the level control lives directly on
// the axis preview itself, in a narrow gutter pinned to the right-most
// edge of the timeline. Right edge rather than left: in the real
// RoadmapTimeline, the left edge is already spoken for by the
// Program/Lane header column (MARGIN.left), so the right edge is the only
// free edge to dock a persistent control on without covering real chrome.
//
// Three distinct triangle glyphs, not a plain +/-:
//   ▶  "reveal" — shown once, on Level 1, only while nothing is expanded
//      yet. Clicking it opens Level 2.
//   ▼  "go deeper" — shown on whichever row is currently the deepest
//      *and* has a level available below it (Level 2 when Level 3 is
//      absent). Clicking it opens the next level down.
//   ▲  "collapse" — shown on any row that isn't Level 1 (i.e. can be
//      removed). Clicking it removes that row; removing Level 2 cascades
//      Level 3 away with it.
// Level 1 never shows ▲ (there's nothing above it to collapse into), and a
// fully-open Level 3 never shows ▼ (there's no Level 4).
//
// Color: per user decision, only Level 1 (Year) is user-pickable — Levels
// 2/3 are always derived as progressively lighter shades of it, same
// color-mix ramp Variant D used, just off a variable base now instead of a
// fixed one. The picker itself lives in the *real* OptionsMenu component
// (imported, not reimplemented) so this is genuinely what the hamburger
// would contain, not a mockup of it — OptionsMenu reads its chrome off
// --wf-panel/--wf-border/--wf-ink custom properties that RoadmapWorkspace
// normally publishes from the active theme, so this file publishes them
// too (off defaultTheme) purely so the component renders correctly here.

"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { yearSegments, segmentsForTier, type Segment } from "@/components/timeline/axis-tiers";
import { defaultTheme } from "@/components/timeline/theme";
import { OptionsMenu, OptionsMenuRow } from "@/components/workspace/OptionsMenu";
import { WIDTH, ROW_HEIGHT, labelStride } from "./AxisPreview";
import { DOMAIN_MIN, DOMAIN_MAX, TIER3_OPTIONS_FOR_TIER2, type Tier2Unit, type Tier3Unit } from "./types";

const GUTTER = 40;
const COLLAPSE_X = WIDTH + 11;
const EXPAND_X = WIDTH + 29;

function shadeRamp(base: string): [string, string, string] {
  return [base, `color-mix(in oklab, ${base} 78%, white)`, `color-mix(in oklab, ${base} 58%, white)`];
}

interface RowSpec {
  segments: Segment[];
  fill: string;
  onCollapse?: () => void;
  expandKind?: "right" | "down";
  onExpand?: () => void;
}

export function VariantE() {
  const [tier2, setTier2] = useState<Tier2Unit>("quarter");
  const [tier3, setTier3] = useState<Tier3Unit>("none");
  const [yearColor, setYearColor] = useState(defaultTheme.axisBg);

  const shades = useMemo(() => shadeRamp(yearColor), [yearColor]);

  const rows: RowSpec[] = useMemo(() => {
    const tier3Options = TIER3_OPTIONS_FOR_TIER2[tier2].filter((o) => o !== "none");
    const out: RowSpec[] = [
      {
        segments: yearSegments(DOMAIN_MIN, DOMAIN_MAX),
        fill: shades[0],
        expandKind: tier2 === "none" ? "right" : undefined,
        onExpand: tier2 === "none" ? () => setTier2("quarter") : undefined,
      },
    ];
    if (tier2 !== "none") {
      out.push({
        segments: segmentsForTier(tier2, DOMAIN_MIN, DOMAIN_MAX),
        fill: shades[1],
        onCollapse: () => {
          setTier2("none");
          setTier3("none");
        },
        expandKind: tier3 === "none" ? "down" : undefined,
        onExpand: tier3 === "none" ? () => setTier3(tier3Options[0] ?? "none") : undefined,
      });
    }
    if (tier2 !== "none" && tier3 !== "none") {
      out.push({
        segments: segmentsForTier(tier3, DOMAIN_MIN, DOMAIN_MAX),
        fill: shades[2],
        onCollapse: () => setTier3("none"),
      });
    }
    return out;
  }, [tier2, tier3, shades]);

  const totalHeight = rows.length * ROW_HEIGHT;

  return (
    <div
      className="space-y-3"
      style={
        {
          "--wf-panel": defaultTheme.panelBg,
          "--wf-border": defaultTheme.panelBorder,
          "--wf-ink": defaultTheme.panelInk,
          "--wf-accent": defaultTheme.accent,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "#8b949e" }}>
          ▶ reveal Level 2 · ▼ go one level deeper · ▲ collapse this level — all live on the timeline&rsquo;s right edge, no separate panel.
        </p>
        <OptionsMenu>
          <OptionsMenuRow label="Year color">
            <input
              type="color"
              aria-label="Year color"
              value={yearColor}
              onChange={(e) => setYearColor(e.target.value)}
              className="h-6 w-7 shrink-0 cursor-pointer rounded border bg-transparent p-0"
              style={{ borderColor: "var(--wf-border)" }}
            />
          </OptionsMenuRow>
          <p className="text-xs opacity-60">Level 2 and Level 3 are shaded lighter from this automatically.</p>
        </OptionsMenu>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH + GUTTER} ${totalHeight}`}
        className="block w-full rounded border"
        style={{ borderColor: "#2b3542", background: "#0d1117" }}
      >
        {rows.map((row, i) => {
          const stride = labelStride(row.segments.length);
          const y = i * ROW_HEIGHT;
          const cy = y + ROW_HEIGHT / 2;
          return (
            <g key={i}>
              {row.segments.map((s, idx) => {
                const x0 = ((s.start - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * WIDTH;
                const x1 = ((s.end - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * WIDTH;
                return (
                  <g key={s.label + s.start}>
                    <rect x={x0} y={y} width={Math.max(0, x1 - x0)} height={ROW_HEIGHT} fill={row.fill} />
                    <line x1={x0} x2={x0} y1={y} y2={y + ROW_HEIGHT} stroke="#ffffff" strokeOpacity={0.25} />
                    {idx % stride === 0 && (
                      <text x={(x0 + x1) / 2} y={y + ROW_HEIGHT - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff">
                        {s.label}
                      </text>
                    )}
                  </g>
                );
              })}

              <rect x={WIDTH} y={y} width={GUTTER} height={ROW_HEIGHT} fill="#161b22" />
              {row.onCollapse && <TriangleButton kind="up" cx={COLLAPSE_X} cy={cy} label="Collapse this level" onActivate={row.onCollapse} />}
              {row.expandKind && row.onExpand && (
                <TriangleButton
                  kind={row.expandKind}
                  cx={EXPAND_X}
                  cy={cy}
                  label={row.expandKind === "right" ? "Reveal Level 2" : "Go one level deeper"}
                  onActivate={row.onExpand}
                />
              )}
            </g>
          );
        })}
        <line x1={WIDTH} x2={WIDTH} y1={0} y2={totalHeight} stroke="#2b3542" />
      </svg>
    </div>
  );
}

function TriangleButton({
  kind,
  cx,
  cy,
  label,
  onActivate,
}: {
  kind: "up" | "down" | "right";
  cx: number;
  cy: number;
  label: string;
  onActivate: () => void;
}) {
  const points =
    kind === "right"
      ? `${cx - 4},${cy - 5} ${cx - 4},${cy + 5} ${cx + 5},${cy}`
      : kind === "down"
        ? `${cx - 5},${cy - 4} ${cx + 5},${cy - 4} ${cx},${cy + 5}`
        : `${cx - 5},${cy + 4} ${cx + 5},${cy + 4} ${cx},${cy - 5}`;

  function onKeyDown(e: KeyboardEvent<SVGGElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  }

  return (
    <g role="button" tabIndex={0} aria-label={label} onClick={onActivate} onKeyDown={onKeyDown} style={{ cursor: "pointer" }}>
      <title>{label}</title>
      <rect x={cx - 8} y={cy - 8} width={16} height={16} fill="transparent" />
      <polygon points={points} fill="#4fa6e9" />
    </g>
  );
}
