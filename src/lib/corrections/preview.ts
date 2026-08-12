import type { Milestone, Swimlane, TopLevelItem } from "@/components/timeline/types";
import type {
  AddMilestoneOp,
  AddTopLevelItemOp,
  AmbiguousChoice,
  AttachmentOp,
  BlufOp,
  DeleteOp,
  DependencyOp,
  DocumentFieldsOp,
  PatchOp,
  Skipped,
  SwimlaneOp,
  TopLevelItemOp,
} from "./schema";

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

export interface PreviewDeleteRow {
  targetId: string;
  targetTitle: string;
  entityType: DeleteOp["entityType"];
  reason: string;
}

/**
 * Resolves a generic delete's target id against whichever list its
 * entityType names (wayframe#58) — previously had no preview row at all, so
 * a delete-only proposal rendered as "I couldn't make sense of that" with no
 * way to Apply it (see CorrectionBox.tsx's hasCleanResolution). Fixed here
 * alongside the wayframe#59 op families it shares the pending-patch card
 * with, since the same gap would otherwise swallow those too.
 */
export function buildDeletePreview(
  milestones: readonly Milestone[],
  topLevelItems: readonly TopLevelItem[],
  swimlanes: readonly Swimlane[],
  deletes: readonly DeleteOp[],
): PreviewDeleteRow[] {
  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  const topLevelById = new Map(topLevelItems.map((t) => [t.id, t]));
  const swimlaneById = new Map(swimlanes.map((l) => [l.id, l]));
  return deletes.map((d) => {
    const title =
      d.entityType === "milestone" ? milestoneById.get(d.targetId)?.title : d.entityType === "topLevelItem" ? topLevelById.get(d.targetId)?.title : swimlaneById.get(d.targetId)?.name;
    return { targetId: d.targetId, targetTitle: title ?? d.targetId, entityType: d.entityType, reason: d.reason };
  });
}

export interface PreviewSwimlaneOpRow {
  kind: SwimlaneOp["kind"];
  targetTitle: string;
  detail: string;
  reason: string;
}

/** Mirrors buildDeletePreview's fix — swimlaneOps had the same missing-preview gap since #58 introduced it. */
export function buildSwimlaneOpPreview(swimlanes: readonly Swimlane[], ops: readonly SwimlaneOp[]): PreviewSwimlaneOpRow[] {
  const byId = new Map(swimlanes.map((l) => [l.id, l]));
  return ops.map((op) => {
    switch (op.kind) {
      case "add":
        return { kind: op.kind, targetTitle: op.name, detail: `new ${op.swimlaneType}`, reason: op.reason };
      case "rename":
        return { kind: op.kind, targetTitle: byId.get(op.targetId)?.name ?? op.targetId, detail: `rename to "${op.name}"`, reason: op.reason };
      case "reorder":
        return { kind: op.kind, targetTitle: byId.get(op.targetId)?.name ?? op.targetId, detail: op.delta === -1 ? "move up" : "move down", reason: op.reason };
      case "recolor":
        return { kind: op.kind, targetTitle: byId.get(op.targetId)?.name ?? op.targetId, detail: `recolor ${op.color}`, reason: op.reason };
      case "ragOverride":
        return { kind: op.kind, targetTitle: byId.get(op.targetId)?.name ?? op.targetId, detail: `RAG → ${op.rag}`, reason: op.reason };
    }
  });
}

export interface PreviewTopLevelItemOpRow {
  targetId: string;
  targetTitle: string;
  field: TopLevelItemOp["field"];
  newValue: string;
  reason: string;
}

export function buildTopLevelItemOpPreview(topLevelItems: readonly TopLevelItem[], ops: readonly TopLevelItemOp[]): PreviewTopLevelItemOpRow[] {
  const byId = new Map(topLevelItems.map((t) => [t.id, t]));
  return ops.map((op) => ({
    targetId: op.targetId,
    targetTitle: byId.get(op.targetId)?.title ?? op.targetId,
    field: op.field,
    newValue: String(op.newValue),
    reason: op.reason,
  }));
}

export interface PreviewAddTopLevelItemRow {
  kind: AddTopLevelItemOp["kind"];
  title: string;
  date: string | null;
  reason: string;
}

export function buildAddTopLevelItemPreview(adds: readonly AddTopLevelItemOp[]): PreviewAddTopLevelItemRow[] {
  return adds.map((a) => ({ kind: a.kind, title: a.title, date: a.date, reason: a.reason }));
}

export interface PreviewDependencyOpRow {
  dependentTitle: string;
  dependencyTitle: string;
  add: boolean;
  showConnector?: boolean;
  reason: string;
}

export function buildDependencyOpPreview(milestones: readonly Milestone[], ops: readonly DependencyOp[]): PreviewDependencyOpRow[] {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  return ops.map((op) => ({
    dependentTitle: byId.get(op.dependentId)?.title ?? op.dependentId,
    dependencyTitle: byId.get(op.dependencyId)?.title ?? op.dependencyId,
    add: op.add,
    showConnector: op.showConnector,
    reason: op.reason,
  }));
}

export interface PreviewAttachmentOpRow {
  targetId: string;
  targetTitle: string;
  action: AttachmentOp["action"];
  detail: string;
  reason: string;
}

/** Mirrors buildDeletePreview/buildSwimlaneOpPreview's "give the pending card something to render" fix, applied to the new attachmentOps family (wayframe#60). */
export function buildAttachmentOpPreview(milestones: readonly Milestone[], ops: readonly AttachmentOp[]): PreviewAttachmentOpRow[] {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  return ops.map((op) => ({
    targetId: op.targetId,
    targetTitle: byId.get(op.targetId)?.title ?? op.targetId,
    action: op.action,
    detail: op.action === "add" ? `${op.attachment.type}: ${op.attachment.url}${op.attachment.label ? ` (${op.attachment.label})` : ""}` : `attachment #${op.index + 1}`,
    reason: op.reason,
  }));
}

/** A single-entity op with no targetId of its own (blufOp/documentOp are document-level, not per-milestone) — just the changed field names/values for display. */
export interface PreviewFieldChangeRow {
  field: string;
  newValue: string;
}

export function buildBlufOpPreview(op: BlufOp | null): PreviewFieldChangeRow[] {
  if (!op) return [];
  const rows: PreviewFieldChangeRow[] = [];
  if (op.statement !== undefined) rows.push({ field: "statement", newValue: op.statement });
  if (op.bullets !== undefined) rows.push({ field: "bullets", newValue: op.bullets.join("; ") });
  if (op.label !== undefined) rows.push({ field: "label", newValue: op.label });
  return rows;
}

export function buildDocumentOpPreview(op: DocumentFieldsOp | null): PreviewFieldChangeRow[] {
  if (!op) return [];
  const rows: PreviewFieldChangeRow[] = [];
  if (op.programName !== undefined) rows.push({ field: "programName", newValue: op.programName });
  if (op.owner !== undefined) rows.push({ field: "owner", newValue: op.owner });
  if (op.reportsTo !== undefined) rows.push({ field: "reportsTo", newValue: op.reportsTo });
  if (op.nextReviewDate !== undefined) rows.push({ field: "nextReviewDate", newValue: op.nextReviewDate });
  return rows;
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
