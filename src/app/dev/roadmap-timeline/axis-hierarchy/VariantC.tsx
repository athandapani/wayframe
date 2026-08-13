// PROTOTYPE (wayframe#70) — throwaway. Variant C: "Settings matrix".
//
// A dense 3-row settings table (Level 1/2/3 x Unit x Color), each row gated
// by a leading checkbox rather than a preset or a cascade-remove — Level 3's
// checkbox is disabled until Level 2 is checked, and its unit options are
// filtered by Level 2's value either way. Color is a curated 6-swatch
// palette (generated the same OKLCH way as swimlane colors, not a free
// picker) plus a "reset to theme" escape hatch, and a single top-level
// segmented control decides whether the chosen color paints the band fill,
// the label text, or both — most "admin panel" of the three.

"use client";

import { useMemo, useState } from "react";
import { yearSegments, segmentsForTier } from "@/components/timeline/axis-tiers";
import { laneColorAt } from "@/components/timeline/lane-colors";
import { AxisPreview, type PreviewRow } from "./AxisPreview";
import { DOMAIN_MIN, DOMAIN_MAX, TIER3_OPTIONS_FOR_TIER2, type Tier2Unit, type Tier3Unit } from "./types";

const SWATCH_RAMP = { L: 0.58, C: 0.13, startHue: 250 };
const SWATCHES = Array.from({ length: 6 }, (_, i) => laneColorAt(SWATCH_RAMP, i, 6));
const THEME_DEFAULT = ["#23384d", "#23384d", "#23384d"];

type Target = "fill" | "text" | "both";

interface RowState {
  enabled: boolean;
  unit: string;
  color: string | null; // null = theme default
}

export function VariantC() {
  const [target, setTarget] = useState<Target>("fill");
  const [l2, setL2] = useState<RowState>({ enabled: true, unit: "quarter", color: null });
  const [l3, setL3] = useState<RowState>({ enabled: false, unit: "month", color: null });

  const tier2: Tier2Unit = l2.enabled ? (l2.unit as Tier2Unit) : "none";
  const tier3Options = TIER3_OPTIONS_FOR_TIER2[tier2].filter((o) => o !== "none");

  const rows: PreviewRow[] = useMemo(() => {
    const applyFill = target === "fill" || target === "both";
    const applyText = target === "text" || target === "both";
    const baseText = "#ffffff";
    const out: PreviewRow[] = [{ segments: yearSegments(DOMAIN_MIN, DOMAIN_MAX), fill: THEME_DEFAULT[0], text: baseText, label: "Year" }];
    if (l2.enabled) {
      const c = l2.color ?? THEME_DEFAULT[1];
      out.push({
        segments: segmentsForTier(l2.unit as Tier2Unit, DOMAIN_MIN, DOMAIN_MAX),
        fill: applyFill ? c : THEME_DEFAULT[1],
        text: applyText ? c : baseText,
        label: l2.unit,
      });
    }
    if (l2.enabled && l3.enabled) {
      const c = l3.color ?? THEME_DEFAULT[2];
      out.push({
        segments: segmentsForTier(l3.unit as Tier3Unit, DOMAIN_MIN, DOMAIN_MAX),
        fill: applyFill ? c : THEME_DEFAULT[2],
        text: applyText ? c : baseText,
        label: l3.unit,
      });
    }
    return out;
  }, [l2, l3, target]);

  function onL2UnitChange(unit: string) {
    setL2({ ...l2, unit });
    if (!TIER3_OPTIONS_FOR_TIER2[unit as Tier2Unit].includes(l3.unit as Tier3Unit)) {
      setL3({ ...l3, enabled: false });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm" style={{ color: "#e6edf3" }}>
        <span className="opacity-70">Apply color to:</span>
        <div className="flex overflow-hidden rounded-full border" style={{ borderColor: "#2b3542" }}>
          {(["fill", "text", "both"] as Target[]).map((t) => (
            <button
              key={t}
              onClick={() => setTarget(t)}
              className="px-3 py-1 capitalize"
              style={{ background: target === t ? "#4fa6e9" : "transparent", color: target === t ? "#101418" : "#e6edf3" }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <table className="w-full border-collapse text-sm" style={{ color: "#e6edf3" }}>
        <thead>
          <tr className="text-left opacity-60">
            <th className="pb-2 font-normal">Level</th>
            <th className="pb-2 font-normal">Unit</th>
            <th className="pb-2 font-normal">Color</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t" style={{ borderColor: "#2b3542" }}>
            <td className="py-2 opacity-50">Level 1</td>
            <td className="py-2">Year</td>
            <td className="py-2 opacity-50">theme default</td>
          </tr>
          <MatrixRow
            label="Level 2"
            row={l2}
            unitOptions={[
              { value: "quarter", label: "Quarter" },
              { value: "month", label: "Month" },
            ]}
            onToggle={(enabled) => setL2({ ...l2, enabled })}
            onUnit={onL2UnitChange}
            onColor={(color) => setL2({ ...l2, color })}
          />
          <MatrixRow
            label="Level 3"
            row={l3}
            disabled={!l2.enabled}
            unitOptions={tier3Options.map((o) => ({ value: o, label: o === "month" ? "Month" : "Week" }))}
            onToggle={(enabled) => setL3({ ...l3, enabled })}
            onUnit={(unit) => setL3({ ...l3, unit })}
            onColor={(color) => setL3({ ...l3, color })}
          />
        </tbody>
      </table>

      <AxisPreview rows={rows} domainMin={DOMAIN_MIN} domainMax={DOMAIN_MAX} />
    </div>
  );
}

function MatrixRow({
  label,
  row,
  unitOptions,
  disabled,
  onToggle,
  onUnit,
  onColor,
}: {
  label: string;
  row: RowState;
  unitOptions: { value: string; label: string }[];
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
  onUnit: (unit: string) => void;
  onColor: (color: string | null) => void;
}) {
  return (
    <tr className="border-t" style={{ borderColor: "#2b3542", opacity: disabled ? 0.4 : 1 }}>
      <td className="py-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={row.enabled} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
          {label}
        </label>
      </td>
      <td className="py-2">
        <select value={row.unit} disabled={disabled || !row.enabled} onChange={(e) => onUnit(e.target.value)} className="bg-transparent">
          {unitOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2">
        <div className="flex items-center gap-1">
          {SWATCHES.map((s) => (
            <button
              key={s}
              disabled={disabled || !row.enabled}
              onClick={() => onColor(s)}
              aria-label={`Set ${label} color to ${s}`}
              className="h-5 w-5 rounded-full border-2"
              style={{ background: s, borderColor: row.color === s ? "#ffffff" : "transparent" }}
            />
          ))}
          <button disabled={disabled || !row.enabled} onClick={() => onColor(null)} className="ml-1 text-xs opacity-60 hover:opacity-100">
            reset
          </button>
        </div>
      </td>
    </tr>
  );
}
