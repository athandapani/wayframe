import type { Milestone, Swimlane } from "@/components/timeline/types";
import type { AddMilestoneOp, AmbiguousChoice, PatchOp, Skipped } from "./schema";

/**
 * Resolves a proposed patch's ops/skipped ids against the live milestone
 * list into display-ready rows (title + previous value) for the
 * preview-before-commit card — issue #9's "per-op reason, explicitly-listed
 * skipped candidates" requirement.
 */

export interface PreviewOpRow {
  targetId: string;
  targetTitle: string;
  field: PatchOp["field"];
  previousValue: string;
  newValue: string;
  reason: string;
}

export interface PreviewSkippedRow {
  targetId: string;
  targetTitle: string;
  reason: string;
}

/** Stringifies a milestone's current value for whichever field an op targets — the AI correction path only ever proposes date/status, but the manual editor (wayframe#18/#19) shares this same PatchOp shape for the rest. */
function fieldValue(m: Milestone, field: PatchOp["field"]): string {
  const v = m[field];
  return v === undefined ? "(none)" : String(v);
}

export function buildOpPreview(milestones: readonly Milestone[], ops: readonly PatchOp[]): PreviewOpRow[] {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  return ops.map((op) => {
    const m = byId.get(op.targetId);
    return {
      targetId: op.targetId,
      targetTitle: m?.title ?? op.targetId,
      field: op.field,
      previousValue: m ? fieldValue(m, op.field) : "?",
      newValue: String(op.newValue),
      reason: op.reason,
    };
  });
}

export function buildSkippedPreview(milestones: readonly Milestone[], skipped: readonly Skipped[]): PreviewSkippedRow[] {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  return skipped.map((s) => ({
    targetId: s.targetId,
    targetTitle: byId.get(s.targetId)?.title ?? s.targetId,
    reason: s.reason,
  }));
}

export interface PreviewAddRow {
  title: string;
  laneName: string;
  date: string | null;
  reason: string;
}

export function buildAddPreview(swimlanes: readonly Swimlane[], adds: readonly AddMilestoneOp[]): PreviewAddRow[] {
  const laneById = new Map(swimlanes.map((l) => [l.id, l]));
  return adds.map((a) => ({
    title: a.title,
    laneName: laneById.get(a.laneId)?.name ?? a.laneId,
    date: a.date,
    reason: a.reason,
  }));
}

export interface PreviewAmbiguousCandidateRow {
  targetId: string;
  targetTitle: string;
  laneName: string;
  newValue: string;
}

export interface PreviewAmbiguous {
  field: AmbiguousChoice["field"];
  reason: string;
  candidates: PreviewAmbiguousCandidateRow[];
}

/** Resolves an ambiguous tie's candidate ids into display-ready rows for the clarifying-question UI (wayframe#38 item 1 / #39). */
export function buildAmbiguousPreview(
  milestones: readonly Milestone[],
  swimlanes: readonly Swimlane[],
  ambiguous: AmbiguousChoice,
): PreviewAmbiguous {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const laneById = new Map(swimlanes.map((l) => [l.id, l]));
  return {
    field: ambiguous.field,
    reason: ambiguous.reason,
    candidates: ambiguous.candidates.map((c) => {
      const m = byId.get(c.targetId);
      return {
        targetId: c.targetId,
        targetTitle: m?.title ?? c.targetId,
        laneName: (m && laneById.get(m.laneId)?.name) ?? "",
        newValue: c.newValue,
      };
    }),
  };
}
