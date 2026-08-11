"use client";

// Persistence for the generalized drag-to-reposition-with-connector
// affordance (wayframe#47, generalizing the reference-line-only mechanism
// wayframe#51 shipped) — reference-line chips, ghost badges, and marker
// title/date labels all commit their manual (dx, dy) nudge here, keyed by a
// per-element id ("title-<milestoneId>", "date-<milestoneId>",
// "ghost-<milestoneId>", "ref-<id>", "ann-<id>", "today").
//
// Viewer-local, same tier as ghost-mode/top-band-style/gridlines — a
// declutter nudge changes how the chart reads for the person dragging it,
// not what the roadmap says, so it doesn't belong in the document. #51 left
// this exact question open by never persisting its drag state at all (pure
// in-memory React state, reset on reload); this closes that gap the same
// way every other viewer preference in this file already resolved it.
//
// Ids are milestone/reference-line nanoids, effectively globally unique, so
// one un-namespaced key is fine — no per-document scoping like a real
// document-content field would need.
import { useEffect, useReducer, useState } from "react";

const STORAGE_KEY = "wayframe:label-overrides";

export interface LabelOffset {
  dx: number;
  dy: number;
}

function isOffset(v: unknown): v is LabelOffset {
  return typeof v === "object" && v !== null && typeof (v as LabelOffset).dx === "number" && typeof (v as LabelOffset).dy === "number";
}

function parseStored(raw: string | null): Record<string, LabelOffset> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, LabelOffset> = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isOffset(v)) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

type Action = { type: "hydrated"; overrides: Record<string, LabelOffset> } | { type: "add"; id: string; delta: LabelOffset };

function reduce(state: Record<string, LabelOffset>, action: Action): Record<string, LabelOffset> {
  if (action.type === "hydrated") return action.overrides;
  const prev = state[action.id] ?? { dx: 0, dy: 0 };
  return { ...state, [action.id]: { dx: prev.dx + action.delta.dx, dy: prev.dy + action.delta.dy } };
}

export interface UseLabelOverridesResult {
  overrides: Record<string, LabelOffset>;
  /** Commits a manual nudge on top of whatever the id already had (drag deltas accumulate, mirroring #51's endRefDrag). */
  addOverride: (id: string, delta: LabelOffset) => void;
}

export function useLabelOverrides(): UseLabelOverridesResult {
  const [overrides, dispatch] = useReducer(reduce, {});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      dispatch({ type: "hydrated", overrides: parseStored(window.localStorage.getItem(STORAGE_KEY)) });
    } catch {
      // Corrupt or inaccessible storage — fall back to no overrides silently.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      // Storage full or unavailable — not worth surfacing.
    }
  }, [hydrated, overrides]);

  return { overrides, addOverride: (id, delta) => dispatch({ type: "add", id, delta }) };
}
