"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import type { Milestone, RoadmapData, RollupSnapshot, Swimlane, TopLevelItem } from "@/components/timeline/types";
import { coercePatchOp, type AddMilestoneOp, type AmbiguousChoice, type PatchOp, type Skipped } from "@/lib/corrections/schema";
import { applyCascade } from "@/lib/corrections/cascade";
import { applyAddMilestoneOps, applyOps } from "@/lib/corrections/apply";
import { laneRollups } from "@/components/executive-view/rag";
import { withComputedCriticalPath } from "@/lib/critical-path/compute";
import { nanoid } from "nanoid";

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

/** Fields the lighter phase/top-level-milestone editor can touch (wayframe#19, widened to showReferenceLine in wayframe#48) — a subset shared across TopLevelItem's variants, applied only where each variant actually has the field. */
export type TopLevelItemPatch = Partial<Pick<Extract<TopLevelItem, { type: "phase" }>, "title" | "status" | "startDate" | "endDate">> &
  Partial<Pick<Extract<TopLevelItem, { type: "milestone" }>, "date" | "showReferenceLine">>;

export interface PendingPatch {
  inputText: string;
  ops: PatchOp[];
  skipped: Skipped[];
  /** Resolved add-milestone proposals (wayframe#38 item 1 / #39) — real lane, optional date. */
  adds: AddMilestoneOp[];
  /** A tied match needing a clarifying answer before it can become an op — see resolveAmbiguous. */
  ambiguous: AmbiguousChoice | null;
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
  | { type: "apply"; adds: { op: AddMilestoneOp; id: string; date: string }[] }
  | { type: "discard" }
  | { type: "undo" }
  | { type: "resolveAmbiguous"; targetId: string }
  | { type: "editMilestone"; ops: PatchOp[] }
  | { type: "editTopLevelItem"; id: string; patch: TopLevelItemPatch }
  | { type: "editBluf"; patch: Partial<RoadmapData["bluf"]> }
  | { type: "loadDocument"; data: RoadmapData }
  | { type: "hydrated"; data: RoadmapData }
  | { type: "setLaneColor"; laneId: string; color: string | undefined }
  | { type: "addMilestone"; laneId: string; date: string; newId: string }
  | { type: "removeMilestone"; id: string }
  | { type: "setMilestoneDate"; id: string; date: string }
  | { type: "toggleDependency"; dependentId: string; dependencyId: string; add: boolean }
  | { type: "addSwimlane"; swimlaneType: "lane" | "separator"; newId: string }
  | { type: "renameSwimlane"; id: string; name: string }
  | { type: "removeSwimlane"; id: string }
  | { type: "moveSwimlane"; id: string; delta: -1 | 1 }
  | { type: "snapshotRollups"; today: Date };

/**
 * Stamps `lastUpdatedAt` (wayframe#40/#49) on a document-changing edit —
 * every case below that pushes onto the undo `history` stack calls this on
 * its way out. `hydrated` and `snapshotRollups` skip it, same as they skip
 * the history push: neither is a user edit.
 */
function stampUpdated(data: RoadmapData): RoadmapData {
  return { ...data, lastUpdatedAt: new Date().toISOString() };
}

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
      const edited = applyOps(state.data.milestones, state.pending.ops);
      const added = applyAddMilestoneOps(action.adds);
      return {
        ...state,
        data: stampUpdated(withComputedCriticalPath({ ...state.data, milestones: [...edited, ...added] })),
        history: [...state.history, state.data],
        pending: null,
        error: null,
      };
    }
    case "discard":
      return { ...state, pending: null, error: null };
    case "resolveAmbiguous": {
      // The clarifying-question moment (wayframe#38 item 1 / #39): a person
      // picks which tied candidate was meant. This never re-resolves the
      // request — the candidate list and each one's precomputed newValue
      // came from the original tool call, so picking one just turns it into
      // a normal op, appended alongside whatever else the request already
      // resolved cleanly.
      if (!state.pending?.ambiguous) return state;
      const { ambiguous } = state.pending;
      const picked = ambiguous.candidates.find((c) => c.targetId === action.targetId);
      if (!picked) return state;
      const coerced = coercePatchOp({
        targetId: picked.targetId,
        field: ambiguous.field,
        newValue: picked.newValue,
        reason: `Picked from ${ambiguous.candidates.length} matches for "${ambiguous.reason}"`,
      });
      if (!coerced.ok) return state;
      return {
        ...state,
        pending: { ...state.pending, ops: [...state.pending.ops, coerced.op], ambiguous: null },
        error: null,
      };
    }
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
        data: stampUpdated(withComputedCriticalPath({ ...state.data, milestones: applyOps(state.data.milestones, cascaded) })),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "editTopLevelItem": {
      // Lighter phase/top-level-milestone editor (wayframe#19) — no
      // dependsOn on TopLevelItem, so no cascade; same instant-save +
      // shared undo stack as editMilestone. A top-level milestone's date can
      // be a linksToTopLevelMilestone constraint for lane milestones, so
      // critical path still needs recomputing here (wayframe#34/#35).
      return {
        ...state,
        data: stampUpdated(
          withComputedCriticalPath({
            ...state.data,
            topLevelItems: state.data.topLevelItems.map((t) => (t.id === action.id ? ({ ...t, ...action.patch } as TopLevelItem) : t)),
          }),
        ),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "editBluf": {
      // So-what rich-text editing (wayframe#38 item 4 / #39) — instant-save,
      // same shared undo stack as editMilestone/editTopLevelItem: no AI
      // interpretation to double-check, so there's no reason for a separate
      // undo mechanism (decided alongside the rich-text authoring surface
      // itself in the prototype). Doesn't touch critical path.
      return {
        ...state,
        data: stampUpdated({ ...state.data, bluf: { ...state.data.bluf, ...action.patch } }),
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
      return { ...state, data: stampUpdated(withComputedCriticalPath(action.data)), history: [...state.history, state.data], pending: null, error: null };
    }
    case "hydrated": {
      // Rehydrating a persisted document (wayframe#22) on mount is not a user
      // edit — it doesn't push onto the undo stack, or undo would take a
      // visitor back to whatever was rendered before the saved document
      // loaded instead of being a no-op.
      return { ...state, data: withComputedCriticalPath(action.data), pending: null, error: null };
    }
    case "setLaneColor": {
      // Lane colour is document content (Swimlane.color), not a viewer
      // preference — it travels with the roadmap and survives export — so
      // it's a normal undoable edit, unlike the theme itself.
      return {
        ...state,
        data: stampUpdated({
          ...state.data,
          swimlanes: state.data.swimlanes.map((l) => (l.id === action.laneId ? { ...l, color: action.color } : l)),
        }),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "addMilestone": {
      // Created empty and immediately opened for editing by the caller —
      // the alternative (a modal that creates on save) leaves no marker on
      // the chart to anchor the interaction to.
      const milestone: Milestone = {
        id: action.newId,
        laneId: action.laneId,
        title: "New milestone",
        date: action.date,
        status: "not-started",
        dependsOn: [],
        linksToTopLevelMilestone: null,
        isCriticalPath: false,
      };
      return {
        ...state,
        data: stampUpdated(withComputedCriticalPath({ ...state.data, milestones: [...state.data.milestones, milestone] })),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "removeMilestone": {
      // Mirrors removeSwimlane's dependsOn cleanup: a milestone that other
      // milestones depend on can't just vanish and leave those edges
      // pointing at an id that no longer exists (wayframe#38 item 3 / #39).
      const milestones = state.data.milestones
        .filter((m) => m.id !== action.id)
        .map((m) => (m.dependsOn.some((d) => d.id === action.id) ? { ...m, dependsOn: m.dependsOn.filter((d) => d.id !== action.id) } : m));
      return {
        ...state,
        data: stampUpdated(withComputedCriticalPath({ ...state.data, milestones })),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "setMilestoneDate": {
      // Drag-to-reschedule. Routed through applyCascade exactly like a date
      // edit typed into the modal, so dragging a predecessor still pushes
      // its dependents instead of silently breaking the chain.
      const ops: PatchOp[] = [{ targetId: action.id, field: "date", newValue: action.date, reason: "Moved on the timeline" }];
      const cascaded = applyCascade(state.data.milestones, ops);
      return {
        ...state,
        data: stampUpdated(withComputedCriticalPath({ ...state.data, milestones: applyOps(state.data.milestones, cascaded) })),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "toggleDependency": {
      // Predecessors and successors are the same edge seen from either end,
      // so one action serves both: the editor flips which id it passes as
      // dependent vs dependency. Self-edges are refused outright; a cycle
      // would make the critical-path walk meaningless.
      if (action.dependentId === action.dependencyId) return state;
      const milestones = state.data.milestones.map((m) => {
        if (m.id !== action.dependentId) return m;
        const without = m.dependsOn.filter((d) => d.id !== action.dependencyId);
        return action.add ? { ...m, dependsOn: [...without, { id: action.dependencyId, showConnector: true }] } : { ...m, dependsOn: without };
      });
      return {
        ...state,
        data: stampUpdated(withComputedCriticalPath({ ...state.data, milestones })),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "addSwimlane": {
      // Appended at the end and renumbered from scratch — `order` is the
      // only thing that positions a row, and letting gaps accumulate makes
      // the move-up/down maths fragile.
      const nextOrder = state.data.swimlanes.reduce((max, l) => Math.max(max, l.order), -1) + 1;
      const swimlane: Swimlane = {
        id: action.newId,
        order: nextOrder,
        type: action.swimlaneType,
        name: action.swimlaneType === "lane" ? "New lane" : "New group",
      };
      return {
        ...state,
        data: stampUpdated({ ...state.data, swimlanes: [...state.data.swimlanes, swimlane] }),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "renameSwimlane": {
      return {
        ...state,
        data: stampUpdated({
          ...state.data,
          swimlanes: state.data.swimlanes.map((l) => (l.id === action.id ? { ...l, name: action.name } : l)),
        }),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "removeSwimlane": {
      // A lane owns its milestones, so deleting it deletes them — and then
      // any OTHER milestone that depended on one of them would be left
      // pointing at an id that no longer exists. That's exactly the broken
      // reference the file loader refuses to open, so the edge is stripped
      // here rather than left for a save/reload to discover.
      const doomed = new Set(state.data.milestones.filter((m) => m.laneId === action.id).map((m) => m.id));
      const milestones = state.data.milestones
        .filter((m) => m.laneId !== action.id)
        .map((m) => (m.dependsOn.some((d) => doomed.has(d.id)) ? { ...m, dependsOn: m.dependsOn.filter((d) => !doomed.has(d.id)) } : m));
      const swimlanes = state.data.swimlanes
        .filter((l) => l.id !== action.id)
        .sort((a, b) => a.order - b.order)
        .map((l, i) => ({ ...l, order: i }));
      return {
        ...state,
        data: stampUpdated(withComputedCriticalPath({ ...state.data, swimlanes, milestones })),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "moveSwimlane": {
      const ordered = [...state.data.swimlanes].sort((a, b) => a.order - b.order);
      const i = ordered.findIndex((l) => l.id === action.id);
      const j = i + action.delta;
      if (i === -1 || j < 0 || j >= ordered.length) return state;
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      return {
        ...state,
        data: stampUpdated({ ...state.data, swimlanes: ordered.map((l, k) => ({ ...l, order: k })) }),
        history: [...state.history, state.data],
        error: null,
      };
    }
    case "snapshotRollups": {
      // Passive once-per-calendar-day-per-lane rollup snapshot for the
      // Executive-view trend arrow (wayframe#33) — same "not a user edit"
      // treatment as "hydrated" above: it never pushes onto the undo stack.
      const todayKey = action.today.toISOString().slice(0, 10);
      const rollupByLaneId = new Map(laneRollups(state.data, action.today).map((r) => [r.laneId, r]));
      let changed = false;
      const swimlanes = state.data.swimlanes.map((lane) => {
        if (lane.type !== "lane" || lane.rollupHistory?.some((s) => s.date === todayKey)) return lane;
        const r = rollupByLaneId.get(lane.id);
        if (!r) return lane;
        changed = true;
        const snapshot: RollupSnapshot = { date: todayKey, rag: r.rag, atRiskCount: r.atRiskCount, delayedCount: r.delayedCount };
        return { ...lane, rollupHistory: [...(lane.rollupHistory ?? []), snapshot] };
      });
      return changed ? { ...state, data: { ...state.data, swimlanes } } : state;
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
  /** Applies the pending patch's ops and adds. Returns the ids of any added milestones that had no resolved date, so the caller can open the editor for them (mirrors addMilestone's manual "create empty, open for editing" behavior). */
  apply: () => string[];
  discard: () => void;
  undo: () => void;
  /** Turns one of the pending patch's ambiguous candidates into a real op — the clarifying-question answer. */
  resolveAmbiguous: (targetId: string) => void;
  editMilestone: (ops: PatchOp[]) => void;
  editTopLevelItem: (id: string, patch: TopLevelItemPatch) => void;
  editBluf: (patch: Partial<RoadmapData["bluf"]>) => void;
  setLaneColor: (laneId: string, color: string | undefined) => void;
  /** Creates an empty milestone in the lane and returns its id so the caller can open it. */
  addMilestone: (laneId: string, date: string) => string;
  removeMilestone: (id: string) => void;
  setMilestoneDate: (id: string, date: string) => void;
  toggleDependency: (dependentId: string, dependencyId: string, add: boolean) => void;
  addSwimlane: (swimlaneType: "lane" | "separator") => void;
  renameSwimlane: (id: string, name: string) => void;
  removeSwimlane: (id: string) => void;
  moveSwimlane: (id: string, delta: -1 | 1) => void;
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
 *
 * `today` (default `new Date()`) drives the once-per-calendar-day-per-lane
 * rollup snapshot (wayframe#33) fired once, after rehydration — every other
 * caller in the app already treats `today` as fixed for the session rather
 * than a live-ticking clock (e.g. RoadmapWorkspace's props), so this doesn't
 * re-check mid-session.
 */
export function useCorrectionBox(initialData: RoadmapData, persist = true, today = new Date()): UseCorrectionBoxResult {
  const [state, dispatch] = useReducer(reduce, initialData, (data) => ({
    data: withComputedCriticalPath(data),
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

  // Fires once per mount, after rehydration lands (so it snapshots whatever
  // document — persisted or fixture — actually ends up rendered). The
  // reducer is idempotent per calendar day, so a second dispatch this same
  // day (e.g. a remount) is a no-op that doesn't re-render.
  useEffect(() => {
    if (!hydrated) return;
    dispatch({ type: "snapshotRollups", today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

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
            lanes: state.data.swimlanes.filter((l) => l.type === "lane").map((l) => ({ id: l.id, name: l.name })),
          }),
        });
        const body = await res.json().catch(() => null);

        if (!res.ok) {
          dispatch({ type: "requestFailed", error: body?.error?.message ?? "Correction request failed." });
          return;
        }

        const directOps: PatchOp[] = body.patch.ops;
        const skipped: Skipped[] = body.patch.skipped;
        const adds: AddMilestoneOp[] = body.patch.addMilestones ?? [];
        const ambiguous: AmbiguousChoice | null = body.patch.ambiguous ?? null;

        if (directOps.length === 0 && skipped.length === 0 && adds.length === 0 && !ambiguous) {
          dispatch({ type: "requestFailed", error: `No milestones matched "${text}"` });
          return;
        }

        const ops = applyCascade(state.data.milestones, directOps);
        dispatch({ type: "proposed", pending: { inputText: text, ops, skipped, adds, ambiguous } });
      } catch (err) {
        dispatch({ type: "requestFailed", error: err instanceof Error ? err.message : "Correction request failed." });
      }
    },
    [state.data],
  );

  const apply = useCallback((): string[] => {
    if (!state.pending) return [];
    const needsEditorIds: string[] = [];
    const adds = state.pending.adds.map((op) => {
      const id = nanoid();
      const date = op.date ?? today.toISOString().slice(0, 10);
      if (!op.date) needsEditorIds.push(id);
      return { op, id, date };
    });
    dispatch({ type: "apply", adds });
    return needsEditorIds;
  }, [state.pending, today]);
  const discard = useCallback(() => dispatch({ type: "discard" }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const resolveAmbiguous = useCallback((targetId: string) => dispatch({ type: "resolveAmbiguous", targetId }), []);
  const editMilestone = useCallback((ops: PatchOp[]) => dispatch({ type: "editMilestone", ops }), []);
  const editTopLevelItem = useCallback((id: string, patch: TopLevelItemPatch) => dispatch({ type: "editTopLevelItem", id, patch }), []);
  const editBluf = useCallback((patch: Partial<RoadmapData["bluf"]>) => dispatch({ type: "editBluf", patch }), []);
  const setLaneColor = useCallback((laneId: string, color: string | undefined) => dispatch({ type: "setLaneColor", laneId, color }), []);
  const addMilestone = useCallback((laneId: string, date: string) => {
    const newId = nanoid();
    dispatch({ type: "addMilestone", laneId, date, newId });
    return newId;
  }, []);
  const removeMilestone = useCallback((id: string) => dispatch({ type: "removeMilestone", id }), []);
  const setMilestoneDate = useCallback((id: string, date: string) => dispatch({ type: "setMilestoneDate", id, date }), []);
  const toggleDependency = useCallback(
    (dependentId: string, dependencyId: string, add: boolean) => dispatch({ type: "toggleDependency", dependentId, dependencyId, add }),
    [],
  );
  const addSwimlane = useCallback((swimlaneType: "lane" | "separator") => dispatch({ type: "addSwimlane", swimlaneType, newId: nanoid() }), []);
  const renameSwimlane = useCallback((id: string, name: string) => dispatch({ type: "renameSwimlane", id, name }), []);
  const removeSwimlane = useCallback((id: string) => dispatch({ type: "removeSwimlane", id }), []);
  const moveSwimlane = useCallback((id: string, delta: -1 | 1) => dispatch({ type: "moveSwimlane", id, delta }), []);
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
    resolveAmbiguous,
    editMilestone,
    editTopLevelItem,
    editBluf,
    setLaneColor,
    addMilestone,
    removeMilestone,
    setMilestoneDate,
    toggleDependency,
    addSwimlane,
    renameSwimlane,
    removeSwimlane,
    moveSwimlane,
    loadDocument,
  };
}
