"use client";

// Connector line dash + arrowhead (Archer delta v1.1) — a viewer display
// preference, same enabled/style-pair pattern as use-ghost-mode.ts: `dash`
// and `arrow` persist independently so changing one doesn't reset the
// other. Applies to the ordinary (non-critical, non-traced) connector
// stroke only — critical-path and trace connectors keep their own fixed
// treatments (see RoadmapTimeline.tsx's criticalStroke/theme.traceColor),
// same reasoning ChartLegend already documents for why critical is always
// red: a viewer-chosen style shouldn't be able to make "this paces the
// program" ambiguous.
import { useEffect, useReducer, useState } from "react";

export type ConnectorDash = "solid" | "dashed" | "dotted";
export type ConnectorArrow = "standard" | "open" | "circle";

export const CONNECTOR_DASHES: { id: ConnectorDash; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
];

export const CONNECTOR_ARROWS: { id: ConnectorArrow; label: string }[] = [
  { id: "standard", label: "Arrow" },
  { id: "open", label: "Open" },
  { id: "circle", label: "Circle" },
];

/** stroke-dasharray for each dash choice; undefined = solid (no dasharray attribute). */
export const CONNECTOR_DASH_ARRAY: Record<ConnectorDash, string | undefined> = {
  solid: undefined,
  dashed: "6 3",
  dotted: "1.5 2.5",
};

const STORAGE_KEY = "wayframe:connector-line-style";

interface ConnectorLineStyle {
  dash: ConnectorDash;
  arrow: ConnectorArrow;
}

const DEFAULT_STYLE: ConnectorLineStyle = { dash: "solid", arrow: "standard" };

function isConnectorLineStyle(v: unknown): v is ConnectorLineStyle {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (s.dash === "solid" || s.dash === "dashed" || s.dash === "dotted") && (s.arrow === "standard" || s.arrow === "open" || s.arrow === "circle");
}

type Action = { type: "hydrated"; style: ConnectorLineStyle } | { type: "setDash"; dash: ConnectorDash } | { type: "setArrow"; arrow: ConnectorArrow };

function reduce(state: ConnectorLineStyle, action: Action): ConnectorLineStyle {
  switch (action.type) {
    case "hydrated":
      return action.style;
    case "setDash":
      return { ...state, dash: action.dash };
    case "setArrow":
      return { ...state, arrow: action.arrow };
  }
}

export interface UseConnectorLineStyleResult {
  dash: ConnectorDash;
  arrow: ConnectorArrow;
  setDash: (dash: ConnectorDash) => void;
  setArrow: (arrow: ConnectorArrow) => void;
}

export function useConnectorLineStyle(): UseConnectorLineStyleResult {
  const [pref, dispatch] = useReducer(reduce, DEFAULT_STYLE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isConnectorLineStyle(parsed)) dispatch({ type: "hydrated", style: parsed });
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, pref]);

  return {
    dash: pref.dash,
    arrow: pref.arrow,
    setDash: (dash) => dispatch({ type: "setDash", dash }),
    setArrow: (arrow) => dispatch({ type: "setArrow", arrow }),
  };
}
