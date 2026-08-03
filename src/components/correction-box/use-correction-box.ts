"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import type { RoadmapData, TopLevelItem } from "@/components/timeline/types";
import type { PatchOp, Skipped } from "@/lib/corrections/schema";
import { applyCascade } from "@/lib/corrections/cascade";
import { applyOps } from "@/lib/corrections/apply";

/** Single-document-per-browser persistence (wayframe#22) — one fixed key, not a multi-roadmap store. */
const STORAGE_KEY = "wayframe:document";

/**
 * Lets the real `/` entry page (wayframe#25) check, before first render,
 * whether a visitor already has a saved document — landing them back in
 * their workspace instead of a fresh input form. Reads the same key this
 * hook persists to, so the two never drift.
 */
export function loadPersistedDocument(): RoadmapData | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as RoadmapData) : null;
  } catch {
    return null;
  }
}

/** Fields the lighter phase/top-level-milestone editor can touch (wayframe#19) — a subset shared across TopLevelItem's variants, applied only where each variant actually has the field. */
export type TopLevelItemPatch = Partial<Pick<Extract<TopLevelItem, { type: "phase" }>, "title" | "status" | "startDate" | "endDate">> &
  Partial<Pick<Extract<TopLevelItem, { type: "milestone" }>, "date">>;

export interface PendingPatch {
  inputText: string;
  ops: PatchOp[];
  skipped: Skipped[];
}

export interface CorrectionBoxState {
  data: RoadmapData;
  history: RoadmapData[];
  pending: PendingPatch | null;
  error: string | null;
  loading: boolean;
}

export type CorrectionBoxAction =
  | { type: "requestStarted" }
  | { type: "requestFailed"; error: string }
  | { type: "proposed"; pending: PendingPatch }
  | { type: "apply" }
  | { type: "discard" }
  | { type: "undo" }
  | { type: "editMilestone"; ops: PatchOp[] }
  | { type: "editTopLevelItem"; id: string; patch: TopLevelItemPatch }
  | { type: "loadDocument"; data: RoadmapData }
  | { type: "hydrated"; data: RoadmapData };

/**
 * All state transitions in one place, mirroring issue #9's hand-driven
 * prototype (src/lib/corrections/../prototype-patch-logic.ts's `reduce`) —
 * a single reducer avoids the fragile "setState inside another setState's
 * updater" pattern an earlier version of this hook used, which silently
 * dropped undo's effect. Exported for direct unit testing.
 */
