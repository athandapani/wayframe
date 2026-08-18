"use client";

// Duration-pill %-complete visualization (Archer delta v1.2) — a viewer
// display preference, same named-style pattern as use-top-band-style.ts,
// but with a real "off" state (unlike top-band, most roadmaps don't track
// percentComplete on every pill, so the default has to be "draw pills
// exactly as before").
import { useEffect, useReducer, useState } from "react";

export type PillProgressStyle = "off" | "fill" | "bar" | "hatch";

export const PILL_PROGRESS_STYLES: { id: PillProgressStyle; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "fill", label: "Fill" },
  { id: "bar", label: "Bar" },
  { id: "hatch", label: "Hatch" },
];

function isStyle(v: unknown): v is PillProgressStyle {
  return v === "off" || v === "fill" || v === "bar" || v === "hatch";
}

const STORAGE_KEY = "wayframe:pill-progress-style";
const DEFAULT_STYLE: PillProgressStyle = "off";

type Action = { type: "hydrated"; style: PillProgressStyle } | { type: "setStyle"; style: PillProgressStyle };

function reduce(_state: PillProgressStyle, action: Action): PillProgressStyle {
  return action.style;
}

export interface UsePillProgressStyleResult {
  style: PillProgressStyle;
  setStyle: (s: PillProgressStyle) => void;
}

export function usePillProgressStyle(): UsePillProgressStyleResult {
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
