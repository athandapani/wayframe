"use client";

// Viewer display preference for ghost-rendering slipped milestones
// (wayframe#29/#30) — deliberately its own localStorage key, not folded
// into useCorrectionBox's persistence: this is how a viewer wants to *see*
// the timeline, not part of the RoadmapData document itself. `enabled` and
// `style` persist independently so turning ghosts off and back on doesn't
// forget which style was chosen.
import { useEffect, useReducer, useState } from "react";
import type { GhostMode } from "./RoadmapTimeline";

export type GhostStyle = Exclude<GhostMode, "off">;

const STORAGE_KEY = "wayframe:ghost-preference";

interface GhostPreference {
  enabled: boolean;
  style: GhostStyle;
}

// On by default, style "badge" won #29's prototype.
const DEFAULT_PREF: GhostPreference = { enabled: true, style: "badge" };

function isGhostPreference(value: unknown): value is GhostPreference {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.enabled === "boolean" && (v.style === "badge" || v.style === "outline");
}

type Action = { type: "hydrated"; pref: GhostPreference } | { type: "setEnabled"; enabled: boolean } | { type: "setStyle"; style: GhostStyle };

function reduce(state: GhostPreference, action: Action): GhostPreference {
  switch (action.type) {
    case "hydrated":
      return action.pref;
    case "setEnabled":
      return { ...state, enabled: action.enabled };
    case "setStyle":
      return { ...state, style: action.style };
  }
}

export interface UseGhostModeResult {
  /** Resolved mode to pass straight to RoadmapTimeline's ghostMode prop. */
  mode: GhostMode;
  enabled: boolean;
  style: GhostStyle;
  setEnabled: (enabled: boolean) => void;
  setStyle: (style: GhostStyle) => void;
}

export function useGhostMode(): UseGhostModeResult {
  const [pref, dispatch] = useReducer(reduce, DEFAULT_PREF);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isGhostPreference(parsed)) dispatch({ type: "hydrated", pref: parsed });
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
