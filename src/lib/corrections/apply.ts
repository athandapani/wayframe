import type { Milestone, TopLevelItem } from "@/components/timeline/types";
import type { AddMilestoneOp, AddTopLevelItemOp, AttachmentOp, DependencyOp, PatchOp, TopLevelItemOp } from "./schema";

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
    endDate: op.endDate ?? undefined,
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
  }));
}

/**
 * Commits topLevelItemOps onto the PROGRAM-band item list (wayframe#59) —
 * mirrors applyOps' "reduce every matching op onto that item" shape, but a
 * blind field merge rather than a typed switch: TopLevelItem's three variants
 * don't share one field set the way Milestone does, and the caller
 * (coerceTopLevelItemOp) already only lets through fields the schema knows
 * about, so a merge is exactly as safe as editTopLevelItem's existing manual
 * reducer action, which does the same thing.
 */
export function applyTopLevelItemOps(items: readonly TopLevelItem[], ops: readonly TopLevelItemOp[]): TopLevelItem[] {
  return items.map((t) => {
    const matching = ops.filter((o) => o.targetId === t.id);
    if (matching.length === 0) return t;
    const patch: Record<string, unknown> = {};
    for (const op of matching) patch[op.field] = op.newValue;
    return { ...t, ...patch } as TopLevelItem;
  });
}

/**
 * Turns proposed add ops into real TopLevelItem records (wayframe#59) —
 * mirrors applyAddMilestoneOps. `date`/`endDate` are resolved fallbacks
 * (mirrors the caller's "today, and flag for the editor" pattern for adds
 * with no date), unlike AddTopLevelItemOp's own nullable fields.
 */
export function applyAddTopLevelItemOps(
  adds: readonly { op: AddTopLevelItemOp; id: string; date: string; endDate?: string }[],
): TopLevelItem[] {
  return adds.map(({ op, id, date, endDate }) => {
    if (op.kind === "phase") return { id, type: "phase", title: op.title, status: "not-started", startDate: date, endDate: endDate ?? date };
    if (op.kind === "annotation") return { id, type: "annotation", title: op.title, date, message: op.message };
    return { id, type: "milestone", title: op.title, date, status: "not-started" };
  });
}

/**
 * Commits dependencyOps onto the milestone list (wayframe#59) — mirrors
 * use-correction-box.ts's toggleDependency reducer action exactly (add
 * upserts the edge with the given/default showConnector, remove drops it),
 * factored out here so the AI-correction path and the manual EdgeEditor
 * share one implementation instead of two that could drift, per the standing
 * rule adopted in #55/#56. Takes just the executable fields (not the full
 * DependencyOp, which also carries `reason` — an AI-explanation field the
 * manual single-edge toggle has no equivalent of).
 */
export function applyDependencyOps(
  milestones: readonly Milestone[],
  ops: readonly Pick<DependencyOp, "dependentId" | "dependencyId" | "add" | "showConnector">[],
): Milestone[] {
  return ops.reduce((acc, op) => {
    if (op.dependentId === op.dependencyId) return acc;
    return acc.map((m) => {
      if (m.id !== op.dependentId) return m;
      const without = m.dependsOn.filter((d) => d.id !== op.dependencyId);
      return op.add ? { ...m, dependsOn: [...without, { id: op.dependencyId, showConnector: op.showConnector ?? true }] } : { ...m, dependsOn: without };
    });
  }, milestones as Milestone[]);
}

/**
 * Commits attachmentOps onto the milestone list (wayframe#55/#60) — shared by
 * the AI attachmentOps path and the manual editor's row add/remove/edit
 * (an edit is remove-then-add at the same index), per the standing rule
 * adopted in #55/#56: one implementation, not two that could drift.
 */
export function applyAttachmentOps(milestones: readonly Milestone[], ops: readonly AttachmentOp[]): Milestone[] {
  return ops.reduce((acc, op) => {
    return acc.map((m) => {
      if (m.id !== op.targetId) return m;
      const attachments = m.attachments ?? [];
      if (op.action === "remove") {
        return { ...m, attachments: attachments.filter((_, i) => i !== op.index) };
      }
      const next = [...attachments];
      if (op.index !== undefined && op.index <= next.length) next.splice(op.index, 0, op.attachment);
      else next.push(op.attachment);
      return { ...m, attachments: next };
    });
  }, milestones as Milestone[]);
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
    case "endDate":
      return { ...m, endDate: op.newValue || undefined };
    case "potentialDate":
      return { ...m, potentialDate: op.newValue || undefined };
  }
}
