"use client";

// Saved Views (Archer delta v1.4.0) — named snapshots of every viewer
// display preference (§10 of archer-rebuild-spec.md), so a viewer can jump
// between "how I like to read this" setups instead of re-toggling a dozen
// options rows by hand. Same reasoning every one of those preferences is
// already per-viewer localStorage, not document content: a saved view is a
// bundle of that same kind of state, not something that travels with the
// file. Three built-in presets ship read-only; custom views are named by
// the viewer and stored alongside them.
//
// This hook only owns storage/CRUD for the view list — RoadmapWorkspace.tsx
// builds the actual snapshot (it's the one place that holds every
// individual preference hook) and applies one by calling each hook's own
// setter, the same setters the options-menu rows already call directly.
import { useEffect, useReducer, useState } from "react";
import type { ThemeId } from "./theme";
import type { GhostStyle } from "./use-ghost-mode";
import type { AtRiskStyle } from "./RoadmapTimeline";
import type { CriticalPathStyle } from "./use-critical-path-style";
import type { TopBandStyle } from "./use-top-band-style";
import type { PeriodGridlineStyle } from "./use-period-gridlines";
import type { AxisTierConfig } from "./axis-tiers";
import type { LabelDensity } from "./title-layout";
import type { ConnectorStyle } from "./use-connector-style";
import type { ConnectorDash, ConnectorArrow } from "./use-connector-line-style";
import type { PillProgressStyle } from "./use-pill-progress-style";
import type { DateLabelPlacement } from "./use-date-label-placement";

export interface ViewSnapshot {
  themeId?: ThemeId;
  ghostEnabled?: boolean;
  ghostStyle?: GhostStyle;
  atRiskEnabled?: boolean;
  atRiskStyle?: AtRiskStyle;
  criticalPathVisible?: boolean;
  criticalPathStyle?: CriticalPathStyle;
  topBandStyle?: TopBandStyle;
  gridlineStyle?: PeriodGridlineStyle;
  axisTiers?: AxisTierConfig;
  axisYearColor?: string;
  labelDensity?: LabelDensity;
  fontScale?: number;
  fontFamilyId?: string;
  legendOpen?: boolean;
  connectorStyle?: ConnectorStyle;
  connectorDash?: ConnectorDash;
  connectorArrow?: ConnectorArrow;
  todayOverlayEnabled?: boolean;
  pillProgressStyle?: PillProgressStyle;
  autoLaneHeightEnabled?: boolean;
  dateLabelPlacement?: DateLabelPlacement;
  legendCategoryFillEnabled?: boolean;
  swimlaneOwnerVisible?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  builtin: boolean;
  snapshot: ViewSnapshot;
}

/**
 * Hand-tuned combinations, per the delta doc's naming — deliberately not
 * exhaustive (an unset field just leaves that preference at whatever it
 * already was, so applying a preset only changes what it actually cares
 * about).
 */
export const BUILTIN_VIEWS: SavedView[] = [
  {
    id: "builtin-presentation",
    name: "Presentation",
    builtin: true,
    snapshot: { themeId: "press", fontScale: 1.15, gridlineStyle: "off", todayOverlayEnabled: false, legendOpen: false },
  },
  {
    id: "builtin-dense",
    name: "Dense",
    builtin: true,
    snapshot: { fontScale: 0.85, labelDensity: "key", autoLaneHeightEnabled: true, legendOpen: true },
  },
  {
    id: "builtin-minimal",
    name: "Minimal",
    builtin: true,
    snapshot: { gridlineStyle: "off", legendOpen: false, criticalPathStyle: "solid" },
  },
];

const STORAGE_KEY = "wayframe:saved-views";

function isSnapshot(v: unknown): v is ViewSnapshot {
  return typeof v === "object" && v !== null;
}
function isCustomViewArray(v: unknown): v is SavedView[] {
  return Array.isArray(v) && v.every((x) => typeof x === "object" && x !== null && typeof (x as SavedView).id === "string" && typeof (x as SavedView).name === "string" && isSnapshot((x as SavedView).snapshot));
}

type Action = { type: "hydrated"; views: SavedView[] } | { type: "add"; view: SavedView } | { type: "remove"; id: string };

function reduce(state: SavedView[], action: Action): SavedView[] {
  switch (action.type) {
    case "hydrated":
      return action.views;
    case "add":
      return [...state, action.view];
    case "remove":
      return state.filter((v) => v.id !== action.id);
  }
}

export interface UseSavedViewsResult {
  /** Built-in presets followed by custom views, in that order. */
  views: SavedView[];
  customViews: SavedView[];
  addView: (name: string, snapshot: ViewSnapshot, newId: string) => void;
  removeView: (id: string) => void;
}

export function useSavedViews(): UseSavedViewsResult {
  const [customViews, dispatch] = useReducer(reduce, []);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isCustomViewArray(parsed)) dispatch({ type: "hydrated", views: parsed });
      }
    } catch {
      // Corrupt or inaccessible storage — fall back to no custom views.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customViews));
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, customViews]);

  return {
    views: [...BUILTIN_VIEWS, ...customViews],
    customViews,
    addView: (name, snapshot, newId) => dispatch({ type: "add", view: { id: newId, name, builtin: false, snapshot } }),
    removeView: (id) => dispatch({ type: "remove", id }),
  };
}
