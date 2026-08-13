// PROTOTYPE (wayframe#70) — throwaway. Variant A: "Preset ladder".
//
// A vertical list of curated presets (mirrors the existing 4-preset
// AXIS_PRESETS list, extended with two week-inclusive combos), each row
// showing a tiny thumbnail of its own row count. No per-level color
// controls at all — one shared "accent" swatch plus an "auto-shade" toggle
// derives all row colors from a single input via CSS color-mix(), closest
// to today's shared-theme + opacity-ramp mental model.

"use client";

import { useMemo, useState } from "react";
import { yearSegments, segmentsForTier, type Tier } from "@/components/timeline/axis-tiers";
import { AxisPreview, type PreviewRow } from "./AxisPreview";
import { DOMAIN_MIN, DOMAIN_MAX } from "./types";

interface Preset {
  id: string;
  label: string;
  tier2: Tier;
  tier3: Tier;
}

const PRESETS: Preset[] = [
  { id: "year", label: "Year only", tier2: "none", tier3: "none" },
  { id: "year-quarter", label: "Year / Quarter", tier2: "quarter", tier3: "none" },
  { id: "year-month", label: "Year / Month", tier2: "month", tier3: "none" },
  { id: "year-quarter-month", label: "Year / Quarter / Month", tier2: "quarter", tier3: "month" },
  { id: "year-quarter-week", label: "Year / Quarter / Week", tier2: "quarter", tier3: "week" },
  { id: "year-month-week", label: "Year / Month / Week", tier2: "month", tier3: "week" },
];

const ACCENT_DEFAULT = "#1f6fb2";

export function VariantA() {
  const [presetId, setPresetId] = useState("year-quarter");
  const [accent, setAccent] = useState(ACCENT_DEFAULT);
  const [autoShade, setAutoShade] = useState(true);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1];

  const rows: PreviewRow[] = useMemo(() => {
    const shades = autoShade
      ? [accent, `color-mix(in oklab, ${accent} 78%, white)`, `color-mix(in oklab, ${accent} 58%, white)`]
      : [accent, accent, accent];
    const out: PreviewRow[] = [{ segments: yearSegments(DOMAIN_MIN, DOMAIN_MAX), fill: shades[0], text: "#ffffff", label: "Year" }];
    if (preset.tier2 !== "none") {
      out.push({ segments: segmentsForTier(preset.tier2, DOMAIN_MIN, DOMAIN_MAX), fill: shades[1], text: "#ffffff", label: preset.tier2 });
    }
    if (preset.tier3 !== "none") {
      out.push({ segments: segmentsForTier(preset.tier3, DOMAIN_MIN, DOMAIN_MAX), fill: shades[2], text: "#ffffff", label: preset.tier3 });
    }
    return out;
  }, [preset, accent, autoShade]);

  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <div className="space-y-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPresetId(p.id)}
            className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm"
            style={{
              borderColor: p.id === presetId ? accent : "#2b3542",
              background: p.id === presetId ? "rgba(79,166,233,0.1)" : "transparent",
              color: "#e6edf3",
            }}
          >
            <MiniThumb tier2={p.tier2} tier3={p.tier3} />
            <span>{p.label}</span>
          </button>
        ))}

        <div className="mt-4 flex items-center justify-between rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#2b3542", color: "#e6edf3" }}>
          <span className="opacity-70">Accent color</span>
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
            style={{ borderColor: "#2b3542" }}
          />
        </div>
        <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#2b3542", color: "#e6edf3" }}>
          <span className="opacity-70">Auto-shade levels</span>
          <input type="checkbox" checked={autoShade} onChange={(e) => setAutoShade(e.target.checked)} />
        </label>
      </div>

      <AxisPreview rows={rows} domainMin={DOMAIN_MIN} domainMax={DOMAIN_MAX} />
    </div>
  );
}

function MiniThumb({ tier2, tier3 }: { tier2: Tier; tier3: Tier }) {
  const rowCount = 1 + (tier2 !== "none" ? 1 : 0) + (tier3 !== "none" ? 1 : 0);
  return (
    <div className="flex w-10 shrink-0 flex-col gap-[2px]">
      {Array.from({ length: rowCount }).map((_, i) => (
        <div key={i} className="h-1.5 rounded-sm" style={{ background: "currentColor", opacity: 0.7 }} />
      ))}
    </div>
  );
}
