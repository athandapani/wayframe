"use client";

// Viewer theme preference (prototype/theme-system) — its own localStorage
// key, same pattern as use-ghost-mode.ts and use-critical-path-visibility.ts:
// how a viewer wants the chart to *look* is a display preference, not part
// of the RoadmapData document.
//
// Note the one thing that IS document content: Swimlane.color. A lane whose
// colour has been pinned keeps it across theme switches; unpinned lanes
// re-derive from the active theme's palette. See laneColor() in
// RoadmapTimeline.
import { useEffect, useReducer, useState } from "react";
import { THEMES, defaultTheme, type Theme, type ThemeId } from "./theme";

const STORAGE_KEY = "wayframe:theme";

function isThemeId(v: unknown): v is ThemeId {
  return v === "blueprint" || v === "graphite" || v === "press";
}

type Action = { type: "hydrated"; id: ThemeId } | { type: "setTheme"; id: ThemeId };

function reduce(_state: ThemeId, action: Action): ThemeId {
  return action.id;
}

export interface UseThemeResult {
  themeId: ThemeId;
  theme: Theme;
  setTheme: (id: ThemeId) => void;
}

export function useTheme(): UseThemeResult {
  const [themeId, dispatch] = useReducer(reduce, defaultTheme.id);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isThemeId(saved)) dispatch({ type: "hydrated", id: saved });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      // Storage full or unavailable (e.g. private browsing) — not worth surfacing.
    }
  }, [hydrated, themeId]);

  return { themeId, theme: THEMES[themeId], setTheme: (id) => dispatch({ type: "setTheme", id }) };
}
