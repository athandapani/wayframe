"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { currentRev, type Portfolio, type PortfolioDocument, type Rag, type Milestone, type Program, type RollupSnapshot, type StyleOverride, type Swimlane, type TopLevelItem } from "@/components/timeline/types";
import { createScenario } from "@/lib/scenario/types";
import { defaultPortfolioTheme, type Theme, type ThemeId } from "@/components/timeline/theme";
import {
  coercePatchOp,
  type AcceptBaselineOp,
  type AddMilestoneOp,
  type AddTopLevelItemOp,
  type AmbiguousChoice,
  type AttachmentOp,
  type BlufOp,
  type BulkShiftOp,
  type DeleteOp,
  type DependencyOp,
  type DocumentFieldsOp,
  type PatchOp,
  type Skipped,
  type SwimlaneOp,
  type TopLevelItemOp,
} from "@/lib/corrections/schema";
import { applyCascade } from "@/lib/corrections/cascade";
import type { ProgramConflict } from "@/lib/realtime/program-conflict";
import { resolveBulkShiftOps } from "@/lib/corrections/bulk-shift";
import { applyAcceptBaselineOps, applyAddMilestoneOps, applyAddTopLevelItemOps, applyAttachmentOps, applyDependencyOps, applyOps, applyTopLevelItemOps } from "@/lib/corrections/apply";
import { applyBulkPatchToProgram, type BulkPatchOp } from "@/lib/bulk-edit/apply";
import {
  addSwimlaneGroupOp,
  addSwimlaneOp,
  applyDeletes,
  applySwimlaneOps,
  moveSwimlaneGroupOp,
  moveSwimlaneOp,
  removeMilestoneOp,
  removeSwimlaneGroupOp,
  removeSwimlaneOp,
  removeTopLevelItemOp,
  renameSwimlaneGroupOp,
  renameSwimlaneOp,
  setLaneColorOp,
  setLaneDensityOp,
  setLaneHiddenOp,
  setRagOverrideOp,
  setSwimlaneGroupColorOp,
  setSwimlaneGroupCollapsedOp,
  setSwimlaneGroupIdOp,
  setSwimlaneGroupParentIdOp,
} from "@/lib/corrections/apply-document";
import { laneRollups } from "@/components/executive-view/rag";
import { validatePortfolioDocument } from "@/lib/document-file/schema";
import { nanoid } from "nanoid";

/** Single-document-per-browser persistence (wayframe#22) — one fixed key, not a multi-roadmap store. */
const STORAGE_KEY = "wayframe:document";

/**
 * Lets the real `/` entry page (wayframe#25) check, before first render,
 * whether a visitor already has a saved document — landing them back in
 * their workspace instead of a fresh input form. Reads the same key this
 * hook persists to, so the two never drift.
 */
export function loadPersistedDocument(): PortfolioDocument | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const result = validatePortfolioDocument(JSON.parse(saved));
    if (!result.ok) {
      console.warn("Wayframe: discarding invalid persisted document", result.message, result.issues);
      return null;
    }
    return result.document;
  } catch {
    return null;
  }
}

/**
 * Found 2026-09-19: "Save & Start New" (RoadmapWorkspace's onStartNew) only
 * ever cleared the caller's React state, never this key — so useCorrectionBox's
 * own mount-time rehydration effect below would silently re-read the stale
 * document and clobber whatever fresh `initialData` (a brand-new extraction,
 * or the blank template) the next RoadmapWorkspace mount was given. The
 * entry page's onStartNew must call this before it drops back to EntryForm,
 * or every "start new" is a no-op the moment a document exists to extract.
 */
