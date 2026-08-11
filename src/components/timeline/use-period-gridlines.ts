"use client";

// Opt-in period-boundary gridlines (wayframe#44/#53) — a viewer display
// preference on its own localStorage key, same pattern as
// use-top-band-style.ts, but with a real "off" state: unlike the top band
// (which always paints at least "chip"), gridlines default on but can be
// turned off entirely.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:period-gridlines";

export type PeriodGridlineStyle = "off" | "segments" | "year-line" | "year-band";

export const PERIOD_GRIDLINE_STYLES: { id: PeriodGridlineStyle; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "segments", label: "Every segment" },
  { id: "year-line", label: "Year line" },
  { id: "year-band", label: "Year band" },
];

function isStyle(v: unknown): v is PeriodGridlineStyle {
  return v === "off" || v === "segments" || v === "year-line" || v === "year-band";
}

// "year-line" (Variant B) wins as the default per #44's verdict.
const DEFAULT_STYLE: PeriodGridlineStyle = "year-line";

type Action = { type: "hydrated"; style: PeriodGridlineStyle } | { type: "setStyle"; style: PeriodGridlineStyle };

function reduce(_state: PeriodGridlineStyle, action: Action): PeriodGridlineStyle {
  return action.style;
}

export interface UsePeriodGridlinesResult {
  style: PeriodGridlineStyle;
  setStyle: (s: PeriodGridlineStyle) => void;
}

export function usePeriodGridlines(): UsePeriodGridlinesResult {
  const [style, dispatch] = useReducer(reduce, DEFAULT_STYLE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isStyle(saved)) dispatch({ type: "hydrated", style: saved });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, style);
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, style]);

  return { style, setStyle: (s) => dispatch({ type: "setStyle", style: s }) };
}
