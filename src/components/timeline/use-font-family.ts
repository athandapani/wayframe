"use client";

// Independent font-family viewer preference (wayframe#42/#50) — its own
// localStorage key, same pattern as use-theme.ts. Deliberately layered OVER
// whichever theme is active rather than folded into Theme.font: #42's
// verdict was that family follows the prototype's Variant A/C model (a
// curated picker independent of theme), not Variant B's (family locked to
// theme). "default" resolves to `undefined` so RoadmapTimeline falls back to
// theme.font — the theme's own choice stays live until a viewer overrides it.
import { useEffect, useReducer, useState } from "react";

export type FontFamilyId = "default" | "system" | "serif" | "mono" | "rounded" | "condensed";

export const FONT_FAMILY_CHOICES: { id: FontFamilyId; label: string; stack?: string }[] = [
  { id: "default", label: "Theme default" },
  { id: "system", label: "System sans", stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: "serif", label: "Editorial serif", stack: "'Georgia', 'Iowan Old Style', serif" },
  { id: "mono", label: "Technical mono", stack: "'Consolas', 'SF Mono', 'Cascadia Code', monospace" },
  { id: "rounded", label: "Rounded humanist", stack: "'Nunito', 'Segoe UI Rounded', 'Segoe UI', sans-serif" },
  { id: "condensed", label: "Condensed", stack: "'Bahnschrift', 'Arial Narrow', sans-serif" },
];

const STACK_BY_ID = new Map(FONT_FAMILY_CHOICES.map((f) => [f.id, f.stack]));

const STORAGE_KEY = "wayframe:font-family";
const DEFAULT_ID: FontFamilyId = "default";

function isFontFamilyId(v: unknown): v is FontFamilyId {
  return typeof v === "string" && STACK_BY_ID.has(v as FontFamilyId);
}

type Action = { type: "hydrated"; id: FontFamilyId } | { type: "setFamily"; id: FontFamilyId };

function reduce(_state: FontFamilyId, action: Action): FontFamilyId {
  return action.id;
}

export interface UseFontFamilyResult {
  familyId: FontFamilyId;
  /** Undefined for "default" — pass straight through to RoadmapTimeline's `fontFamily` prop. */
  fontFamily: string | undefined;
  setFamily: (id: FontFamilyId) => void;
}

export function useFontFamily(): UseFontFamilyResult {
  const [familyId, dispatch] = useReducer(reduce, DEFAULT_ID);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isFontFamilyId(saved)) dispatch({ type: "hydrated", id: saved });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, familyId);
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, familyId]);

  return { familyId, fontFamily: STACK_BY_ID.get(familyId), setFamily: (id) => dispatch({ type: "setFamily", id }) };
}
