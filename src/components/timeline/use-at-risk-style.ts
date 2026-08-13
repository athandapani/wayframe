"use client";

// Viewer display preference for the forward-looking slip-risk projection
// (wayframe#61/#72) — mirrors use-ghost-mode.ts exactly: its own localStorage
// key, not folded into useCorrectionBox's persistence, since this is how a
// viewer wants to *see* the timeline, not part of the RoadmapData document
// itself. `enabled` and `style` persist independently so turning the
// projection off and back on doesn't forget which style was chosen.
import { useEffect, useReducer, useState } from "react";
import type { AtRiskMode, AtRiskStyle } from "./RoadmapTimeline";

const STORAGE_KEY = "wayframe:at-risk-preference";

interface AtRiskPreference {
  enabled: boolean;
  style: AtRiskStyle;
}

// On by default, "sibling" (closest to the established ghost-badge look) as
// the least-surprising starting style — #61's prototype resolution kept all
// three rather than picking a winner.
const DEFAULT_PREF: AtRiskPreference = { enabled: true, style: "sibling" };

function isAtRiskPreference(value: unknown): value is AtRiskPreference {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.enabled === "boolean" && (v.style === "sibling" || v.style === "comet" || v.style === "zone");
}

type Action = { type: "hydrated"; pref: AtRiskPreference } | { type: "setEnabled"; enabled: boolean } | { type: "setStyle"; style: AtRiskStyle };

function reduce(state: AtRiskPreference, action: Action): AtRiskPreference {
  switch (action.type) {
    case "hydrated":
      return action.pref;
    case "setEnabled":
      return { ...state, enabled: action.enabled };
    case "setStyle":
      return { ...state, style: action.style };
  }
}

export interface UseAtRiskStyleResult {
  /** Resolved mode to pass straight to RoadmapTimeline's atRiskMode prop. */
  mode: AtRiskMode;
  enabled: boolean;
  style: AtRiskStyle;
  setEnabled: (enabled: boolean) => void;
  setStyle: (style: AtRiskStyle) => void;
}

export function useAtRiskStyle(): UseAtRiskStyleResult {
  const [pref, dispatch] = useReducer(reduce, DEFAULT_PREF);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isAtRiskPreference(parsed)) dispatch({ type: "hydrated", pref: parsed });
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
    mode: pref.enabled ? pref.style : "off",
    enabled: pref.enabled,
    style: pref.style,
    setEnabled: (enabled) => dispatch({ type: "setEnabled", enabled }),
    setStyle: (style) => dispatch({ type: "setStyle", style }),
  };
}
