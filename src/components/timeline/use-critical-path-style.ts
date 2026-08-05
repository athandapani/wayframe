"use client";

// Critical-path line style (prototype/theme-system) — a viewer display
// preference on its own localStorage key, same pattern as use-ghost-mode
// and use-critical-path-visibility.
//
// "double" is drawn as a wide stroke with a narrower ground-coloured
// stroke painted over it, rather than as two offset paths: the connectors
// are orthogonal elbows, and offsetting an elbow correctly needs real path
// insetting. Overprinting gives the same read for any path shape.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:critical-path-style";

export type CriticalPathStyle = "solid" | "thick" | "dashed" | "double";

export const CRITICAL_PATH_STYLES: { id: CriticalPathStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "thick", label: "Thick" },
  { id: "dashed", label: "Dashed" },
  { id: "double", label: "Double" },
];

function isStyle(v: unknown): v is CriticalPathStyle {
  return v === "solid" || v === "thick" || v === "dashed" || v === "double";
}

const DEFAULT_STYLE: CriticalPathStyle = "thick";

type Action = { type: "hydrated"; style: CriticalPathStyle } | { type: "setStyle"; style: CriticalPathStyle };

function reduce(_state: CriticalPathStyle, action: Action): CriticalPathStyle {
  return action.style;
}

export interface UseCriticalPathStyleResult {
  style: CriticalPathStyle;
  setStyle: (s: CriticalPathStyle) => void;
}

export function useCriticalPathStyle(): UseCriticalPathStyleResult {
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