export function reduce(state: CorrectionBoxState, action: CorrectionBoxAction): CorrectionBoxState {
  switch (action.type) {
    case "requestStarted":
      return { ...state, loading: true, error: null };
    case "requestFailed":
      return { ...state, loading: false, pending: null, error: action.error };
    case "proposed":
      return { ...state, loading: false, pending: action.pending, error: null };
    case "apply": {
      if (!state.pending) return state;
      return {
        ...state,
        data: { ...state.data, milestones: applyOps(state.data.milestones, state.pending.ops) },
        history: [...state.history, state.data],
        pending: null,
        error: null,
      };
    }
    case "discard":
      return { ...state, pending: null, error: null };
    case "undo": {
      if (state.history.length === 0) {
        return { ...state, error: "Nothing to undo" };
      }
      const previous = state.history[state.history.length - 1];
      return { ...state, data: previous, history: state.history.slice(0, -1), pending: null, error: null };
    }
    case "editMilestone": {
      // Manual editing (wayframe#18's resolution): instant-save, not a
      // preview/pending step — a direct field edit has no AI interpretation
      // to double-check, unlike a free-text correction. The cascade still
      // runs (a dependent shouldn't silently start before its predecessor
      // just because the edit came from a form) and applies immediately
      // alongside the direct edit, sharing this same undo stack.
      const cascaded = applyCascade(state.data.milestones, action.ops);
      return {
        ...state,
        data: { ...state.data, milestones: applyOps(state.data.milestones, cascaded) },
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "editTopLevelItem": {
      // Lighter phase/top-level-milestone editor (wayframe#19) — no
      // dependsOn on TopLevelItem, so no cascade; same instant-save +
      // shared undo stack as editMilestone.
      return {
        ...state,
        data: {
          ...state.data,
          topLevelItems: state.data.topLevelItems.map((t) => (t.id === action.id ? ({ ...t, ...action.patch } as TopLevelItem) : t)),
        },
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "loadDocument": {
      // A structured-data import (wayframe#16) or any future ingestion path
      // replaces the whole document wholesale, not a field at a time — but
      // still shares this undo stack, so importing over an in-progress
      // roadmap is a mistake the user can recover from with the same Undo
      // button, not a destructive dead end.
      return { ...state, data: action.data, history: [...state.history, state.data], pending: null, error: null };
    }
    case "hydrated": {
      // Rehydrating a persisted document (wayframe#22) on mount is not a user
      // edit — it doesn't push onto the undo stack, or undo would take a
      // visitor back to whatever was rendered before the saved document
      // loaded instead of being a no-op.
      return { ...state, data: action.data, pending: null, error: null };
    }
  }
}

export interface UseCorrectionBoxResult {
  data: RoadmapData;
  pending: PendingPatch | null;
  error: string | null;
  loading: boolean;
  historyLength: number;
  submit: (text: string) => Promise<void>;
  apply: () => void;
  discard: () => void;
  undo: () => void;
  editMilestone: (ops: PatchOp[]) => void;
  editTopLevelItem: (id: string, patch: TopLevelItemPatch) => void;
  loadDocument: (data: RoadmapData) => void;
}

/**
 * Real production version of the AI-assisted correction interaction
 * settled in issue #9: calls /api/correct (server-side reference
 * resolution against real ids), runs the direct ops through the
 * deterministic cascade engine, and holds the result as a pending patch
 * until the caller applies or discards it. `history` is a linear stack of
 * full pre-patch snapshots — apply() pushes onto it, undo() pops — giving
 * multi-step undo, not just one level back.
 *
 * `persist` (default `true`, wayframe#24) gates the localStorage read/write
 * below — off for `/dev/demo-roadmap`'s QA route, which must always mount
 * fresh off the hardcoded demo fixture rather than picking up a real
 * visitor's saved document once it shares this hook with the real `/` page.
 */
export function useCorrectionBox(initialData: RoadmapData, persist = true): UseCorrectionBoxResult {
  const [state, dispatch] = useReducer(reduce, initialData, (data) => ({
    data,
    history: [],
    pending: null,
    error: null,
    loading: false,
  }));

  // Gates the persist effect below until the mount-time rehydration attempt
  // has committed — a plain ref flipped inside the same effect pass isn't
  // enough, since the dispatched "hydrated" update hasn't landed yet when
  // the persist effect runs in that same commit; it would briefly write
  // `initialData` over a saved document before the reload ever saw it
  // (wayframe#22). Sequencing this through state, not a ref, forces the
  // persist effect to wait for the next render, after rehydration lands.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      if (persist) {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          dispatch({ type: "hydrated", data: JSON.parse(saved) as RoadmapData });
        }
      }
    } catch {
      // Corrupt or inaccessible storage — fall back to initialData silently.
    } finally {
      setHydrated(true);
    }
  }, [persist]);

  useEffect(() => {
    if (!persist || !hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    } catch {
      // Storage full or unavailable (e.g. private browsing) — persistence
      // is a nice-to-have, not something worth surfacing as a user error.
    }
  }, [persist, hydrated, state.data]);

  const submit = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      dispatch({ type: "requestStarted" });
      try {
        const laneNameById = new Map(state.data.swimlanes.map((l) => [l.id, l.name]));
        const res = await fetch("/api/correct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correctionText: text,
            milestones: state.data.milestones.map((m) => ({
              id: m.id,
              title: m.title,
              laneName: laneNameById.get(m.laneId) ?? "",
              date: m.date,
              status: m.status,
            })),
          }),
        });
        const body = await res.json().catch(() => null);

        if (!res.ok) {
          dispatch({ type: "requestFailed", error: body?.error?.message ?? "Correction request failed." });
          return;
        }

        const directOps: PatchOp[] = body.patch.ops;
        const skipped: Skipped[] = body.patch.skipped;

        if (directOps.length === 0 && skipped.length === 0) {
          dispatch({ type: "requestFailed", error: `No milestones matched "${text}"` });
          return;
        }

        const ops = applyCascade(state.data.milestones, directOps);
        dispatch({ type: "proposed", pending: { inputText: text, ops, skipped } });
      } catch (err) {
        dispatch({ type: "requestFailed", error: err instanceof Error ? err.message : "Correction request failed." });
      }
    },
    [state.data],
  );

  const apply = useCallback(() => dispatch({ type: "apply" }), []);
  const discard = useCallback(() => dispatch({ type: "discard" }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const editMilestone = useCallback((ops: PatchOp[]) => dispatch({ type: "editMilestone", ops }), []);
  const editTopLevelItem = useCallback((id: string, patch: TopLevelItemPatch) => dispatch({ type: "editTopLevelItem", id, patch }), []);
  const loadDocument = useCallback((data: RoadmapData) => dispatch({ type: "loadDocument", data }), []);

  return {
    data: state.data,
    pending: state.pending,
    error: state.error,
    loading: state.loading,
    historyLength: state.history.length,
    submit,
    apply,
    discard,
    undo,
    editMilestone,
    editTopLevelItem,
    loadDocument,
  };
}