export function clearPersistedDocument(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

/** Fields the lighter phase/top-level-milestone/annotation editor can touch (wayframe#19, widened to showReferenceLine in wayframe#48, to annotation's fields in wayframe#59) — a subset shared across TopLevelItem's variants, applied only where each variant actually has the field. */
export type TopLevelItemPatch = Partial<Pick<Extract<TopLevelItem, { type: "phase" }>, "title" | "status" | "startDate" | "endDate" | "potentialDate">> &
  Partial<Pick<Extract<TopLevelItem, { type: "milestone" }>, "date" | "showReferenceLine" | "potentialDate">> &
  Partial<Pick<Extract<TopLevelItem, { type: "annotation" }>, "message">>;

export interface PendingPatch {
  inputText: string;
  ops: PatchOp[];
  skipped: Skipped[];
  /** Resolved add-milestone proposals (wayframe#38 item 1 / #39) — real lane, optional date. */
  adds: AddMilestoneOp[];
  /** Generic entity deletes (wayframe#55/#58) — milestone/topLevelItem/swimlane, one op shape. */
  deletes: DeleteOp[];
  /** Swimlane management ops (wayframe#55/#58) — add/rename/reorder/recolor/ragOverride. */
  swimlaneOps: SwimlaneOp[];
  /** PROGRAM-band item edits (wayframe#59) — mirrors ops but scoped to TopLevelItem's fields. */
  topLevelItemOps: TopLevelItemOp[];
  /** New PROGRAM-band items (wayframe#59) — mirrors adds, discriminated by kind (milestone/phase/annotation). */
  addTopLevelItems: AddTopLevelItemOp[];
  /** Dependency-edge add/remove, optionally setting showConnector (wayframe#59). */
  dependencyOps: DependencyOp[];
  /** Milestone attachment add/remove, one op per attachment (wayframe#55/#60). */
  attachmentOps: AttachmentOp[];
  /** Accept-baseline ops — clears originalDate for named or all ghosted milestones (wayframe#62). */
  acceptBaselineOps: AcceptBaselineOp[];
  /** BLUF panel edit — statement/bullets/label — not targetId-addressed (wayframe#55/#60). */
  blufOp: BlufOp | null;
  /** Document-header edit — programName/owner/reportsTo/nextReviewDate — not targetId-addressed (wayframe#55/#60). */
  documentOp: DocumentFieldsOp | null;
  /** A tied match needing a clarifying answer before it can become an op — see resolveAmbiguous. */
  ambiguous: AmbiguousChoice | null;
}

/** A snapshot of both halves of the editable document (wayframe t11) — pushed onto `history` together so undo restores Portfolio-scoped edits (logo, legend categories) exactly like Program-scoped ones. */
export interface DocumentSnapshot {
  data: Program;
  portfolio: Portfolio;
}

export interface CorrectionBoxState {
  data: Program;
  /** The current Program's Portfolio (wayframe t11) — schemaVersion/companyLogo/legendCategories live here now, not on `data`. Today's app only ever edits one Program at a time, so this is the one Portfolio that Program belongs to, not a list. */
  portfolio: Portfolio;
  history: DocumentSnapshot[];
  /**
   * Redo stack (wayframe UX-2026-09-18 §6) — the mirror image of `history`:
   * Undo pops `history` and pushes the pre-undo state here; Redo pops this
   * and pushes the pre-redo state back onto `history`. Cleared on any real
   * edit (see `reduce`'s own wrapper doc below) so redoing after a fresh
   * edit can never re-apply a now-stale whole-document snapshot over it.
   * Same unbounded-whole-document-snapshot cost `history` already has —
   * acceptable for now (see `history`'s own doc / this ticket's own risk
   * note), doubling that footprint.
   */
  future: DocumentSnapshot[];
  pending: PendingPatch | null;
  error: string | null;
  loading: boolean;
  /**
   * Offline-edit conflicts (wayframe t38) — persistent, dismiss-only: never
   * silently dropped once detected (see "addConflicts"), never silently
   * resurrected (a dismissed conflict is gone from state entirely, not just
   * hidden — see "dismissConflict"). Populated by the room-connection hook
   * (fork 2) calling `detectOrphanedEdits` (program-conflict.ts) once
   * reconnected/resynced, not by this reducer itself.
   */
  conflicts: ProgramConflict[];
}

export type CorrectionBoxAction =
  | { type: "requestStarted" }
  | { type: "requestFailed"; error: string }
  | { type: "proposed"; pending: PendingPatch }
  | {
      type: "apply";
      adds: { op: AddMilestoneOp; id: string; date: string }[];
      resolvedSwimlaneOps: { op: SwimlaneOp; newId: string }[];
      resolvedTopLevelAdds: { op: AddTopLevelItemOp; id: string; date: string; endDate?: string }[];
    }
  | { type: "discard" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "resolveAmbiguous"; targetId: string }
  | { type: "editMilestone"; ops: PatchOp[] }
  | { type: "acceptBaseline"; id: string }
  | { type: "acceptAllBaselines" }
  | { type: "editTopLevelItem"; id: string; patch: TopLevelItemPatch }
  | { type: "editBluf"; patch: Partial<Program["bluf"]> }
  | { type: "editDocument"; patch: Partial<Pick<Program, "programName" | "owner" | "reportsTo" | "nextReviewDate">> }
  | { type: "editAttachments"; ops: AttachmentOp[] }
  // `portfolio` is optional: ImportPanel's structured-data import only ever
  // replaces Program content (wayframe#16), leaving the current Portfolio
  // (logo/legend) untouched; an explicit file Open (wayframe t11) replaces
  // both, since a .wayframe.json round-trips the full PortfolioDocument.
  | { type: "loadDocument"; data: Program; portfolio?: Portfolio }
  | { type: "hydrated"; data: Program; portfolio: Portfolio }
  | { type: "setLaneColor"; laneId: string; color: string | undefined }
  | { type: "addMilestone"; laneId: string; date: string; endDate?: string; newId: string }
  | { type: "addTopLevelItem"; kind: "milestone" | "phase" | "annotation"; date: string; newId: string }
  | { type: "removeMilestone"; id: string }
  | { type: "removeTopLevelItem"; id: string }
  | { type: "setMilestoneDate"; id: string; date: string }
  | { type: "setMilestoneDateRange"; id: string; date: string; endDate: string }
  | { type: "toggleDependency"; dependentId: string; dependencyId: string; add: boolean; showConnector?: boolean }
  | { type: "addSwimlane"; swimlaneType: "lane" | "separator"; newId: string }
  | { type: "renameSwimlane"; id: string; name: string }
  | { type: "removeSwimlane"; id: string }
  | { type: "moveSwimlane"; id: string; delta: -1 | 1 }
  | { type: "setRagOverride"; id: string; rag: Rag | "auto" }
  | { type: "setLaneDensity"; id: string; density: "normal" | "lean" }
  | { type: "setLaneHidden"; id: string; hidden: boolean }
  | { type: "addSwimlaneGroup"; newId: string }
  | { type: "renameSwimlaneGroup"; id: string; name: string }
  | { type: "removeSwimlaneGroup"; id: string }
  | { type: "setSwimlaneGroupColor"; id: string; color: string | undefined }
  | { type: "setSwimlaneGroupCollapsed"; id: string; collapsed: boolean }
  | { type: "moveSwimlaneGroup"; id: string; delta: -1 | 1 }
  | { type: "setSwimlaneGroupId"; laneId: string; groupId: string | undefined }
  | { type: "setSwimlaneGroupParentId"; groupId: string; newParentGroupId: string | undefined }
  | { type: "setCompanyLogo"; dataUrl: string }
  | { type: "clearCompanyLogo" }
  | { type: "setCompanyLogoGeometry"; dx: number; dy: number; scale: number }
  // Theme is Portfolio document content (wayframe#88/t18) — setThemeBase
  // swaps the base preset (keeping any overrides live on top of it, per the
  // prototype's "base swap racing an override tweak" walkthrough);
  // setThemeOverride patches one or more override fields at once (mirrors
  // setCompanyLogoGeometry bundling a few related field writes together);
  // clearThemeOverrides resets to the base preset with no overrides, as its
  // own explicit action distinct from picking a new base theme.
  | { type: "setThemeBase"; baseId: ThemeId }
  | { type: "setThemeOverride"; patch: Partial<Omit<Theme, "id">> }
  | { type: "clearThemeOverrides" }
  | { type: "snapshotRollups"; today: Date }
  | { type: "addCategory"; name: string; color: string; newId: string }
  | { type: "renameCategory"; id: string; name: string }
  | { type: "recolorCategory"; id: string; color: string }
  | { type: "removeCategory"; id: string }
  // Minimal Scenario CRUD (t29) — create+list+remove only, mirroring
  // legendCategories' Portfolio-scoped array treatment above. A Scenario's
  // own delta-list editing (milestone/topLevelItem overrides) is a separate
  // future ticket's UI; these two actions only manage the named-Scenario
  // vocabulary itself.
  | { type: "addScenario"; name: string; newId: string }
  | { type: "removeScenario"; id: string }
  | { type: "setMilestoneCategory"; id: string; categoryId: string | null }
  | { type: "setMilestoneStyleOverride"; id: string; patch: Partial<StyleOverride> }
  | { type: "clearMilestoneStyleOverride"; id: string; field: keyof StyleOverride }
  // PROGRAM-band mirror of the two actions above (wayframe UX-2026-09-18 §2)
  // — annotation has no styleOverride field at all (see TopLevelItem's own
  // union in types.ts), so both actions are a no-op there, same guard
  // bulk-edit/apply.ts's own TopLevelItem style-patch pass already uses.
  | { type: "setTopLevelItemStyleOverride"; id: string; patch: Partial<StyleOverride> }
  | { type: "clearTopLevelItemStyleOverride"; id: string; field: keyof StyleOverride }
  | { type: "setMilestoneLaneRow"; id: string; laneRow: number | undefined }
  | { type: "importMerge"; newLanes: { id: string; name: string }[]; adds: Milestone[]; updateOps: PatchOp[] }
  // Generalized mass-edit (wayframe#t33) — `bulkPatchOps` is the generic
  // field-patch model (src/lib/bulk-edit/types.ts's `BulkPatchOp`, one entry
  // per {field, id list} the selection toolbar built), routed through
  // applyBulkPatchToProgram; `deleteIds`/`acceptBaselineOps` stay their own
  // small fixed non-field primitives, same as the old laneReassignments/
  // acceptBaselineOps split before it.
  | { type: "bulkEdit"; bulkPatchOps: { op: BulkPatchOp; ids: string[] }[]; deleteIds: string[]; acceptBaselineOps: AcceptBaselineOp[] }
  // Cross-Program move primitive (wayframe#124) — these five are the
  // low-level box actions src/components/correction-box/cross-program-move.ts
  // dispatches; not meant for direct UI use. `setMilestoneLane` is the
  // same-Program case (a plain field patch, ordinarily undoable); the other
  // four are the two sides of a real cross-Program move and clear the undo
  // stack instead of pushing onto it — see their reducer cases' own doc.
  | { type: "setMilestoneLane"; id: string; laneId: string }
  | { type: "receiveMovedMilestone"; milestone: Milestone }
  | { type: "receiveMovedSwimlane"; swimlane: Swimlane; milestones: Milestone[] }
  | { type: "releaseMovedMilestone"; id: string }
  | { type: "releaseMovedSwimlane"; id: string }
  // Realtime plumbing (wayframe t38) — see CorrectionBoxState.conflicts's doc
  // and each case's own comment in `reduce` below.
  | { type: "setFromRemote"; data: Program }
  | { type: "addConflicts"; conflicts: ProgramConflict[] }
  | { type: "dismissConflict"; targetId: string };

/**
 * Stamps `lastUpdatedAt` (wayframe#40/#49) and bumps `Milestone`/`TopLevelItem.rev`
 * (t13, wayframe#87) on a document-changing edit — every case below that
 * pushes onto the undo `history` stack calls this on its way out, passing
 * `state.data` as `previous` so rev-bumping has something to diff against.
 * `hydrated` and `snapshotRollups` skip it, same as they skip the history
 * push: neither is a user edit.
 *
 * Rev-bumping is centralized here via `bumpChangedRevs` rather than threaded
 * through each of apply.ts/apply-document.ts/bulk-edit's own mutation
 * functions individually — this reducer is the one place every
 * document-changing action already funnels through on its way out, so
 * diffing previous-vs-next here can't silently miss a mutation call site the
 * way hand-adding a `rev + 1` at each of the ~10 scattered places that touch
 * a Milestone/TopLevelItem field could.
 */
function stampUpdated(previous: Program, next: Program): Program {
  return {
    ...next,
    lastUpdatedAt: new Date().toISOString(),
    milestones: bumpChangedRevs(previous.milestones, next.milestones),
    topLevelItems: bumpChangedRevs(previous.topLevelItems, next.topLevelItems),
  };
}

/**
 * Bumps `rev` on every item whose non-`rev` fields actually changed between
 * `previous` and `next` (t13, wayframe#87's per-item drift counter — see
 * `resolveScenario` in src/lib/scenario/resolve.ts for what consumes it). A
 * brand-new item (present in `next` but not `previous`, e.g. `addMilestone`)
 * is left exactly as constructed rather than force-bumped, so it starts at
 * whatever `rev` its constructor gave it (typically unset, which every
 * rev-comparison site treats as 1 — see `bumpRev`'s doc in types.ts).
 *
 * `isCriticalPath` no longer contributes rev churn here (t14, wayframe#89):
 * it stopped being persisted document content and is now derived at the
 * render boundary (RenderableProgram/mergeForRender in types.ts), like
 * Theme (t18) and Scenario (t13), so a downstream milestone's rev no longer
 * bumps just because an unrelated predecessor's date moved its computed
 * critical-path flag.
 */
function bumpChangedRevs<T extends { id: string; rev?: number }>(previous: readonly T[], next: readonly T[]): T[] {
  const prevById = new Map(previous.map((item) => [item.id, item]));
  return next.map((item) => {
    const before = prevById.get(item.id);
    if (!before) return item;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rev: _beforeRev, ...beforeRest } = before;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rev: _afterRev, ...afterRest } = item;
    if (JSON.stringify(beforeRest) === JSON.stringify(afterRest)) return item;
    return { ...item, rev: currentRev(before) + 1 };
  });
}

/**
 * All state transitions in one place, mirroring issue #9's hand-driven
 * prototype (src/lib/corrections/../prototype-patch-logic.ts's `reduce`) —
 * a single reducer avoids the fragile "setState inside another setState's
 * updater" pattern an earlier version of this hook used, which silently
 * dropped undo's effect. Wrapped by the exported `reduce` below (which
 * owns clearing `future` on a real edit) — this inner function only needs
 * to get its own case's `history`/`future` transition right, not police
 * every other case's.
 */
