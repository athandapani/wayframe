import type { Milestone } from "@/components/timeline/types";
import type { PatchOp, Skipped } from "./schema";

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
