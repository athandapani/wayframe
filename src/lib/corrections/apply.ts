import type { Milestone } from "@/components/timeline/types";
import type { PatchOp } from "./schema";

/**
 * Commits a set of ops (direct + cascaded) onto a milestone list. A date op
 * stamps `originalDate` the first time a given milestone slips (issue #9's
 * "baseline, set once" rule) — later shifts don't move the baseline again.
 */
export function applyOps(milestones: readonly Milestone[], ops: readonly PatchOp[]): Milestone[] {
  return milestones.map((m) => {
    const op = ops.find((o) => o.targetId === m.id);
    if (!op) return m;
    if (op.field === "date") {
      return { ...m, date: op.newValue, originalDate: m.originalDate ?? m.date };
    }
    return { ...m, status: op.newValue };
  });
}
