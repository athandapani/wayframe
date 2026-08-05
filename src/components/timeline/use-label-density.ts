"use client";

// Marker-label density (prototype/theme-system) — a viewer display
// preference on its own localStorage key, same pattern as use-ghost-mode
// and use-critical-path-style.
import { useEffect, useReducer, useState } from "react";
import type { LabelDensity } from "./title-layout";

const STORAGE_KEY = "wayframe:label-density";

export const LABEL_DENSITIES: { id: LabelDensity; label: string }[] = [
  { id: "all", label: "All" },
  { id: "key", label: "Key only" },
  { id: "none", label: "None" },
];

function isDensity(v: unknown): v is LabelDensity {
  return v === "all" || v === "key" || v === "none";
}

const DEFAULT_DENSITY: LabelDensity = "all";

type Action = { type: "hydrated"; density: LabelDensity } | { type: "setDensity"; density: LabelDensity };

function reduce(_state: LabelDensity, action: Action): LabelDensity {
  return action.density;
}

export interface UseLabelDensityResult {
  density: LabelDensity;
  setDensity: (d: LabelDensity) => void;
}

export function useLabelDensity(): UseLabelDensityResult {
  const [density, dispatch] = useReducer(reduce, DEFAULT_DENSITY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isDensity(saved)) dispatch({ type: "hydrated", density: saved });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, density);
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, density]);

  return { density, setDensity: (d) => dispatch({ type: "setDensity", density: d }) };
}
