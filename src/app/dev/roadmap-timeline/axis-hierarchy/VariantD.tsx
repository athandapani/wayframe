// PROTOTYPE (wayframe#70) — throwaway. Variant D: "Depth control" (per user
// request after seeing A/B/C).
//
// Deliberately the most minimal of the four: no color pickers, no preset
// list, no per-level unit dropdown. Each active level is one compact row
// with an inline segmented unit toggle and a small +/− to grow or shrink
// the hierarchy one level at a time (+ only appears on the deepest active
// level; − removes that level and, for Level 2, cascades Level 3 away with
// it). Color is never chosen by hand — it's a fixed dark-to-light shade
// ramp off the theme's own axis color (L1 darkest, L3 lightest), matching
// the direction Variant A's optional "auto-shade" already explored, just
// made mandatory instead of a toggle. Label thinning for dense tiers
// (Week) is handled by AxisPreview itself now, adaptively — not hardcoded
// to "every 4th", since the right stride depends on how many segments
// actually fit at the current width.

"use client";

import { useMemo, useState } from "react";
import { yearSegments, segmentsForTier } from "@/components/timeline/axis-tiers";
import { AxisPreview, type PreviewRow } from "./AxisPreview";
import { DOMAIN_MIN, DOMAIN_MAX, TIER3_OPTIONS_FOR_TIER2, type Tier2Unit, type Tier3Unit } from "./types";

// Same base as the real blueprint theme's axisBg, shaded lighter per level
// — L1 darkest, L3 lightest, so depth reads as "zooming out" rather than
// as arbitrary color choices.
const BASE = "#23384d";
const SHADES = [BASE, `color-mix(in oklab, ${BASE} 78%, white)`, `color-mix(in oklab, ${BASE} 58%, white)`];

export function VariantD() {
  const [tier2, setTier2] = useState<Tier2Unit>("quarter");
  const [tier3, setTier3] = useState<Tier3Unit>("none");

  const tier3Options = TIER3_OPTIONS_FOR_TIER2[tier2].filter((o) => o !== "none");

  function changeTier2(v: Tier2Unit) {
    setTier2(v);
    if (!TIER3_OPTIONS_FOR_TIER2[v].includes(tier3)) setTier3("none");
  }

  const rows: PreviewRow[] = useMemo(() => {
    const out: PreviewRow[] = [{ segments: yearSegments(DOMAIN_MIN, DOMAIN_MAX), fill: SHADES[0], text: "#ffffff", label: "Year" }];
    if (tier2 !== "none") out.push({ segments: segmentsForTier(tier2, DOMAIN_MIN, DOMAIN_MAX), fill: SHADES[1], text: "#ffffff", label: tier2 });
    if (tier3 !== "none") out.push({ segments: segmentsForTier(tier3, DOMAIN_MIN, DOMAIN_MAX), fill: SHADES[2], text: "#ffffff", label: tier3 });
    return out;
  }, [tier2, tier3]);

  return (
    <div className="space-y-5">
      <div className="max-w-sm space-y-px overflow-hidden rounded-lg border" style={{ borderColor: "#2b3542" }}>
        <LevelRow depth={1} swatch={SHADES[0]} label="Year" />

        {tier2 !== "none" && (
          <LevelRow depth={2} swatch={SHADES[1]}>
            <Segmented value={tier2} options={[{ value: "quarter", label: "Quarter" }, { value: "month", label: "Month" }]} onChange={(v) => changeTier2(v as Tier2Unit)} />
            <IconButton
              title="Remove Level 2"
              onClick={() => {
                setTier2("none");
                setTier3("none");
              }}
            >
              −
            </IconButton>
            {tier3 === "none" && (
              <IconButton title="Add Level 3" onClick={() => setTier3(tier3Options[0] ?? "none")}>
                +
              </IconButton>
            )}
          </LevelRow>
        )}

        {tier2 === "none" && (
          <div className="flex items-center justify-end px-3 py-2">
            <IconButton title="Add Level 2" onClick={() => setTier2("quarter")}>
              +
            </IconButton>
          </div>
        )}

        {tier2 !== "none" && tier3 !== "none" && (
          <LevelRow depth={3} swatch={SHADES[2]}>
            <Segmented
              value={tier3}
              options={tier3Options.map((o) => ({ value: o, label: o === "month" ? "Month" : "Week" }))}
              onChange={(v) => setTier3(v as Tier3Unit)}
            />
            <IconButton title="Remove Level 3" onClick={() => setTier3("none")}>
              −
            </IconButton>
          </LevelRow>
        )}
      </div>

      <AxisPreview rows={rows} domainMin={DOMAIN_MIN} domainMax={DOMAIN_MAX} />
    </div>
  );
}

function LevelRow({ depth, swatch, label, children }: { depth: 1 | 2 | 3; swatch: string; label?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2" style={{ background: "#161b22" }}>
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: swatch }} />
      <span className="w-14 shrink-0 text-xs opacity-50">L{depth}</span>
      {label ? <span className="flex-1 text-sm" style={{ color: "#e6edf3" }}>{label}</span> : <div className="flex flex-1 items-center gap-2">{children}</div>}
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border" style={{ borderColor: "#3d4753" }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="px-2.5 py-1 text-xs"
          style={{ background: value === o.value ? "#4fa6e9" : "transparent", color: value === o.value ? "#101418" : "#e6edf3" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm leading-none"
      style={{ borderColor: "#3d4753", color: "#e6edf3" }}
    >
      {children}
    </button>
  );
}
