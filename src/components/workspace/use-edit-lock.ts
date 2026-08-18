"use client";

// Edit/View mode lock — a viewer display preference,
// same named-style pattern as use-top-band-style.ts. "edit" (the original,
// only behavior) leaves every interactive affordance wired up; "view"
// disables drag/click-to-add/editor-opening for a clean presentation pass
// — RoadmapWorkspace withholds those callback props entirely in "view"
// mode rather than adding a second read-only render path (mirrors how the
// off-screen export capture already renders read-only by omitting the same
// props).
import { useEffect, useReducer, useState } from "react";

export type EditLockMode = "edit" | "view";

const STORAGE_KEY = "wayframe:edit-lock";
const DEFAULT_MODE: EditLockMode = "edit";

function isMode(v: unknown): v is EditLockMode {
  return v === "edit" || v === "view";
}

type Action = { type: "hydrated"; mode: EditLockMode } | { type: "setMode"; mode: EditLockMode };

function reduce(_state: EditLockMode, action: Action): EditLockMode {
  return action.mode;
}

export interface UseEditLockResult {
  mode: EditLockMode;
  setMode: (m: EditLockMode) => void;
}

export function useEditLock(): UseEditLockResult {
  const [mode, dispatch] = useReducer(reduce, DEFAULT_MODE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isMode(saved)) dispatch({ type: "hydrated", mode: saved });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, mode]);

  return { mode, setMode: (m) => dispatch({ type: "setMode", mode: m }) };
}
