"use client";

// Fit to screen (wayframe#94/t20) — a viewer display preference, same
// on/off boolean pattern as use-critical-path-visibility.ts. Replaces the
// old use-auto-lane-height.ts entirely: that one only ever shrank lanes
// below the flat LANE_HEIGHT, using a flat "divide viewport evenly by lane
// count" formula that made no sense once lanes could have their own
// different Lane Row heights (see lane-rows.ts). This one only ever
// expands — content is never forced smaller than its natural height, it
// just scrolls — the vertical sibling to #84/t10's horizontal zoom/
// fit-to-screen. Off by default, same reasoning: RoadmapTimeline's natural
// lane heights are the predictable, export-stable behavior; this trades
// that predictability for "see the whole programme without scrolling" on
// request.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:fit-to-screen";

const DEFAULT_ENABLED = false;

type Action = { type: "hydrated"; enabled: boolean } | { type: "setEnabled"; enabled: boolean };

function reduce(_state: boolean, action: Action): boolean {
  return action.enabled;
}

export interface UseFitToScreenResult {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export function useFitToScreen(): UseFitToScreenResult {
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
