"use client";

// Marker date-label placement — a viewer display
// preference, same named-style pattern as use-top-band-style.ts. "below"
// is the original fixed-slot-under-the-marker behavior; "inline" places
// the date beside the title's last line instead, for a denser read.
import { useEffect, useReducer, useState } from "react";

export type DateLabelPlacement = "below" | "inline";

export const DATE_LABEL_PLACEMENTS: { id: DateLabelPlacement; label: string }[] = [
  { id: "below", label: "Below" },
  { id: "inline", label: "Inline" },
];

function isPlacement(v: unknown): v is DateLabelPlacement {
  return v === "below" || v === "inline";
}

const STORAGE_KEY = "wayframe:date-label-placement";
const DEFAULT_PLACEMENT: DateLabelPlacement = "below";

type Action = { type: "hydrated"; placement: DateLabelPlacement } | { type: "setPlacement"; placement: DateLabelPlacement };

function reduce(_state: DateLabelPlacement, action: Action): DateLabelPlacement {
  return action.placement;
}

export interface UseDateLabelPlacementResult {
  placement: DateLabelPlacement;
  setPlacement: (p: DateLabelPlacement) => void;
}

export function useDateLabelPlacement(): UseDateLabelPlacementResult {
  const [placement, dispatch] = useReducer(reduce, DEFAULT_PLACEMENT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isPlacement(saved)) dispatch({ type: "hydrated", placement: saved });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, placement);
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, placement]);

  return { placement, setPlacement: (p) => dispatch({ type: "setPlacement", placement: p }) };
}
