"use client";

// Legend category-fill / status-outline encoding — a viewer display
// preference, same on/off boolean pattern as
// use-critical-path-visibility.ts.
//
// ON by default since wayframe#143. It was off while the encoding reached
// only POINT milestones: with duration pills painting from their lane tint
// and band phases carrying no categoryId at all, turning it on changed a
// minority of marks and left the chart reading inconsistently, so
// fill=status everywhere was the safer default. #143 extended it to every
// mark kind, which inverts that argument — a document that has gone to the
// trouble of assigning categories should show them without the reader
// first having to find a toggle. A document with no categories is
// unaffected either way: with nothing to tint from, every mark falls
// through to the status ramp exactly as before.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:legend-category-style";

const DEFAULT_ENABLED = true;

type Action = { type: "hydrated"; enabled: boolean } | { type: "setEnabled"; enabled: boolean };

function reduce(_state: boolean, action: Action): boolean {
  return action.enabled;
}

export interface UseLegendCategoryStyleResult {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export function useLegendCategoryStyle(): UseLegendCategoryStyleResult {
  const [enabled, dispatch] = useReducer(reduce, DEFAULT_ENABLED);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) dispatch({ type: "hydrated", enabled: saved === "true" });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, enabled]);

  return { enabled, setEnabled: (e) => dispatch({ type: "setEnabled", enabled: e }) };
}
