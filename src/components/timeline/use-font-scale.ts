"use client";

// Font-scale system (wayframe#42/#50, revised) — a single viewer preference
// driving text size and the label-collision/width-estimate math together
// (RoadmapWorkspace wires this value into both `fontScale` and
// `metricsScale`, leaving `boxScale` at its default so row/pill/axis
// heights don't scale — Variant C from the #42 prototype, not the Variant B
// shipped originally). Its own localStorage key, same pattern as
// use-top-band-style.ts, persisted independently of use-font-family.ts
// (family and scale are orthogonal choices per #42's verdict).
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:font-scale";

export const FONT_SCALE_MIN = 0.7;
export const FONT_SCALE_MAX = 1.6;
export const FONT_SCALE_STEP = 0.05;
const DEFAULT_SCALE = 1;

function clamp(n: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
}

function isValidScale(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= FONT_SCALE_MIN && v <= FONT_SCALE_MAX;
}

type Action = { type: "hydrated"; scale: number } | { type: "setScale"; scale: number };

function reduce(_state: number, action: Action): number {
  return clamp(action.scale);
}

export interface UseFontScaleResult {
  scale: number;
  setScale: (n: number) => void;
}

export function useFontScale(): UseFontScaleResult {
  const [scale, dispatch] = useReducer(reduce, DEFAULT_SCALE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const parsed = saved === null ? null : Number(saved);
      if (isValidScale(parsed)) dispatch({ type: "hydrated", scale: parsed });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(scale));
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, scale]);

  return { scale, setScale: (n) => dispatch({ type: "setScale", scale: n }) };
}
