"use client";

// Per-category show/hide (t22, per CONTEXT.md #76) — a viewer preference,
// not document content, same "how a viewer wants to *see* the timeline"
// posture as use-legend-category-style.ts/use-delta-annotations.ts: two
// collaborators plausibly want different category filters live at once, so
// this stays unsynced localStorage state rather than living on the
// Portfolio/Program document (unlike Swimlane.hidden, which IS document
// content — see Swimlane.hidden's own doc in types.ts). A category filtered
// out here stays in the shared layout/collision computation for everyone;
// it's merely unpainted for the filtering viewer, so item positions never
// shift based on anyone's personal filter.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:hidden-categories";

type Action = { type: "hydrated"; ids: Set<string> } | { type: "toggle"; id: string };

function reduce(state: Set<string>, action: Action): Set<string> {
  switch (action.type) {
    case "hydrated":
      return action.ids;
    case "toggle": {
      const next = new Set(state);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return next;
    }
  }
}

export interface UseHiddenCategoriesResult {
  hiddenIds: Set<string>;
  toggle: (id: string) => void;
  isHidden: (id: string) => boolean;
}

export function useHiddenCategories(): UseHiddenCategoriesResult {
  const [hiddenIds, dispatch] = useReducer(reduce, new Set<string>());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) dispatch({ type: "hydrated", ids: new Set(JSON.parse(saved)) });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default (nothing hidden) silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...hiddenIds]));
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, hiddenIds]);

  return {
    hiddenIds,
    toggle: (id) => dispatch({ type: "toggle", id }),
    isHidden: (id) => hiddenIds.has(id),
  };
}
