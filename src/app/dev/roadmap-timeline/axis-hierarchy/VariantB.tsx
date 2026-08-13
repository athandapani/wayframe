// PROTOTYPE (wayframe#70) — throwaway. Variant B: "Level stepper".
//
// A horizontal chip builder. Level 1 (Year) is a fixed, locked chip. "+ Add
// level" appends Level 2 with an inline unit <select> and a native color
// swatch (fill only — label text color is auto-derived for contrast rather
// than picked separately). Removing Level 2 cascades and removes Level 3.
// Level 3's unit choices are computed live from Level 2's value, so an
// invalid combination (e.g. Level 2 = Month, Level 3 = Month) is never
// reachable in the UI at all.

"use client";

import { useMemo, useState, type ReactNode } from "react";
import { yearSegments, segmentsForTier } from "@/components/timeline/axis-tiers";
import { AxisPreview, type PreviewRow } from "./AxisPreview";
import { DOMAIN_MIN, DOMAIN_MAX, TIER3_OPTIONS_FOR_TIER2, type Tier2Unit, type Tier3Unit } from "./types";

function textFor(fill: string): string {
  const hex = fill.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#101418" : "#ffffff";
}

export function VariantB() {
  const [tier2, setTier2] = useState<Tier2Unit>("quarter");
  const [tier3, setTier3] = useState<Tier3Unit>("none");
  const [colors, setColors] = useState(["#23384d", "#3a5a78", "#5f86a8"]);

  const tier3Options = TIER3_OPTIONS_FOR_TIER2[tier2];

  function onTier2Change(v: Tier2Unit) {
    setTier2(v);
    if (!TIER3_OPTIONS_FOR_TIER2[v].includes(tier3)) setTier3("none");
  }

  const rows: PreviewRow[] = useMemo(() => {
    const out: PreviewRow[] = [{ segments: yearSegments(DOMAIN_MIN, DOMAIN_MAX), fill: colors[0], text: textFor(colors[0]), label: "Year" }];
    if (tier2 !== "none") {
      out.push({ segments: segmentsForTier(tier2, DOMAIN_MIN, DOMAIN_MAX), fill: colors[1], text: textFor(colors[1]), label: tier2 });
    }
    if (tier3 !== "none") {
      out.push({ segments: segmentsForTier(tier3, DOMAIN_MIN, DOMAIN_MAX), fill: colors[2], text: textFor(colors[2]), label: tier3 });
    }
    return out;
  }, [tier2, tier3, colors]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <LevelChip label="Level 1" swatch={colors[0]} onSwatch={(c) => setColors([c, colors[1], colors[2]])} locked>
          Year
        </LevelChip>

        {tier2 === "none" ? (
          <AddButton onClick={() => setTier2("quarter")} />
        ) : (
          <LevelChip
            label="Level 2"
            swatch={colors[1]}
            onSwatch={(c) => setColors([colors[0], c, colors[2]])}
            onRemove={() => {
              setTier2("none");
              setTier3("none");
            }}
          >
            <select value={tier2} onChange={(e) => onTier2Change(e.target.value as Tier2Unit)} className="bg-transparent text-sm">
              <option value="quarter">Quarter</option>
              <option value="month">Month</option>
            </select>
          </LevelChip>
        )}

        {tier2 !== "none" &&
          (tier3 === "none" ? (
            <AddButton onClick={() => setTier3(tier3Options.find((o) => o !== "none") ?? "none")} />
          ) : (
            <LevelChip label="Level 3" swatch={colors[2]} onSwatch={(c) => setColors([colors[0], colors[1], c])} onRemove={() => setTier3("none")}>
              <select value={tier3} onChange={(e) => setTier3(e.target.value as Tier3Unit)} className="bg-transparent text-sm">
                {tier3Options
                  .filter((o) => o !== "none")
                  .map((o) => (
                    <option key={o} value={o}>
                      {o === "month" ? "Month" : "Week"}
                    </option>
                  ))}
              </select>
            </LevelChip>
          ))}
      </div>

      <AxisPreview rows={rows} domainMin={DOMAIN_MIN} domainMax={DOMAIN_MAX} />
    </div>
  );
}

function LevelChip({
  label,
  swatch,
  onSwatch,
  onRemove,
  locked,
  children,
}: {
  label: string;
  swatch: string;
  onSwatch: (c: string) => void;
  onRemove?: () => void;
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm" style={{ borderColor: "#2b3542", color: "#e6edf3" }}>
      <span className="text-xs opacity-50">{label}</span>
      <span>{children}</span>
      <input
        type="color"
        value={swatch}
        onChange={(e) => onSwatch(e.target.value)}
        aria-label={`${label} color`}
        className="h-5 w-6 cursor-pointer rounded border bg-transparent p-0"
        style={{ borderColor: "#2b3542" }}
      />
      {!locked && onRemove && (
        <button onClick={onRemove} aria-label={`Remove ${label}`} className="opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full border border-dashed px-3 py-1.5 text-sm opacity-70 hover:opacity-100" style={{ borderColor: "#3d4753", color: "#e6edf3" }}>
      + Add level
    </button>
  );
}
