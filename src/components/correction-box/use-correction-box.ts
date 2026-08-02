"use client";

import { useCallback, useReducer } from "react";
import type { RoadmapData } from "@/components/timeline/types";
import type { PatchOp, Skipped } from "@/lib/corrections/schema";
import { applyCascade } from "@/lib/corrections/cascade";
import { applyOps } from "@/lib/corrections/apply";

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
  | { type: "undo" };

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
}

/**
 * Real production version of the AI-assisted correction interaction
 * settled in issue #9: calls /api/correct (server-side reference
 * resolution against real ids), runs the direct ops through the
 * deterministic cascade engine, and holds the result as a pending patch
 * until the caller applies or discards it. `history` is a linear stack of
 * full pre-patch snapshots — apply() pushes onto it, undo() pops — giving
 * multi-step undo, not just one level back.
 */
export function useCorrectionBox(initialData: RoadmapData): UseCorrectionBoxResult {
  const [state, dispatch] = useReducer(reduce, initialData, (data) => ({
    data,
    history: [],
    pending: null,
    error: null,
    loading: false,
  }));

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
  };
}
