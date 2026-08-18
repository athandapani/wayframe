"use client";

// Per-section collapsed/expanded state for the options-menu accordion —
// same localStorage-preference pattern as every viewer-preference hook
// (e.g. use-ghost-mode.ts): this is how a viewer likes the menu laid out,
// not document content. Defaults land with the sections someone reaches for
// most (Appearance, File) open and the rest tucked away, rather than every
// section open (which is just the old flat list again) or every section
// closed (which hides everything behind an extra click on first use).
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:options-sections";

export type OptionsSectionId = "appearance" | "symbols" | "layout" | "views" | "data";

const DEFAULT_OPEN: Record<OptionsSectionId, boolean> = {
  appearance: true,
  symbols: false,
  layout: false,
  views: false,
  data: false,
};

function isPartialSectionMap(v: unknown): v is Partial<Record<OptionsSectionId, boolean>> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type Action = { type: "hydrated"; sections: Record<OptionsSectionId, boolean> } | { type: "toggle"; id: OptionsSectionId };

function reduce(state: Record<OptionsSectionId, boolean>, action: Action): Record<OptionsSectionId, boolean> {
  switch (action.type) {
    case "hydrated":
      return action.sections;
    case "toggle":
      return { ...state, [action.id]: !state[action.id] };
  }
}

export interface UseOptionsSectionsResult {
  isOpen: (id: OptionsSectionId) => boolean;
  toggle: (id: OptionsSectionId) => void;
}

export function useOptionsSections(): UseOptionsSectionsResult {
  const [sections, dispatch] = useReducer(reduce, DEFAULT_OPEN);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isPartialSectionMap(parsed)) dispatch({ type: "hydrated", sections: { ...DEFAULT_OPEN, ...parsed } });
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
    } catch {
      // Storage full or unavailable (e.g. private browsing) — not worth surfacing.
    }
  }, [hydrated, sections]);

  return {
    isOpen: (id) => sections[id],
    toggle: (id) => dispatch({ type: "toggle", id }),
  };
}
