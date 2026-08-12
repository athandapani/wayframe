"use client";

// So-what (BLUF) panel fill styling (wayframe#43/#52) — a viewer display
// preference on its own localStorage key, same pattern as
// use-top-band-style. Unlike the panel's position (also viewer-local, see
// BlufCallout), a custom fill isn't part of the default look, so this one
// carries an explicit "off" state (`color: null`) that falls back to the
// active theme's `panelBg`.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:so-what-style";

export interface SoWhatStyle {
  /** Hex (`#rrggbb`), overriding `theme.panelBg` outright when set. `null` defers to the theme. */
  color: string | null;
  /** 0 (opaque) to 100 (fully see-through) — applied as an alpha channel on top of whichever background is active. */
  transparency: number;
}

const DEFAULT_STYLE: SoWhatStyle = { color: null, transparency: 0 };

function isStyle(v: unknown): v is SoWhatStyle {
  return (
    typeof v === "object" &&
    v !== null &&
    (typeof (v as SoWhatStyle).color === "string" || (v as SoWhatStyle).color === null) &&
    typeof (v as SoWhatStyle).transparency === "number"
  );
}

type Action = { type: "hydrated"; style: SoWhatStyle } | { type: "setColor"; color: string | null } | { type: "setTransparency"; transparency: number } | { type: "reset" };

function reduce(state: SoWhatStyle, action: Action): SoWhatStyle {
  switch (action.type) {
    case "hydrated":
      return action.style;
    case "setColor":
      return { ...state, color: action.color };
    case "setTransparency":
      return { ...state, transparency: action.transparency };
    case "reset":
      return DEFAULT_STYLE;
  }
}

export interface UseSoWhatStyleResult extends SoWhatStyle {
  setColor: (color: string | null) => void;
  setTransparency: (transparency: number) => void;
  reset: () => void;
}

export function useSoWhatStyle(): UseSoWhatStyleResult {
  const [style, dispatch] = useReducer(reduce, DEFAULT_STYLE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, style]);

  return {
    ...style,
    setColor: (color) => dispatch({ type: "setColor", color }),
    setTransparency: (transparency) => dispatch({ type: "setTransparency", transparency }),
    reset: () => dispatch({ type: "reset" }),
  };
}
