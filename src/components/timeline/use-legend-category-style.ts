"use client";

// Legend category-fill / status-outline encoding — a viewer display
// preference, same on/off boolean pattern as
// use-critical-path-visibility.ts.
//
// ON by default since wayframe#143. It was off while the encoding reached
// only POINT milestones: with duration pills painting from their lane tint
// and band phases carrying no categoryId at all, turning it on changed a
// minority of marks and left the chart reading inconsistently, so
// fill=status everywhere was the safer default. #143 extended it to every
// mark kind, which inverts that argument — a document that has gone to the
// trouble of assigning categories should show them without the reader
// first having to find a toggle. A document with no categories is
// unaffected either way: with nothing to tint from, every mark falls
// through to the status ramp exactly as before.
//
// Two things about the storage below are load-bearing (wayframe#147). #143
// flipped the default to ON and nobody saw it, because this hook used to
// write the CURRENT value back on every hydrate — so every browser that had
// ever loaded the app carried a stored "false", and a stored value always
// won. Nothing distinguished "never touched this" from "deliberately turned
// it off", which is the whole reason a default change couldn't reach the
// people who would notice it. So:
//
//  1. A value is written ONLY when the viewer actually toggles. A stored
//     value now means a real choice, which is what makes honouring it over
//     the default correct.
//  2. DEFAULT_VERSION stamps which default a stored value was chosen
//     against. A value stored under an older stamp was written by the old
//     write-on-hydrate regime, so it cannot be trusted to mean a choice —
//     it is discarded once and the current default applies. Bump the stamp
//     whenever DEFAULT_ENABLED changes; that is what makes the change reach
//     existing browsers rather than only brand-new ones.
import { useEffect, useReducer } from "react";

const STORAGE_KEY = "wayframe:legend-category-style";
/** Which default a stored value was chosen against — see this file's header. */
const VERSION_KEY = `${STORAGE_KEY}:default-v`;
const DEFAULT_VERSION = "2";

const DEFAULT_ENABLED = true;

type Action = { type: "hydrated"; enabled: boolean } | { type: "setEnabled"; enabled: boolean };

function reduce(_state: boolean, action: Action): boolean {
  return action.enabled;
}

export interface UseLegendCategoryStyleResult {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export function useLegendCategoryStyle(): UseLegendCategoryStyleResult {
  const [enabled, dispatch] = useReducer(reduce, DEFAULT_ENABLED);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const version = window.localStorage.getItem(VERSION_KEY);
      if (version !== DEFAULT_VERSION) {
        // Stored before this hook knew the difference between a choice and
        // a default — drop it and let the current default through. Stamped
        // so this happens exactly once per browser, not on every load.
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.setItem(VERSION_KEY, DEFAULT_VERSION);
      } else if (saved !== null) {
        dispatch({ type: "hydrated", enabled: saved === "true" });
      }
    } catch {
      // Corrupt or inaccessible storage — fall back to the default silently.
    }
  }, []);

  return {
    enabled,
    setEnabled: (e) => {
      dispatch({ type: "setEnabled", enabled: e });
      // Written here rather than in an effect on `enabled`: only a real
      // toggle should leave a stored value behind (see this file's header).
      try {
        window.localStorage.setItem(STORAGE_KEY, String(e));
        window.localStorage.setItem(VERSION_KEY, DEFAULT_VERSION);
      } catch {
        // Storage full or unavailable — not worth surfacing.
      }
    },
  };
}
