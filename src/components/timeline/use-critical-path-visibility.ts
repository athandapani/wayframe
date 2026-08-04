"use client";

// Viewer display preference for critical-path highlighting (wayframe#34/#35)
// — deliberately its own localStorage key, same pattern as use-ghost-mode.ts:
// this is how a viewer wants to *see* the timeline, not part of the
// RoadmapData document itself (isCriticalPath/isCriticalPathOverride stay
// document content, computed regardless of this toggle).
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:critical-path-visible";

// On by default, per wayframe#34/#35's resolution.
const DEFAULT_VISIBLE = true;

type Action = { type: "hydrated"; visible: boolean } | { type: "setVisible"; visible: boolean };

function reduce(state: boolean, action: Action): boolean {
  return action.visible;
}

export interface UseCriticalPathVisibilityResult {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export function useCriticalPathVisibility(): UseCriticalPathVisibilityResult {
  const [visible, dispatch] = useReducer(reduce, DEFAULT_VISIBLE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) dispatch({ type: "hydrated", visible: saved === "true" });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(visible));
    } catch {
      // Storage full or unavailable (e.g. private browsing) — not worth surfacing.
    }
  }, [hydrated, visible]);

  return { visible, setVisible: (v) => dispatch({ type: "setVisible", visible: v }) };
}
