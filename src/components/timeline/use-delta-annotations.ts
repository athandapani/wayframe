"use client";

// Viewer display preference for the unified delta-annotation layer (t23,
// wayframe#96) — replaces use-ghost-mode.ts and use-at-risk-style.ts, which
// each persisted their own independent {enabled, style} pair for what used
// to be two independently-rendered systems (slip ghosts and at-risk
// projections). There's only one shared rendering primitive now
// (DeltaGhostMarker in RoadmapTimeline.tsx), so there's no more "style"
// choice to persist — just on/off. Deliberately its own localStorage key,
// not folded into useCorrectionBox's persistence: this is how a viewer
// wants to *see* the timeline, not part of the Program document itself.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:delta-annotations-preference";

// On by default — both predecessor preferences (ghosts, at-risk) defaulted on.
const DEFAULT_ENABLED = true;

type Action = { type: "hydrated"; enabled: boolean } | { type: "setEnabled"; enabled: boolean };

function reduce(state: boolean, action: Action): boolean {
  switch (action.type) {
    case "hydrated":
      return action.enabled;
    case "setEnabled":
      return action.enabled;
  }
}

export interface UseDeltaAnnotationsResult {
  /** Resolved value to pass straight to RoadmapTimeline's deltaAnnotationsEnabled prop. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export function useDeltaAnnotations(): UseDeltaAnnotationsResult {
  const [enabled, dispatch] = useReducer(reduce, DEFAULT_ENABLED);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (typeof parsed === "boolean") dispatch({ type: "hydrated", enabled: parsed });
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
    } catch {
      // Storage full or unavailable (e.g. private browsing) — not worth surfacing.
    }
  }, [hydrated, enabled]);

  return {
    enabled,
    setEnabled: (next) => dispatch({ type: "setEnabled", enabled: next }),
  };
}