function reduceInner(state: CorrectionBoxState, action: CorrectionBoxAction): CorrectionBoxState {
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
      const withDependencyOps = applyDependencyOps([...edited, ...added], state.pending.dependencyOps);
      const withAttachmentOps = applyAttachmentOps(withDependencyOps, state.pending.attachmentOps);
      const withAcceptedBaselines = applyAcceptBaselineOps(withAttachmentOps, state.pending.acceptBaselineOps);
      const withMilestoneOps = { ...state.data, milestones: withAcceptedBaselines };
      const withDeletes = applyDeletes(withMilestoneOps, state.pending.deletes);
      const withSwimlaneOps = applySwimlaneOps(withDeletes, action.resolvedSwimlaneOps);
      const editedTopLevel = applyTopLevelItemOps(withSwimlaneOps.topLevelItems, state.pending.topLevelItemOps);
      const addedTopLevel = applyAddTopLevelItemOps(action.resolvedTopLevelAdds);
      const withTopLevelOps = { ...withSwimlaneOps, topLevelItems: [...editedTopLevel, ...addedTopLevel] };
      // blufOp/documentOp are document-level, not per-milestone — merged in
      // directly rather than routed through an apply.ts helper, same "single
      // entity" reasoning that keeps them out of PatchOp's targetId scheme.
      const { blufOp, documentOp } = state.pending;
      const withBluf = blufOp ? { ...withTopLevelOps, bluf: { ...withTopLevelOps.bluf, ...(blufOp.statement !== undefined && { statement: blufOp.statement }), ...(blufOp.bullets !== undefined && { bullets: blufOp.bullets }), ...(blufOp.label !== undefined && { label: blufOp.label }) } } : withTopLevelOps;
      const withDocument = documentOp
        ? {
            ...withBluf,
            ...(documentOp.programName !== undefined && { programName: documentOp.programName }),
            ...(documentOp.owner !== undefined && { owner: documentOp.owner }),
            ...(documentOp.reportsTo !== undefined && { reportsTo: documentOp.reportsTo }),
            ...(documentOp.nextReviewDate !== undefined && { nextReviewDate: documentOp.nextReviewDate }),
          }
        : withBluf;
      return {
        ...state,
        data: stampUpdated(state.data, withDocument),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
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
      return {
        ...state,
        data: previous.data,
        portfolio: previous.portfolio,
        history: state.history.slice(0, -1),
        // The mirror image of a real edit's `history.push` — the state
        // Undo is about to leave behind becomes Redo's next target,
        // instead of being discarded (wayframe UX-2026-09-18 §6).
        future: [...state.future, { data: state.data, portfolio: state.portfolio }],
        pending: null,
        error: null,
      };
    }
    case "redo": {
      if (state.future.length === 0) {
        return { ...state, error: "Nothing to redo" };
      }
      const next = state.future[state.future.length - 1];
      return {
        ...state,
        data: next.data,
        portfolio: next.portfolio,
        future: state.future.slice(0, -1),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        pending: null,
        error: null,
      };
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
        data: stampUpdated(state.data, { ...state.data, milestones: applyOps(state.data.milestones, cascaded) }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "acceptBaseline": {
      // Clears one milestone's drift baseline — "this is the new normal,
      // stop showing me the ghost" (wayframe#62). Instant apply, same
      // shared undo stack as editMilestone. No cascade/critical-path
      // recompute: clearing originalDate never touches `date`.
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          milestones: applyAcceptBaselineOps(state.data.milestones, [{ scope: "one", targetId: action.id, reason: "Accepted baseline" }]),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "acceptAllBaselines": {
      // Bulk counterpart (wayframe#62) — the Options-menu "Accept all"
      // action, confirmed inline by the caller before dispatching.
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          milestones: applyAcceptBaselineOps(state.data.milestones, [{ scope: "all", reason: "Accepted all baselines" }]),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "editTopLevelItem": {
      // Lighter phase/top-level-milestone editor (wayframe#19) — no
      // dependsOn on TopLevelItem, so no cascade; same instant-save +
      // shared undo stack as editMilestone. A top-level milestone's date can
      // be a linksToTopLevelMilestone constraint for lane milestones, but
      // critical path is derived at the render boundary now (t14), not
      // recomputed here.
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          topLevelItems: state.data.topLevelItems.map((t) => (t.id === action.id ? ({ ...t, ...action.patch } as TopLevelItem) : t)),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
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
        data: stampUpdated(state.data, { ...state.data, bluf: { ...state.data.bluf, ...action.patch } }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "editDocument": {
      // Click-to-edit on programName/owner (chart header, RoadmapTimeline)
      // and reportsTo/nextReviewDate (Executive view) (wayframe#55/#60) —
      // same instant-save, shared-undo-stack treatment as editBluf.
      return {
        ...state,
        data: stampUpdated(state.data, { ...state.data, ...action.patch }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "editAttachments": {
      // Manual add/remove/edit-row in MilestoneEditorModal (wayframe#55/#60)
      // — routes through the same applyAttachmentOps the AI attachmentOps
      // path uses (an in-place row edit is remove-then-add at that index),
      // per the standing rule adopted in #55/#56.
      return {
        ...state,
        data: stampUpdated(state.data, { ...state.data, milestones: applyAttachmentOps(state.data.milestones, action.ops) }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "loadDocument": {
      // A structured-data import (wayframe#16) or any future ingestion path
      // replaces the whole document wholesale, not a field at a time — but
      // still shares this undo stack, so importing over an in-progress
      // roadmap is a mistake the user can recover from with the same Undo
      // button, not a destructive dead end.
      return {
        ...state,
        data: stampUpdated(state.data, action.data),
        portfolio: action.portfolio ?? state.portfolio,
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        pending: null,
        error: null,
      };
    }
    case "hydrated": {
      // Rehydrating a persisted document (wayframe#22) on mount is not a user
      // edit — it doesn't push onto the undo stack, or undo would take a
      // visitor back to whatever was rendered before the saved document
      // loaded instead of being a no-op.
      return { ...state, data: action.data, portfolio: action.portfolio, pending: null, error: null };
    }
    case "setLaneColor": {
      // Lane colour is document content (Swimlane.color), not a viewer
      // preference — it travels with the roadmap and survives export — so
      // it's a normal undoable edit, unlike the theme itself.
      return {
        ...state,
        data: stampUpdated(state.data, setLaneColorOp(state.data, action.laneId, action.color)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setRagOverride": {
      // Mirrors setLaneColor's placement/pattern (wayframe#55/#58) — a
      // manual RAG dropdown in SwimlaneManager.tsx, "auto" clears the
      // override back to the computed worst-status-wins rollup.
      return {
        ...state,
        data: stampUpdated(state.data, setRagOverrideOp(state.data, action.id, action.rag)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setLaneDensity": {
      // "Normal vs lean" row-height toggle — a manual dropdown in
      // SwimlaneManager.tsx, same undo-tracked treatment as setRagOverride.
      return {
        ...state,
        data: stampUpdated(state.data, setLaneDensityOp(state.data, action.id, action.density)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setLaneHidden": {
      // Lane-hide (wayframe t22) — document content, undo-tracked like setLaneDensity/setRagOverride.
      return {
        ...state,
        data: stampUpdated(state.data, setLaneHiddenOp(state.data, action.id, action.hidden)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "addMilestone": {
      // Created empty and immediately opened for editing by the caller —
      // the alternative (a modal that creates on save) leaves no marker on
      // the chart to anchor the interaction to. `endDate` arrives already
      // resolved (wayframe#45): the manual "+" button's shape-first picker
      // places a phase via a click-drag gesture on the chart, so by the time
      // this fires there's a real drawn span, not a placeholder to edit later.
      const milestone: Milestone = {
        id: action.newId,
        laneId: action.laneId,
        title: action.endDate ? "New phase" : "New milestone",
        date: action.date,
        endDate: action.endDate,
        status: "not-started",
        dependsOn: [],
        linksToTopLevelMilestone: null,
      };
      return {
        ...state,
        data: stampUpdated(state.data, { ...state.data, milestones: [...state.data.milestones, milestone] }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "addTopLevelItem": {
      // The PROGRAM band's own "create empty, open for editing" affordance
      // (wayframe#41, widened to annotation in wayframe#59) — mirrors
      // addMilestone above.
      const item: TopLevelItem =
        action.kind === "milestone"
          ? { id: action.newId, type: "milestone", title: "New milestone", date: action.date, status: "not-started" }
          : action.kind === "annotation"
            ? { id: action.newId, type: "annotation", title: "New annotation", date: action.date, message: "" }
            : { id: action.newId, type: "phase", title: "New phase", status: "not-started", startDate: action.date, endDate: action.date };
      return {
        ...state,
        data: stampUpdated(state.data, { ...state.data, topLevelItems: [...state.data.topLevelItems, item] }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "removeMilestone": {
      return {
        ...state,
        data: stampUpdated(state.data, removeMilestoneOp(state.data, action.id)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "removeTopLevelItem": {
      // Mirrors removeMilestone's cleanup pattern: a lane milestone can link
      // to a top-level milestone (linksToTopLevelMilestone), so that
      // reference is cleared rather than left dangling (wayframe#58).
      return {
        ...state,
        data: stampUpdated(state.data, removeTopLevelItemOp(state.data, action.id)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
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
        data: stampUpdated(state.data, { ...state.data, milestones: applyOps(state.data.milestones, cascaded) }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setMilestoneDateRange": {
      // Pill drag-to-move — translates a duration
      // pill's start and end together. `date`'s cascade can still push a
      // dependent milestone out; `endDate` is a plain field op (nothing
      // downstream depends on a pill's own finish the way it depends on a
      // predecessor's date).
      const ops: PatchOp[] = [
        { targetId: action.id, field: "date", newValue: action.date, reason: "Moved on the timeline" },
        { targetId: action.id, field: "endDate", newValue: action.endDate, reason: "Moved on the timeline" },
      ];
      const cascaded = applyCascade(state.data.milestones, ops);
      return {
        ...state,
        data: stampUpdated(state.data, { ...state.data, milestones: applyOps(state.data.milestones, cascaded) }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "toggleDependency": {
      // Predecessors and successors are the same edge seen from either end,
      // so one action serves both: the editor flips which id it passes as
      // dependent vs dependency. Self-edges are refused outright; a cycle
      // would make the critical-path walk meaningless. `showConnector`
      // defaults to true when adding (unchanged manual behavior) — widened
      // (wayframe#59) so the AI-driven dependencyOps path can set it
      // explicitly too. Shares apply.ts's applyDependencyOps with that path
      // rather than reimplementing the edge upsert, per the standing rule
      // adopted in #55/#56.
      if (action.dependentId === action.dependencyId) return state;
      const milestones = applyDependencyOps(state.data.milestones, [
        { dependentId: action.dependentId, dependencyId: action.dependencyId, add: action.add, showConnector: action.showConnector },
      ]);
      return {
        ...state,
        data: stampUpdated(state.data, { ...state.data, milestones }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "addSwimlane": {
      // Appended at the end and renumbered from scratch — `order` is the
      // only thing that positions a row, and letting gaps accumulate makes
      // the move-up/down maths fragile. Name defaults per type since the
      // manual "+" affordance creates blank, immediately-editable rows;
      // an AI-driven add (swimlaneOps) always supplies a real name instead.
      const name = action.swimlaneType === "lane" ? "New lane" : "New group";
      return {
        ...state,
        data: stampUpdated(state.data, addSwimlaneOp(state.data, action.swimlaneType, name, action.newId)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "renameSwimlane": {
      return {
        ...state,
        data: stampUpdated(state.data, renameSwimlaneOp(state.data, action.id, action.name)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "removeSwimlane": {
      // A lane owns its milestones, so deleting it deletes them — and then
      // any OTHER milestone that depended on one of them would be left
      // pointing at an id that no longer exists. That's exactly the broken
      // reference the file loader refuses to open, so the edge is stripped
      // here rather than left for a save/reload to discover.
      return {
        ...state,
        data: stampUpdated(state.data, removeSwimlaneOp(state.data, action.id)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "moveSwimlane": {
      const moved = moveSwimlaneOp(state.data, action.id, action.delta);
      if (moved === state.data) return state;
      return {
        ...state,
        data: stampUpdated(state.data, moved),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "addSwimlaneGroup": {
      // Mirrors addSwimlane: appended at the end of the top-level order
      // space, immediately-editable blank name (wayframe t21).
      return {
        ...state,
        data: stampUpdated(state.data, addSwimlaneGroupOp(state.data, "New group", action.newId)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "renameSwimlaneGroup": {
      return {
        ...state,
        data: stampUpdated(state.data, renameSwimlaneGroupOp(state.data, action.id, action.name)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "removeSwimlaneGroup": {
      // A group is an organizational wrapper, not an owner of its lanes —
      // this ungroups its members rather than deleting them or their
      // milestones (wayframe t21), unlike removeSwimlane.
      return {
        ...state,
        data: stampUpdated(state.data, removeSwimlaneGroupOp(state.data, action.id)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setSwimlaneGroupColor": {
      // Mirrors setLaneColor's placement/pattern, for a SwimlaneGroup.
      return {
        ...state,
        data: stampUpdated(state.data, setSwimlaneGroupColorOp(state.data, action.id, action.color)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setSwimlaneGroupCollapsed": {
      // Document content, not a viewer preference — same reasoning as setLaneHidden.
      return {
        ...state,
        data: stampUpdated(state.data, setSwimlaneGroupCollapsedOp(state.data, action.id, action.collapsed)),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "moveSwimlaneGroup": {
      const moved = moveSwimlaneGroupOp(state.data, action.id, action.delta);
      if (moved === state.data) return state;
      return {
        ...state,
        data: stampUpdated(state.data, moved),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setSwimlaneGroupId": {
      // Direct group-picker reassignment (wayframe t21) — distinct from
      // moveSwimlaneGroup/moveSwimlane's adjacent-swap.
      const moved = setSwimlaneGroupIdOp(state.data, action.laneId, action.groupId);
      if (moved === state.data) return state;
      return {
        ...state,
        data: stampUpdated(state.data, moved),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setSwimlaneGroupParentId": {
      // Outline tree's group-reparent control (t32) — mirrors
      // setSwimlaneGroupId's exact placement/pattern one tier up: reassigns
      // a group into a different parent group, or ungroups it to top-level
      // (`newParentGroupId: undefined`), distinct from moveSwimlaneGroup's
      // adjacent-swap.
      const moved = setSwimlaneGroupParentIdOp(state.data, action.groupId, action.newParentGroupId);
      if (moved === state.data) return state;
      return {
        ...state,
        data: stampUpdated(state.data, moved),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setCompanyLogo": {
      // Upload / replace (wayframe#46/#54) — same undo-tracked, lastUpdatedAt-bumping
      // treatment as every other document-changing action; not add-only, so a second
      // upload just overwrites the existing dataUrl. Portfolio-scoped since wayframe
      // t11 — the logo is shared across every Program in the Portfolio, not per-Program —
      // but `data`(Program)'s lastUpdatedAt still bumps: from this session's single-Program
      // view, it's still "the last time I edited something while looking at this Program."
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: { ...state.portfolio, companyLogo: { dataUrl: action.dataUrl } },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "clearCompanyLogo": {
      const rest = { ...state.portfolio };
      delete rest.companyLogo;
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: rest,
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setCompanyLogoGeometry": {
      // Freeform drag/resize commit (wayframe#64) — fired once per gesture
      // (on pointer-up), not per pointermove, same "commit at drag-end"
      // shape as setMilestoneDate. Instant-save, undo-tracked like
      // setLaneColor: document-persisted, not the viewer-local
      // use-label-overrides.ts treatment every other chart drag gets,
      // because this ticket resolved the logo's placement as something the
      // document owner sets once and expects to travel with the file.
      if (!state.portfolio.companyLogo) return state;
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: { ...state.portfolio, companyLogo: { ...state.portfolio.companyLogo, dx: action.dx, dy: action.dy, scale: action.scale } },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setThemeBase": {
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: { ...state.portfolio, theme: { baseId: action.baseId, overrides: state.portfolio.theme?.overrides } },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setThemeOverride": {
      const baseId = state.portfolio.theme?.baseId ?? defaultPortfolioTheme.baseId;
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: { ...state.portfolio, theme: { baseId, overrides: { ...state.portfolio.theme?.overrides, ...action.patch } } },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "clearThemeOverrides": {
      const baseId = state.portfolio.theme?.baseId ?? defaultPortfolioTheme.baseId;
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: { ...state.portfolio, theme: { baseId } },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
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
        if (lane.type !== "lane" || lane.rollupHistory?.[todayKey] !== undefined) return lane;
        const r = rollupByLaneId.get(lane.id);
        if (!r) return lane;
        changed = true;
        const snapshot: RollupSnapshot = { rag: r.rag, atRiskCount: r.atRiskCount, delayedCount: r.delayedCount };
        return { ...lane, rollupHistory: { ...(lane.rollupHistory ?? {}), [todayKey]: snapshot } };
      });
      return changed ? { ...state, data: { ...state.data, swimlanes } } : state;
    }
    case "setMilestoneCategory": {
      // Milestone editor's "Category" select — mirrors setLaneColor's
      // placement/pattern: not a PatchOpSchema field
      // (that union is shared with the AI-correction path, which doesn't
      // reason about categories yet), so a small dedicated action instead.
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          milestones: state.data.milestones.map((m) => (m.id === action.id ? { ...m, categoryId: action.categoryId } : m)),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setMilestoneStyleOverride": {
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          milestones: state.data.milestones.map((m) =>
            m.id === action.id ? { ...m, styleOverride: { ...m.styleOverride, ...action.patch } } : m,
          ),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "clearMilestoneStyleOverride": {
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          milestones: state.data.milestones.map((m) => {
            if (m.id !== action.id || !m.styleOverride) return m;
            const next = { ...m.styleOverride };
            delete next[action.field];
            return { ...m, styleOverride: Object.keys(next).length > 0 ? next : undefined };
          }),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setTopLevelItemStyleOverride": {
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          topLevelItems: state.data.topLevelItems.map((t) =>
            t.id === action.id && t.type !== "annotation" ? { ...t, styleOverride: { ...t.styleOverride, ...action.patch } } : t,
          ),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "clearTopLevelItemStyleOverride": {
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          topLevelItems: state.data.topLevelItems.map((t) => {
            if (t.id !== action.id || t.type === "annotation" || !t.styleOverride) return t;
            const next = { ...t.styleOverride };
            delete next[action.field];
            return { ...t, styleOverride: Object.keys(next).length > 0 ? next : undefined };
          }),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setMilestoneLaneRow": {
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          milestones: state.data.milestones.map((m) => (m.id === action.id ? { ...m, laneRow: action.laneRow } : m)),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "importMerge": {
      // Deterministic CSV/XLSX import merge — one
      // atomic edit (new lanes + field updates on matched milestones + new
      // milestones), same undo-stack treatment as any other document
      // change: a bad import is one Undo away from gone. Ids for newLanes/
      // adds are resolved by the caller (ImportDiffReview) before dispatch,
      // same "client resolves ids, reducer just commits them" pattern
      // apply()'s `adds` already uses for AI-proposed milestones.
      const swimlanes = [
        ...state.data.swimlanes,
        ...action.newLanes.map((l, i) => ({ id: l.id, order: state.data.swimlanes.length + i, type: "lane" as const, name: l.name })),
      ];
      const updatedExisting = applyOps(state.data.milestones, action.updateOps);
      const milestones = [...updatedExisting, ...action.adds];
      return {
        ...state,
        data: stampUpdated(state.data, { ...state.data, swimlanes, milestones }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "bulkEdit": {
      // Generalized mass-edit (wayframe#t33) — one atomic edit covering
      // whichever combination of field patches, deletes, and accept-
      // baselines the selection toolbar built. `applyBulkPatchToProgram`
      // handles field patches + deletes (both Milestones and TopLevelItems);
      // accept-baseline applies directly after, same reasoning
      // applyAcceptBaselineOps already isn't a PatchOp. Single history
      // entry — Undo reverses the whole bulk action at once, unchanged from
      // before this generalization.
      const patched = applyBulkPatchToProgram(state.data, action.bulkPatchOps, action.deleteIds);
      const milestones = action.acceptBaselineOps.length > 0 ? applyAcceptBaselineOps(patched.milestones, action.acceptBaselineOps) : patched.milestones;
      return {
        ...state,
        data: stampUpdated(state.data, { ...patched, milestones }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setMilestoneLane": {
      // Same-Program half of the cross-Program move dropdown (wayframe#124)
      // — picking a lane in the CURRENT Program is a plain field patch, not
      // a move: the milestone keeps its id, `rev`, dependsOn edges, and any
      // Scenario override, since none of those become invalid when the
      // milestone never actually leaves this Program. Ordinarily undoable,
      // unlike the four cross-Program cases below.
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          milestones: state.data.milestones.map((m) => (m.id === action.id ? { ...m, laneId: action.laneId } : m)),
        }),
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "receiveMovedMilestone": {
      // Destination side of a real cross-Program milestone move
      // (wayframe#124) — appends an already-cloned, fresh-id milestone built
      // by src/lib/corrections/cross-program-move.ts's `planMilestoneMove`.
      // Clears `history`/`future` rather than pushing a normal undo entry:
      // `history` is a stack of whole-DOCUMENT snapshots on THIS box alone
      // (see DocumentSnapshot), and undoing an earlier, unrelated edit here
      // would restore a now-stale snapshot (missing this milestone) with no
      // way to also undo the other half of the move that landed on the
      // OTHER box — so the move itself is deliberately not undoable, same
      // treatment "releaseMovedMilestone"/"releaseMovedSwimlane" give the
      // source side. Still a real edit otherwise: `stampUpdated` runs.
      return {
        ...state,
        data: stampUpdated(state.data, { ...state.data, milestones: [...state.data.milestones, action.milestone] }),
        history: [],
        future: [],
        error: null,
      };
    }
    case "receiveMovedSwimlane": {
      // Destination side of a real cross-Program swimlane move
      // (wayframe#124) — see "receiveMovedMilestone"'s doc for why
      // history/future are cleared rather than pushed onto.
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          swimlanes: [...state.data.swimlanes, action.swimlane],
          milestones: [...state.data.milestones, ...action.milestones],
        }),
        history: [],
        future: [],
        error: null,
      };
    }
    case "releaseMovedMilestone": {
      // Source side of a real cross-Program milestone move (wayframe#124) —
      // identical cleanup to an ordinary "removeMilestone"; see
      // "receiveMovedMilestone"'s doc for why this clears history/future
      // instead of pushing a normal undo entry.
      return {
        ...state,
        data: stampUpdated(state.data, removeMilestoneOp(state.data, action.id)),
        history: [],
        future: [],
        error: null,
      };
    }
    case "releaseMovedSwimlane": {
      // Source side of a real cross-Program swimlane move (wayframe#124) —
      // identical cleanup to an ordinary "removeSwimlane"; see
      // "receiveMovedMilestone"'s doc for the history/future clearing.
      return {
        ...state,
        data: stampUpdated(state.data, removeSwimlaneOp(state.data, action.id)),
        history: [],
        future: [],
        error: null,
      };
    }
    case "addCategory": {
      // Legend category vocabulary — mirrors
      // addSwimlaneOp's placement/pattern; CategoryManager.tsx is the
      // add/rename/recolor/delete surface, same shape as SwimlaneManager.
      // Portfolio-scoped since wayframe t11 — shared across every Program in
      // the Portfolio, not per-Program.
      const category = { id: action.newId, name: action.name, color: action.color };
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: { ...state.portfolio, legendCategories: [...(state.portfolio.legendCategories ?? []), category] },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "renameCategory": {
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: {
          ...state.portfolio,
          legendCategories: (state.portfolio.legendCategories ?? []).map((c) => (c.id === action.id ? { ...c, name: action.name } : c)),
        },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "recolorCategory": {
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: {
          ...state.portfolio,
          legendCategories: (state.portfolio.legendCategories ?? []).map((c) => (c.id === action.id ? { ...c, color: action.color } : c)),
        },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "removeCategory": {
      // Clears the dangling reference on every milestone (in this Program —
      // wayframe t11 hasn't wired cross-Program editing yet) tagged with
      // this category, same reasoning removeSwimlaneOp strips dependsOn
      // edges onto a doomed milestone — nothing should be left pointing at a
      // category id that no longer exists.
      return {
        ...state,
        data: stampUpdated(state.data, {
          ...state.data,
          milestones: state.data.milestones.map((m) => (m.categoryId === action.id ? { ...m, categoryId: null } : m)),
        }),
        portfolio: { ...state.portfolio, legendCategories: (state.portfolio.legendCategories ?? []).filter((c) => c.id !== action.id) },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "addScenario": {
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: { ...state.portfolio, scenarios: [...(state.portfolio.scenarios ?? []), createScenario(action.newId, action.name)] },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "removeScenario": {
      // Unlike removeCategory, nothing else in the document points at a
      // Scenario id today, so this is a plain filter — no dangling-reference
      // cleanup needed.
      return {
        ...state,
        data: stampUpdated(state.data, state.data),
        portfolio: { ...state.portfolio, scenarios: (state.portfolio.scenarios ?? []).filter((s) => s.id !== action.id) },
        history: [...state.history, { data: state.data, portfolio: state.portfolio }],
        error: null,
      };
    }
    case "setFromRemote": {
      // A merged Yjs update from a remote peer is not a local user edit —
      // same "hydrated"/"snapshotRollups" treatment (wayframe t38): no
      // history push (or Undo would revert a collaborator's edit instead of
      // the local user's own), no stampUpdated (that would re-stamp
      // lastUpdatedAt/bump revs for a change that already happened
      // elsewhere), and `portfolio` is left untouched — t38 only wires
      // Program content through Yjs, not Portfolio. `conflicts` is also left
      // untouched here on purpose: this fires on every merged remote update,
      // while conflicts are only added at the specific "just
      // reconnected, check pending offline edits" moment (see
      // "addConflicts"). `future` IS explicitly cleared, unlike `history` —
      // it doesn't push onto `history` so the generic "did history grow"
      // clear in `reduce`'s wrapper never fires for it, but redoing after a
      // remote edit landed would otherwise re-apply a stale whole-document
      // snapshot over that collaborator's change (wayframe UX-2026-09-18 §6).
      return { ...state, data: action.data, pending: null, error: null, future: [] };
    }
    case "addConflicts": {
      // Persistent, dismiss-only (wayframe t38's gist): re-detecting the same
      // orphaned edit across multiple resyncs shouldn't produce repeat
      // entries, so a conflict whose targetId is already in state is skipped
      // rather than appended again.
      const existingIds = new Set(state.conflicts.map((c) => c.targetId));
      const deduped = action.conflicts.filter((c) => !existingIds.has(c.targetId));
      return deduped.length === 0 ? state : { ...state, conflicts: [...state.conflicts, ...deduped] };
    }
    case "dismissConflict": {
      // Dismiss-only mechanism (wayframe t38): filters the conflict out of
      // state, nothing more — no undo, no re-surfacing.
      return { ...state, conflicts: state.conflicts.filter((c) => c.targetId !== action.targetId) };
    }
  }
}

/**
 * All state transitions in one place — see `reduceInner`'s own doc for the
 * cases themselves. This thin wrapper owns exactly one cross-cutting rule
 * (wayframe UX-2026-09-18 §6): clear the redo stack (`future`) whenever a
 * REAL EDIT lands, without having to touch every one of `reduceInner`'s ~40
 * mutating cases individually. "Real edit" = history grew (every mutating
 * case already does `history: [...state.history, snapshot]`; every
 * non-edit case — `hydrated`, `snapshotRollups`, `requestStarted`, … —
 * deliberately doesn't) — EXCEPT `redo` itself, which also grows `history`
 * by exactly one (the mirror image of `undo`) but must not wipe out the
 * rest of the stack it's still mid-popping from; `undo`/`redo` both
 * already compute their own correct `future` inside `reduceInner`, so this
 * wrapper leaves both untouched.
 */
export function reduce(state: CorrectionBoxState, action: CorrectionBoxAction): CorrectionBoxState {
  const next = reduceInner(state, action);
  if (action.type === "undo" || action.type === "redo") return next;
  if (next.history.length > state.history.length) return { ...next, future: [] };
  return next;
}

/** Ids of newly-applied entities that had no resolved date and need the editor opened for them (wayframe#59 splits this by kind — a milestone add and a PROGRAM-band add open different modals). */
export interface AppliedIds {
  milestoneIds: string[];
  topLevelItemIds: string[];
}

export interface UseCorrectionBoxResult {
  data: Program;
  /** The current Program's Portfolio (wayframe t11) — schemaVersion/companyLogo/legendCategories. */
  portfolio: Portfolio;
  pending: PendingPatch | null;
  error: string | null;
  loading: boolean;
  historyLength: number;
  /** Redo stack depth (wayframe UX-2026-09-18 §6) — drives the Redo button's disabled state, mirroring historyLength's role for Undo. */
  futureLength: number;
  submit: (text: string) => Promise<void>;
  /** Applies the pending patch's ops/adds/etc. Returns the ids of any added milestones/top-level items that had no resolved date, so the caller can open the right editor for them (mirrors addMilestone's manual "create empty, open for editing" behavior). */
  apply: () => AppliedIds;
  discard: () => void;
  undo: () => void;
  /** Re-applies the last undone edit (wayframe UX-2026-09-18 §6) — a no-op (sets `error`) when `futureLength` is 0. */
  redo: () => void;
  /** Turns one of the pending patch's ambiguous candidates into a real op — the clarifying-question answer. */
  resolveAmbiguous: (targetId: string) => void;
  editMilestone: (ops: PatchOp[]) => void;
  /** Clears one milestone's drift baseline, per the milestone editor's "Accept" button (wayframe#62). */
  acceptBaseline: (id: string) => void;
  /** Clears every currently-ghosted milestone's baseline, per the Options menu's "Accept all" action (wayframe#62). */
  acceptAllBaselines: () => void;
  editTopLevelItem: (id: string, patch: TopLevelItemPatch) => void;
  editBluf: (patch: Partial<Program["bluf"]>) => void;
  editDocument: (patch: Partial<Pick<Program, "programName" | "owner" | "reportsTo" | "nextReviewDate">>) => void;
  editAttachments: (ops: AttachmentOp[]) => void;
  setLaneColor: (laneId: string, color: string | undefined) => void;
  /** Creates a milestone (or, with endDate, a phase) in the lane and returns its id so the caller can open it. */
  addMilestone: (laneId: string, date: string, endDate?: string) => string;
  /** Creates an empty top-level milestone, phase, or annotation in the PROGRAM band and returns its id so the caller can open it. */
  addTopLevelItem: (kind: "milestone" | "phase" | "annotation", date: string) => string;
  removeMilestone: (id: string) => void;
  removeTopLevelItem: (id: string) => void;
  setMilestoneDate: (id: string, date: string) => void;
  /** Pill drag-to-move — commits both ends of a dragged duration pill at once. */
  setMilestoneDateRange: (id: string, date: string, endDate: string) => void;
  toggleDependency: (dependentId: string, dependencyId: string, add: boolean, showConnector?: boolean) => void;
  addSwimlane: (swimlaneType: "lane" | "separator") => void;
  renameSwimlane: (id: string, name: string) => void;
  removeSwimlane: (id: string) => void;
  moveSwimlane: (id: string, delta: -1 | 1) => void;
  setRagOverride: (id: string, rag: Rag | "auto") => void;
  /** "Normal vs lean" row-height toggle, per the SwimlaneManager dropdown. */
  setLaneDensity: (id: string, density: "normal" | "lean") => void;
  /** Lane-hide (t22) — excluded from layout entirely when true, per the SwimlaneManager toggle. */
  setLaneHidden: (id: string, hidden: boolean) => void;
  /** Swimlane Groups (t21) — mirrors addSwimlane; always "New group", editable after. */
  addSwimlaneGroup: () => void;
  renameSwimlaneGroup: (id: string, name: string) => void;
  /** Ungroups the group's member lanes rather than deleting them. */
  removeSwimlaneGroup: (id: string) => void;
  setSwimlaneGroupColor: (id: string, color: string | undefined) => void;
  setSwimlaneGroupCollapsed: (id: string, collapsed: boolean) => void;
  moveSwimlaneGroup: (id: string, delta: -1 | 1) => void;
  /** Direct group-picker reassignment — moves a lane into a different group, or ungroups it (`groupId: undefined`). */
  setSwimlaneGroupId: (laneId: string, groupId: string | undefined) => void;
  /** Outline tree (t32) — reassigns a group into a different parent group, or ungroups it to top-level (`newParentGroupId: undefined`). Mirrors setSwimlaneGroupId one tier up. */
  setSwimlaneGroupParentId: (groupId: string, newParentGroupId: string | undefined) => void;
  loadDocument: (data: Program) => void;
  /** File-Open — replaces the whole PortfolioDocument (Program + its Portfolio), unlike loadDocument's Program-only replace. */
  loadPortfolioDocument: (document: PortfolioDocument) => void;
  setCompanyLogo: (dataUrl: string) => void;
  clearCompanyLogo: () => void;
  /** Commits a drag/resize gesture's final dx/dy/scale (wayframe#64) — a no-op if there's no logo to move. */
  setCompanyLogoGeometry: (dx: number, dy: number, scale: number) => void;
  /** Switches the Portfolio's base theme preset — existing overrides stay live on top of it (wayframe#88/t18). */
  setThemeBase: (baseId: ThemeId) => void;
  /** Patches one or more Theme override fields (wayframe#88/t18) — see PortfolioTheme's doc in theme.ts. */
  setThemeOverride: (patch: Partial<Omit<Theme, "id">>) => void;
  /** Resets to the base preset with no overrides (wayframe#88/t18) — its own explicit action, distinct from picking a new base theme. */
  clearThemeOverrides: () => void;
  /** Legend category vocabulary management — see CategoryManager.tsx. */
  addCategory: (name: string, color: string) => void;
  renameCategory: (id: string, name: string) => void;
  recolorCategory: (id: string, color: string) => void;
  removeCategory: (id: string) => void;
  /** Minimal Scenario CRUD (t29) — create+list+remove only, see the reducer's "addScenario" case doc. */
  addScenario: (name: string) => void;
  removeScenario: (id: string) => void;
  /** Milestone editor's "Category" select — null clears the tag. */
  setMilestoneCategory: (id: string, categoryId: string | null) => void;
  /** Milestone editor's Appearance section (t19/t34) — merges into the item's styleOverride; unset fields are left alone. */
  setMilestoneStyleOverride: (id: string, patch: Partial<StyleOverride>) => void;
  /** Resets one styleOverride field back to "inherit from the ladder" (t34) — removes the key entirely, not just sets it undefined, so an override count reads accurately. */
  clearMilestoneStyleOverride: (id: string, field: keyof StyleOverride) => void;
  /** PROGRAM-band mirror of setMilestoneStyleOverride, for TopLevelItemEditorModal's own Appearance section (wayframe UX-2026-09-18 §2). No-op on an annotation id. */
  setTopLevelItemStyleOverride: (id: string, patch: Partial<StyleOverride>) => void;
  /** PROGRAM-band mirror of clearMilestoneStyleOverride. No-op on an annotation id. */
  clearTopLevelItemStyleOverride: (id: string, field: keyof StyleOverride) => void;
  /** Explicit Lane Row assignment (t20/t34) — `undefined` clears back to the implicit Row 1 default. */
  setMilestoneLaneRow: (id: string, laneRow: number | undefined) => void;
  /** Deterministic CSV/XLSX import merge — one atomic edit, see ImportDiffReview.tsx. */
  importMerge: (newLanes: { id: string; name: string }[], adds: Milestone[], updateOps: PatchOp[]) => void;
  /** Generalized mass-edit (wayframe#t33) — one atomic edit, see SelectionToolbar.tsx / src/lib/bulk-edit/{types,apply}.ts. */
  bulkEdit: (bulkPatchOps: { op: BulkPatchOp; ids: string[] }[], deleteIds: string[], acceptBaselineOps: AcceptBaselineOp[]) => void;
  /**
   * Cross-Program move primitive (wayframe#124) — low-level box actions;
   * not for direct UI use. See src/lib/corrections/cross-program-move.ts
   * for the pure planners and src/components/correction-box/cross-program-move.ts
   * for the orchestrator that actually calls these five.
   */
  setMilestoneLane: (id: string, laneId: string) => void;
  receiveMovedMilestone: (milestone: Milestone) => void;
  receiveMovedSwimlane: (swimlane: Swimlane, milestones: Milestone[]) => void;
  releaseMovedMilestone: (id: string) => void;
  releaseMovedSwimlane: (id: string) => void;
  /** Offline-edit conflicts (wayframe t38) — see CorrectionBoxState.conflicts's doc. */
  conflicts: ProgramConflict[];
  /** Replaces `data` wholesale with a merged Yjs update — not a user edit, see the "setFromRemote" reducer case's doc. */
  setFromRemote: (data: Program) => void;
  /** Appends orphaned-edit conflicts (from `detectOrphanedEdits`, program-conflict.ts), deduped by targetId. */
  addConflicts: (conflicts: ProgramConflict[]) => void;
  /** Dismiss-only removal of a conflict by targetId — never re-surfaces on its own. */
  dismissConflict: (targetId: string) => void;
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
export function useCorrectionBox(initialData: Program, initialPortfolio: Portfolio, persist = true, today = new Date()): UseCorrectionBoxResult {
  const [state, dispatch] = useReducer(
    reduce,
    { data: initialData, portfolio: initialPortfolio },
    ({ data, portfolio }) => ({
      data,
      portfolio,
      history: [],
      future: [],
      pending: null,
      error: null,
      loading: false,
      conflicts: [],
    }),
  );

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
          const result = validatePortfolioDocument(JSON.parse(saved));
          if (result.ok) {
            dispatch({ type: "hydrated", data: result.document.programs[0], portfolio: result.document.portfolio });
          } else {
            console.warn("Wayframe: discarding invalid persisted document", result.message, result.issues);
          }
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
      const document: PortfolioDocument = { portfolio: state.portfolio, programs: [state.data] };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    } catch {
      // Storage full or unavailable (e.g. private browsing) — persistence
      // is a nice-to-have, not something worth surfacing as a user error.
    }
  }, [persist, hydrated, state.data, state.portfolio]);

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
              // Given so attachmentOps "remove" can reference a real
              // 0-based index (wayframe#60) — omitted when there are none.
              ...(m.attachments && m.attachments.length > 0 && { attachments: m.attachments }),
            })),
            lanes: state.data.swimlanes.filter((l) => l.type === "lane").map((l) => ({ id: l.id, name: l.name })),
            // Full swimlane list, including separators — deletes and the
            // rename/reorder swimlaneOps kinds can target either type
            // (wayframe#58), unlike `lanes` above which addMilestones
            // still needs restricted to real lanes.
            swimlanes: state.data.swimlanes.map((l) => ({ id: l.id, name: l.name, type: l.type })),
            // Full item shape, not just {id, title} (wayframe#59) — the model
            // needs each item's own date fields/status/message to resolve
            // edit (topLevelItemOps) and create (addTopLevelItems) requests,
            // not just delete ones.
            topLevelItems: state.data.topLevelItems.map((t) =>
              t.type === "phase"
                ? { id: t.id, type: "phase", title: t.title, startDate: t.startDate, endDate: t.endDate, status: t.status }
                : t.type === "annotation"
                  ? { id: t.id, type: "annotation", title: t.title, date: t.date, message: t.message }
                  : { id: t.id, type: "milestone", title: t.title, date: t.date, status: t.status },
            ),
            // Document-header + BLUF current values, for blufOp/documentOp (wayframe#60).
            document: {
              programName: state.data.programName,
              owner: state.data.owner,
              reportsTo: state.data.reportsTo,
              nextReviewDate: state.data.nextReviewDate,
              bluf: { statement: state.data.bluf.statement, bullets: state.data.bluf.bullets, label: state.data.bluf.label },
            },
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
        const deletes: DeleteOp[] = body.patch.deletes ?? [];
        const swimlaneOps: SwimlaneOp[] = body.patch.swimlaneOps ?? [];
        const topLevelItemOps: TopLevelItemOp[] = body.patch.topLevelItemOps ?? [];
        const addTopLevelItems: AddTopLevelItemOp[] = body.patch.addTopLevelItems ?? [];
        const dependencyOps: DependencyOp[] = body.patch.dependencyOps ?? [];
        const attachmentOps: AttachmentOp[] = body.patch.attachmentOps ?? [];
        const bulkShiftOps: BulkShiftOp[] = body.patch.bulkShiftOps ?? [];
        const acceptBaselineOps: AcceptBaselineOp[] = body.patch.acceptBaselineOps ?? [];
        const blufOp: BlufOp | null = body.patch.blufOp ?? null;
        const documentOp: DocumentFieldsOp | null = body.patch.documentOp ?? null;
        const ambiguous: AmbiguousChoice | null = body.patch.ambiguous ?? null;

        if (
          directOps.length === 0 &&
          skipped.length === 0 &&
          adds.length === 0 &&
          deletes.length === 0 &&
          swimlaneOps.length === 0 &&
          topLevelItemOps.length === 0 &&
          addTopLevelItems.length === 0 &&
          dependencyOps.length === 0 &&
          attachmentOps.length === 0 &&
          bulkShiftOps.length === 0 &&
          acceptBaselineOps.length === 0 &&
          !blufOp &&
          !documentOp &&
          !ambiguous
        ) {
          dispatch({ type: "requestFailed", error: `No milestones matched "${text}"` });
          return;
        }

        // Bulk shift compiles down to ordinary date/startDate/endDate ops
        // (wayframe#57) *before* cascade runs — folded into the same
        // directOps/topLevelItemOps batches the rest of this response
        // already produces, so applyCascade's own visited-set dedup covers
        // "don't double-shift a dependent that's also in the bulk selection"
        // for free, and preview/apply/undo need no separate bulk-shift case.
        const resolvedBulkShift = resolveBulkShiftOps(state.data.milestones, state.data.topLevelItems, bulkShiftOps);
        const ops = applyCascade(state.data.milestones, [...directOps, ...resolvedBulkShift.patchOps]);
        const allTopLevelItemOps = [...topLevelItemOps, ...resolvedBulkShift.topLevelItemOps];
        dispatch({
          type: "proposed",
          pending: { inputText: text, ops, skipped, adds, deletes, swimlaneOps, topLevelItemOps: allTopLevelItemOps, addTopLevelItems, dependencyOps, attachmentOps, acceptBaselineOps, blufOp, documentOp, ambiguous },
        });
      } catch (err) {
        dispatch({ type: "requestFailed", error: err instanceof Error ? err.message : "Correction request failed." });
      }
    },
    [state.data],
  );

  const apply = useCallback((): AppliedIds => {
    if (!state.pending) return { milestoneIds: [], topLevelItemIds: [] };
    const milestoneIds: string[] = [];
    const topLevelItemIds: string[] = [];
    const adds = state.pending.adds.map((op) => {
      const id = nanoid();
      const date = op.date ?? today.toISOString().slice(0, 10);
      if (!op.date) milestoneIds.push(id);
      return { op, id, date };
    });
    // Id resolution stays at this boundary (mirrors `adds` above) rather
    // than inside applySwimlaneOps — only the "add" kind needs one, every
    // other kind already carries its own targetId.
    const resolvedSwimlaneOps = state.pending.swimlaneOps.map((op) => ({ op, newId: op.kind === "add" ? nanoid() : "" }));
    // Same "no resolved date -> flag for the editor" pattern as `adds` above
    // (wayframe#59) — a phase missing its date resolves both date and
    // endDate to today, still flagged since neither is real either.
    const resolvedTopLevelAdds = state.pending.addTopLevelItems.map((op) => {
      const id = nanoid();
      const date = op.date ?? today.toISOString().slice(0, 10);
      const endDate = op.kind === "phase" ? (op.endDate ?? date) : undefined;
      if (!op.date) topLevelItemIds.push(id);
      return { op, id, date, endDate };
    });
    dispatch({ type: "apply", adds, resolvedSwimlaneOps, resolvedTopLevelAdds });
    return { milestoneIds, topLevelItemIds };
  }, [state.pending, today]);
  const discard = useCallback(() => dispatch({ type: "discard" }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const resolveAmbiguous = useCallback((targetId: string) => dispatch({ type: "resolveAmbiguous", targetId }), []);
  const editMilestone = useCallback((ops: PatchOp[]) => dispatch({ type: "editMilestone", ops }), []);
  const acceptBaseline = useCallback((id: string) => dispatch({ type: "acceptBaseline", id }), []);
  const acceptAllBaselines = useCallback(() => dispatch({ type: "acceptAllBaselines" }), []);
  const editTopLevelItem = useCallback((id: string, patch: TopLevelItemPatch) => dispatch({ type: "editTopLevelItem", id, patch }), []);
  const editBluf = useCallback((patch: Partial<Program["bluf"]>) => dispatch({ type: "editBluf", patch }), []);
  const editDocument = useCallback(
    (patch: Partial<Pick<Program, "programName" | "owner" | "reportsTo" | "nextReviewDate">>) => dispatch({ type: "editDocument", patch }),
    [],
  );
  const editAttachments = useCallback((ops: AttachmentOp[]) => dispatch({ type: "editAttachments", ops }), []);
  const setLaneColor = useCallback((laneId: string, color: string | undefined) => dispatch({ type: "setLaneColor", laneId, color }), []);
  const addMilestone = useCallback((laneId: string, date: string, endDate?: string) => {
    const newId = nanoid();
    dispatch({ type: "addMilestone", laneId, date, endDate, newId });
    return newId;
  }, []);
  const addTopLevelItem = useCallback((kind: "milestone" | "phase" | "annotation", date: string) => {
    const newId = nanoid();
    dispatch({ type: "addTopLevelItem", kind, date, newId });
    return newId;
  }, []);
  const removeMilestone = useCallback((id: string) => dispatch({ type: "removeMilestone", id }), []);
  const removeTopLevelItem = useCallback((id: string) => dispatch({ type: "removeTopLevelItem", id }), []);
  const setMilestoneDate = useCallback((id: string, date: string) => dispatch({ type: "setMilestoneDate", id, date }), []);
  const setMilestoneDateRange = useCallback((id: string, date: string, endDate: string) => dispatch({ type: "setMilestoneDateRange", id, date, endDate }), []);
  const toggleDependency = useCallback(
    (dependentId: string, dependencyId: string, add: boolean, showConnector?: boolean) =>
      dispatch({ type: "toggleDependency", dependentId, dependencyId, add, showConnector }),
    [],
  );
  const addSwimlane = useCallback((swimlaneType: "lane" | "separator") => dispatch({ type: "addSwimlane", swimlaneType, newId: nanoid() }), []);
  const renameSwimlane = useCallback((id: string, name: string) => dispatch({ type: "renameSwimlane", id, name }), []);
  const removeSwimlane = useCallback((id: string) => dispatch({ type: "removeSwimlane", id }), []);
  const moveSwimlane = useCallback((id: string, delta: -1 | 1) => dispatch({ type: "moveSwimlane", id, delta }), []);
  const setRagOverride = useCallback((id: string, rag: Rag | "auto") => dispatch({ type: "setRagOverride", id, rag }), []);
  const setLaneDensity = useCallback((id: string, density: "normal" | "lean") => dispatch({ type: "setLaneDensity", id, density }), []);
  const setLaneHidden = useCallback((id: string, hidden: boolean) => dispatch({ type: "setLaneHidden", id, hidden }), []);
  const addSwimlaneGroup = useCallback(() => dispatch({ type: "addSwimlaneGroup", newId: nanoid() }), []);
  const renameSwimlaneGroup = useCallback((id: string, name: string) => dispatch({ type: "renameSwimlaneGroup", id, name }), []);
  const removeSwimlaneGroup = useCallback((id: string) => dispatch({ type: "removeSwimlaneGroup", id }), []);
  const setSwimlaneGroupColor = useCallback((id: string, color: string | undefined) => dispatch({ type: "setSwimlaneGroupColor", id, color }), []);
  const setSwimlaneGroupCollapsed = useCallback((id: string, collapsed: boolean) => dispatch({ type: "setSwimlaneGroupCollapsed", id, collapsed }), []);
  const moveSwimlaneGroup = useCallback((id: string, delta: -1 | 1) => dispatch({ type: "moveSwimlaneGroup", id, delta }), []);
  const setSwimlaneGroupId = useCallback((laneId: string, groupId: string | undefined) => dispatch({ type: "setSwimlaneGroupId", laneId, groupId }), []);
  const setSwimlaneGroupParentId = useCallback(
    (groupId: string, newParentGroupId: string | undefined) => dispatch({ type: "setSwimlaneGroupParentId", groupId, newParentGroupId }),
    [],
  );
  const loadDocument = useCallback((data: Program) => dispatch({ type: "loadDocument", data }), []);
  /** File-Open (wayframe t11) — replaces the whole PortfolioDocument, unlike loadDocument's Program-only replace (ImportPanel's structured-data import), since a .wayframe.json round-trips Portfolio content (logo/legend) too. */
  const loadPortfolioDocument = useCallback(
    (document: PortfolioDocument) => dispatch({ type: "loadDocument", data: document.programs[0], portfolio: document.portfolio }),
    [],
  );
  const setCompanyLogo = useCallback((dataUrl: string) => dispatch({ type: "setCompanyLogo", dataUrl }), []);
  const clearCompanyLogo = useCallback(() => dispatch({ type: "clearCompanyLogo" }), []);
  const setCompanyLogoGeometry = useCallback((dx: number, dy: number, scale: number) => dispatch({ type: "setCompanyLogoGeometry", dx, dy, scale }), []);
  const setThemeBase = useCallback((baseId: ThemeId) => dispatch({ type: "setThemeBase", baseId }), []);
  const setThemeOverride = useCallback((patch: Partial<Omit<Theme, "id">>) => dispatch({ type: "setThemeOverride", patch }), []);
  const clearThemeOverrides = useCallback(() => dispatch({ type: "clearThemeOverrides" }), []);
  const addCategory = useCallback((name: string, color: string) => dispatch({ type: "addCategory", name, color, newId: nanoid() }), []);
  const renameCategory = useCallback((id: string, name: string) => dispatch({ type: "renameCategory", id, name }), []);
  const recolorCategory = useCallback((id: string, color: string) => dispatch({ type: "recolorCategory", id, color }), []);
  const removeCategory = useCallback((id: string) => dispatch({ type: "removeCategory", id }), []);
  const addScenario = useCallback((name: string) => dispatch({ type: "addScenario", name, newId: nanoid() }), []);
  const removeScenario = useCallback((id: string) => dispatch({ type: "removeScenario", id }), []);
  const setMilestoneCategory = useCallback((id: string, categoryId: string | null) => dispatch({ type: "setMilestoneCategory", id, categoryId }), []);
  const setMilestoneStyleOverride = useCallback((id: string, patch: Partial<StyleOverride>) => dispatch({ type: "setMilestoneStyleOverride", id, patch }), []);
  const clearMilestoneStyleOverride = useCallback((id: string, field: keyof StyleOverride) => dispatch({ type: "clearMilestoneStyleOverride", id, field }), []);
  const setTopLevelItemStyleOverride = useCallback((id: string, patch: Partial<StyleOverride>) => dispatch({ type: "setTopLevelItemStyleOverride", id, patch }), []);
  const clearTopLevelItemStyleOverride = useCallback((id: string, field: keyof StyleOverride) => dispatch({ type: "clearTopLevelItemStyleOverride", id, field }), []);
  const setMilestoneLaneRow = useCallback((id: string, laneRow: number | undefined) => dispatch({ type: "setMilestoneLaneRow", id, laneRow }), []);
  const importMerge = useCallback(
    (newLanes: { id: string; name: string }[], adds: Milestone[], updateOps: PatchOp[]) => dispatch({ type: "importMerge", newLanes, adds, updateOps }),
    [],
  );
  const bulkEdit = useCallback(
    (bulkPatchOps: { op: BulkPatchOp; ids: string[] }[], deleteIds: string[], acceptBaselineOps: AcceptBaselineOp[]) =>
      dispatch({ type: "bulkEdit", bulkPatchOps, deleteIds, acceptBaselineOps }),
    [],
  );
  const setMilestoneLane = useCallback((id: string, laneId: string) => dispatch({ type: "setMilestoneLane", id, laneId }), []);
  const receiveMovedMilestone = useCallback((milestone: Milestone) => dispatch({ type: "receiveMovedMilestone", milestone }), []);
  const receiveMovedSwimlane = useCallback((swimlane: Swimlane, milestones: Milestone[]) => dispatch({ type: "receiveMovedSwimlane", swimlane, milestones }), []);
  const releaseMovedMilestone = useCallback((id: string) => dispatch({ type: "releaseMovedMilestone", id }), []);
  const releaseMovedSwimlane = useCallback((id: string) => dispatch({ type: "releaseMovedSwimlane", id }), []);
  const setFromRemote = useCallback((data: Program) => dispatch({ type: "setFromRemote", data }), []);
  const addConflicts = useCallback((conflicts: ProgramConflict[]) => dispatch({ type: "addConflicts", conflicts }), []);
  const dismissConflict = useCallback((targetId: string) => dispatch({ type: "dismissConflict", targetId }), []);

  return {
    data: state.data,
    portfolio: state.portfolio,
    pending: state.pending,
    error: state.error,
    loading: state.loading,
    historyLength: state.history.length,
    futureLength: state.future.length,
    submit,
    apply,
    discard,
    undo,
    redo,
    resolveAmbiguous,
    editMilestone,
    acceptBaseline,
    acceptAllBaselines,
    editTopLevelItem,
    editBluf,
    editDocument,
    editAttachments,
    setLaneColor,
    addMilestone,
    addTopLevelItem,
    removeMilestone,
    removeTopLevelItem,
    setMilestoneDate,
    setMilestoneDateRange,
    toggleDependency,
    addSwimlane,
    renameSwimlane,
    removeSwimlane,
    moveSwimlane,
    setRagOverride,
    setLaneDensity,
    setLaneHidden,
    addSwimlaneGroup,
    renameSwimlaneGroup,
    removeSwimlaneGroup,
    setSwimlaneGroupColor,
    setSwimlaneGroupCollapsed,
    moveSwimlaneGroup,
    setSwimlaneGroupId,
    setSwimlaneGroupParentId,
    loadDocument,
    loadPortfolioDocument,
    setCompanyLogo,
    clearCompanyLogo,
    setCompanyLogoGeometry,
    setThemeBase,
    setThemeOverride,
    clearThemeOverrides,
    addCategory,
    renameCategory,
    recolorCategory,
    removeCategory,
    addScenario,
    removeScenario,
    setMilestoneCategory,
    setMilestoneStyleOverride,
    clearMilestoneStyleOverride,
    setTopLevelItemStyleOverride,
    clearTopLevelItemStyleOverride,
    setMilestoneLaneRow,
    importMerge,
    bulkEdit,
    setMilestoneLane,
    receiveMovedMilestone,
    receiveMovedSwimlane,
    releaseMovedMilestone,
    releaseMovedSwimlane,
    conflicts: state.conflicts,
    setFromRemote,
    addConflicts,
    dismissConflict,
  };
}
