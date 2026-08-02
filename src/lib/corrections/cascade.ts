import type { Milestone } from "@/components/timeline/types";
import type { PatchOp } from "./schema";

/**
 * Cascading through dependsOn stays a deterministic client-side graph walk,
 * not something asked of the LLM (issue #9's resolution). After the direct
 * ops proposed by /api/correct are known, this pushes out any dependent
 * milestone whose date would now precede its (possibly-already-cascaded)
 * predecessor's new date — a BFS over the dependency graph, one day of
 * slack past the predecessor.
 *
 * Only date shifts cascade; a status-only op on a predecessor doesn't imply
 * anything about a dependent's date.
 */

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isBefore(a: string, b: string): boolean {
  return a < b;
}

export function applyCascade(milestones: readonly Milestone[], directOps: readonly PatchOp[]): PatchOp[] {
  const byId = new Map(milestones.map((m) => [m.id, m]));

  const dependents = new Map<string, string[]>();
  for (const m of milestones) {
    for (const dep of m.dependsOn) {
      if (!dependents.has(dep.id)) dependents.set(dep.id, []);
      dependents.get(dep.id)!.push(m.id);
    }
  }

  const dateOps = directOps.filter((op): op is Extract<PatchOp, { field: "date" }> => op.field === "date");
  const ops: PatchOp[] = [...directOps];

  const effectiveDate = new Map<string, string>(dateOps.map((op) => [op.targetId, op.newValue]));
  const visited = new Set(dateOps.map((op) => op.targetId));
  const queue = [...visited];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const predecessorNewDate = effectiveDate.get(id);
    if (predecessorNewDate === undefined) continue;
    const predecessor = byId.get(id);

    for (const depId of dependents.get(id) ?? []) {
      if (visited.has(depId)) continue;
      const dependent = byId.get(depId);
      if (!dependent) continue;

      const current = effectiveDate.get(depId) ?? dependent.date;
      const minAllowed = addDays(predecessorNewDate, 1);
      if (isBefore(current, minAllowed)) {
        ops.push({
          targetId: dependent.id,
          field: "date",
          newValue: minAllowed,
          reason: `cascaded — would otherwise start before "${predecessor?.title ?? id}"`,
        });
        effectiveDate.set(depId, minAllowed);
        visited.add(depId);
        queue.push(depId);
      }
    }
  }

  return ops;
}
