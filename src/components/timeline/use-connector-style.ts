"use client";

// Dependency-connector shape (Archer delta v1.3.0) — a viewer display
// preference on its own localStorage key, same pattern as
// use-top-band-style.ts: three named looks, no "off" state (a connector
// always draws in one of these three shapes once it's decided to draw at
// all — see RoadmapTimeline's own showConnector/critical/traced gate for
// whether it draws).
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:connector-style";

export type ConnectorStyle = "elbow" | "s-curve" | "rounded";

export const CONNECTOR_STYLES: { id: ConnectorStyle; label: string }[] = [
  { id: "elbow", label: "Elbow" },
  { id: "s-curve", label: "S-curve" },
  { id: "rounded", label: "Rounded" },
];

function isStyle(v: unknown): v is ConnectorStyle {
  return v === "elbow" || v === "s-curve" || v === "rounded";
}

const DEFAULT_STYLE: ConnectorStyle = "elbow";

type Action = { type: "hydrated"; style: ConnectorStyle } | { type: "setStyle"; style: ConnectorStyle };

function reduce(_state: ConnectorStyle, action: Action): ConnectorStyle {
  return action.style;
}

export interface UseConnectorStyleResult {
  style: ConnectorStyle;
  setStyle: (s: ConnectorStyle) => void;
}

export function useConnectorStyle(): UseConnectorStyleResult {
  const [style, dispatch] = useReducer(reduce, DEFAULT_STYLE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isStyle(saved)) dispatch({ type: "hydrated", style: saved });
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, style);
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, style]);

  return { style, setStyle: (s) => dispatch({ type: "setStyle", style: s }) };
}
