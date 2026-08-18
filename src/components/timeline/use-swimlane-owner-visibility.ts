"use client";

// Swimlane.owner display toggle — a viewer display
// preference, same on/off boolean pattern as use-critical-path-visibility.ts.
// The owner name itself is document content (Swimlane.owner); whether a
// given viewer wants it cluttering the lane header is not.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:swimlane-owner-visible";

const DEFAULT_VISIBLE = true;

type Action = { type: "hydrated"; visible: boolean } | { type: "setVisible"; visible: boolean };

function reduce(_state: boolean, action: Action): boolean {
  return action.visible;
}

export interface UseSwimlaneOwnerVisibilityResult {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export function useSwimlaneOwnerVisibility(): UseSwimlaneOwnerVisibilityResult {
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
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, visible]);

  return { visible, setVisible: (v) => dispatch({ type: "setVisible", visible: v }) };
}
