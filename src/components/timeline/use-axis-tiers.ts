"use client";

// Configurable axis hierarchy (wayframe#70) — level count/units chosen via
// the timeline-edge disclosure triangles, Year color via the Options menu;
// Levels 2/3 are always derived shades of it, never independently colored.
// A viewer display preference like every other axis/band/line-style
// control in this file (gridlines, top band, critical-path style, ...),
// not document content — see use-period-gridlines.ts for the same
// hydrate-then-persist template this follows.
import { useEffect, useReducer, useState } from "react";
import { tier3OptionsFor, type AxisTierConfig, type Tier } from "./axis-tiers";
import { defaultTheme } from "./theme";

const STORAGE_KEY = "wayframe:axis-tiers";

interface AxisTierPreference {
  tier2: Tier;
  tier3: Tier;
  yearColor: string;
}

// "Year / Quarter" matches the AXIS_PRESETS[1] default RoadmapTimeline
// already fell back to before this hook existed.
const DEFAULT_PREF: AxisTierPreference = { tier2: "quarter", tier3: "none", yearColor: defaultTheme.axisBg };

function isTier(v: unknown): v is Tier {
  return v === "none" || v === "quarter" || v === "month" || v === "week";
}

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function isAxisTierPreference(value: unknown): value is AxisTierPreference {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isTier(v.tier2) && isTier(v.tier3) && isHexColor(v.yearColor);
}

type Action = { type: "hydrated"; pref: AxisTierPreference } | { type: "setTiers"; tier2: Tier; tier3: Tier } | { type: "setYearColor"; color: string };

function reduce(state: AxisTierPreference, action: Action): AxisTierPreference {
  switch (action.type) {
    case "hydrated":
      return action.pref;
    case "setTiers":
      return { ...state, tier2: action.tier2, tier3: action.tier3 };
    case "setYearColor":
      return { ...state, yearColor: action.color };
  }
}

export interface UseAxisTiersResult {
  /** Ready to pass straight to RoadmapTimeline's axisTiers prop. */
  config: AxisTierConfig;
  yearColor: string;
  /** Pass straight to RoadmapTimeline's onAxisTiersChange — it already resolves the next {tier2, tier3}. */
  setTiers: (next: AxisTierConfig) => void;
  setYearColor: (color: string) => void;
}

export function useAxisTiers(): UseAxisTiersResult {
  const [pref, dispatch] = useReducer(reduce, DEFAULT_PREF);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isAxisTierPreference(parsed)) dispatch({ type: "hydrated", pref: parsed });
      }
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
    } catch {
      // Storage full or unavailable (e.g. private browsing) — not worth surfacing.
    }
  }, [hydrated, pref]);

  return {
    config: { key: "custom", label: "Custom", tier2: pref.tier2, tier3: pref.tier3 },
    yearColor: pref.yearColor,
    setTiers: (next) => {
      // Re-validate here too, not just in RoadmapTimeline's click handlers —
      // this hook is the source of truth and shouldn't trust every caller.
      const tier2 = next.tier2 === "quarter" || next.tier2 === "month" ? next.tier2 : "none";
      const tier3 = tier3OptionsFor(tier2).includes(next.tier3) ? next.tier3 : "none";
      dispatch({ type: "setTiers", tier2, tier3 });
    },
    setYearColor: (color) => dispatch({ type: "setYearColor", color }),
  };
}
