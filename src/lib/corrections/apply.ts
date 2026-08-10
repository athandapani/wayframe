import type { Milestone } from "@/components/timeline/types";
import type { AddMilestoneOp, PatchOp } from "./schema";

/**
 * Commits a set of ops (direct + cascaded) onto a milestone list. A date op
 * stamps `originalDate` the first time a given milestone slips (issue #9's
 * "baseline, set once" rule) — later shifts don't move the baseline again.
 * A milestone can receive more than one op in the same batch (the manual
 * editor's direct edit is typically several field ops at once) — apply them
 * in order rather than picking just one match.
 */
export function applyOps(milestones: readonly Milestone[], ops: readonly PatchOp[]): Milestone[] {
  return milestones.map((m) => {
    return ops.filter((o) => o.targetId === m.id).reduce((acc, op) => applyOp(acc, op), m);
  });
}

/**
 * Turns proposed add ops into real Milestone records. `date` is required
 * (unlike AddMilestoneOp's optional one) — the caller resolves a fallback
 * date (today, mirroring the manual "+" button, see use-correction-box.ts's
 * addMilestone action) for any add the model couldn't parse a date out of,
 * *before* calling this, since which ones needed a fallback is exactly what
 * decides whether the editor should auto-open for them afterward.
 */
export function applyAddMilestoneOps(
  adds: readonly { op: AddMilestoneOp; id: string; date: string }[],
): Milestone[] {
  return adds.map(({ op, id, date }) => ({
    id,
    laneId: op.laneId,
    title: op.title,
    date,
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
  }));
}

function applyOp(m: Milestone, op: PatchOp): Milestone {
  switch (op.field) {
    case "date":
      return { ...m, date: op.newValue, originalDate: m.originalDate ?? m.date };
    case "status":
      return { ...m, status: op.newValue };
    case "title":
      return { ...m, title: op.newValue };
    case "percentComplete":
      return { ...m, percentComplete: op.newValue };
    case "owner":
      return { ...m, owner: op.newValue || undefined };
    case "comment":
      return { ...m, comment: op.newValue || undefined };
    case "isCriticalPathOverride":
      return { ...m, isCriticalPathOverride: op.newValue };
    case "shortLabel":
      return { ...m, shortLabel: op.newValue || undefined };
    case "showReferenceLine":
      return { ...m, showReferenceLine: op.newValue };
  }
}
