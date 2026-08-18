"use client";

// Today progress overlay — a viewer display
// preference, same on/off boolean pattern as use-critical-path-visibility.ts.
// Off by default: it's a second, denser layer of "what's elapsed" reading
// on top of the always-on Today reference line, additive chrome rather
// than something every roadmap needs.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:today-overlay";

const DEFAULT_ENABLED = false;

type Action = { type: "hydrated"; enabled: boolean } | { type: "setEnabled"; enabled: boolean };

function reduce(_state: boolean, action: Action): boolean {
  return action.enabled;
}

export interface UseTodayOverlayResult {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export function useTodayOverlay(): UseTodayOverlayResult {
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
