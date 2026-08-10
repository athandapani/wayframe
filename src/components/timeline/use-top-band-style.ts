"use client";

// PROGRAM-band highlight treatment (wayframe#41) — a viewer display
// preference on its own localStorage key, same pattern as
// use-critical-path-style: three named looks, no "off" state (the band
// always carries at least "chip", the least heavy of the three). Prototyped
// as three variants at /dev/roadmap-timeline; all three read well enough to
// keep, so the choice ships as a real style switcher rather than one winner.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:top-band-style";

export type TopBandStyle = "chip" | "border" | "tint";

export const TOP_BAND_STYLES: { id: TopBandStyle; label: string }[] = [
  { id: "chip", label: "Chip" },
  { id: "border", label: "Border" },
  { id: "tint", label: "Tint" },
];

function isStyle(v: unknown): v is TopBandStyle {
  return v === "chip" || v === "border" || v === "tint";
}

const DEFAULT_STYLE: TopBandStyle = "chip";

type Action = { type: "hydrated"; style: TopBandStyle } | { type: "setStyle"; style: TopBandStyle };

function reduce(_state: TopBandStyle, action: Action): TopBandStyle {
  return action.style;
}

export interface UseTopBandStyleResult {
  style: TopBandStyle;
  setStyle: (s: TopBandStyle) => void;
}

export function useTopBandStyle(): UseTopBandStyleResult {
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
