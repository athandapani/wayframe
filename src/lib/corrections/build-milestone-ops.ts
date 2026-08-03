import type { Milestone } from "@/components/timeline/types";
import type { PatchOp } from "./schema";

/** The v1 field set from wayframe#17 — every field the manual editor can touch. */
export interface EditableMilestoneFields {
  title: string;
  date: string;
  status: Milestone["status"];
  percentComplete: number;
  owner: string;
  comment: string;
  isCriticalPath: boolean;
  shortLabel: string;
}

export function milestoneToEditableFields(m: Milestone): EditableMilestoneFields {
  return {
    title: m.title,
    date: m.date,
    status: m.status,
    percentComplete: m.percentComplete ?? 0,
    owner: m.owner ?? "",
    comment: m.comment ?? "",
    isCriticalPath: m.isCriticalPath,
    shortLabel: m.shortLabel ?? "",
  };
}

/**
 * Diffs a modal's draft against the milestone it started from, emitting one
 * PatchOp per changed field — unchanged fields produce no op, so a save
 * that only touched the date doesn't also stamp a no-op status/title/etc.
 * onto the undo history. `reason` is a fixed, non-AI string since these ops
 * never go near the model (see PatchOpSchema's doc in schema.ts).
 */
export function buildMilestoneEditOps(original: Milestone, draft: EditableMilestoneFields): PatchOp[] {
  const before = milestoneToEditableFields(original);
  const ops: PatchOp[] = [];
  const reason = "manual edit";

  if (draft.title !== before.title) ops.push({ targetId: original.id, field: "title", newValue: draft.title, reason });
  if (draft.date !== before.date) ops.push({ targetId: original.id, field: "date", newValue: draft.date, reason });
  if (draft.status !== before.status) ops.push({ targetId: original.id, field: "status", newValue: draft.status, reason });
  if (draft.percentComplete !== before.percentComplete) ops.push({ targetId: original.id, field: "percentComplete", newValue: draft.percentComplete, reason });
  if (draft.owner !== before.owner) ops.push({ targetId: original.id, field: "owner", newValue: draft.owner, reason });
  if (draft.comment !== before.comment) ops.push({ targetId: original.id, field: "comment", newValue: draft.comment, reason });
  if (draft.isCriticalPath !== before.isCriticalPath) ops.push({ targetId: original.id, field: "isCriticalPath", newValue: draft.isCriticalPath, reason });
  if (draft.shortLabel !== before.shortLabel) ops.push({ targetId: original.id, field: "shortLabel", newValue: draft.shortLabel, reason });

  return ops;
}
