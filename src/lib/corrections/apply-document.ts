import type { Rag, RoadmapData } from "@/components/timeline/types";
import type { DeleteOp, NamedLaneColor, SwimlaneOp } from "./schema";

/**
 * Whole-document mutations (wayframe#58) — distinct from apply.ts's
 * applyOps/applyAddMilestoneOps, which only ever touch the milestone list.
 * Deletes and swimlane management reach across milestones/topLevelItems/
 * swimlanes together (e.g. deleting a lane also strips the milestones it
 * owns), so each op here takes and returns the full RoadmapData. These are
 * the single source of truth for that cleanup logic — useCorrectionBox's
 * manual reducer actions (removeMilestone, removeSwimlane, addSwimlane,
 * renameSwimlane, moveSwimlane, setLaneColor) call the same functions
 * rather than re-implementing the cleanup, so the manual-UI path and the
 * AI-correction path can't drift apart.
 */

/** Curated recolor palette (wayframe#58) — resolves a model-emitted name to a real hex value; the model itself never emits a hex. */
const NAMED_LANE_COLOR_HEX: Record<NamedLaneColor, string> = {
  red: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
  blue: "#2563eb",
  purple: "#9333ea",
  gray: "#6b7280",
};

export function resolveNamedLaneColor(name: NamedLaneColor): string {
  return NAMED_LANE_COLOR_HEX[name];
}

/** Mirrors removeSwimlane's dependsOn cleanup: a milestone other milestones depend on can't vanish and leave those edges dangling (wayframe#38 item 3 / #39). */
export function removeMilestoneOp(data: RoadmapData, id: string): RoadmapData {
  const milestones = data.milestones
    .filter((m) => m.id !== id)
    .map((m) => (m.dependsOn.some((d) => d.id === id) ? { ...m, dependsOn: m.dependsOn.filter((d) => d.id !== id) } : m));
  return { ...data, milestones };
}

/** A lane owns its milestones, so deleting it deletes them too, then strips any OTHER milestone's dependency on one of the doomed ids. Order is renumbered so no gaps remain. */
export function removeSwimlaneOp(data: RoadmapData, id: string): RoadmapData {
  const doomed = new Set(data.milestones.filter((m) => m.laneId === id).map((m) => m.id));
  const milestones = data.milestones
    .filter((m) => m.laneId !== id)
    .map((m) => (m.dependsOn.some((d) => doomed.has(d.id)) ? { ...m, dependsOn: m.dependsOn.filter((d) => !doomed.has(d.id)) } : m));
  const swimlanes = data.swimlanes
    .filter((l) => l.id !== id)
    .sort((a, b) => a.order - b.order)
    .map((l, i) => ({ ...l, order: i }));
  return { ...data, swimlanes, milestones };
}

/** No dependsOn/laneId to clean up, unlike a milestone — but a lane milestone can link to a top-level milestone (linksToTopLevelMilestone), so that reference is cleared the same way removeMilestoneOp clears dependsOn edges. */
export function removeTopLevelItemOp(data: RoadmapData, id: string): RoadmapData {
  const topLevelItems = data.topLevelItems.filter((t) => t.id !== id);
  const milestones = data.milestones.map((m) => (m.linksToTopLevelMilestone === id ? { ...m, linksToTopLevelMilestone: null } : m));
  return { ...data, topLevelItems, milestones };
}

export function addSwimlaneOp(data: RoadmapData, swimlaneType: "lane" | "separator", name: string, newId: string): RoadmapData {
  const nextOrder = data.swimlanes.reduce((max, l) => Math.max(max, l.order), -1) + 1;
  return { ...data, swimlanes: [...data.swimlanes, { id: newId, order: nextOrder, type: swimlaneType, name }] };
}

export function renameSwimlaneOp(data: RoadmapData, id: string, name: string): RoadmapData {
  return { ...data, swimlanes: data.swimlanes.map((l) => (l.id === id ? { ...l, name } : l)) };
}

export function moveSwimlaneOp(data: RoadmapData, id: string, delta: -1 | 1): RoadmapData {
  const ordered = [...data.swimlanes].sort((a, b) => a.order - b.order);
  const i = ordered.findIndex((l) => l.id === id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= ordered.length) return data;
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  return { ...data, swimlanes: ordered.map((l, k) => ({ ...l, order: k })) };
}

export function setLaneColorOp(data: RoadmapData, id: string, color: string | undefined): RoadmapData {
  return { ...data, swimlanes: data.swimlanes.map((l) => (l.id === id ? { ...l, color } : l)) };
}

/** "auto" clears the override, mirroring isCriticalPathOverride's undefined-means-computed convention. */
export function setRagOverrideOp(data: RoadmapData, id: string, rag: Rag | "auto"): RoadmapData {
  return {
    ...data,
    swimlanes: data.swimlanes.map((l) => (l.id === id ? { ...l, ragOverride: rag === "auto" ? undefined : rag } : l)),
  };
}

/** Mirrors setLaneColorOp's placement/pattern — "normal vs lean" row-height toggle. */
export function setLaneDensityOp(data: RoadmapData, id: string, density: "normal" | "lean"): RoadmapData {
  return { ...data, swimlanes: data.swimlanes.map((l) => (l.id === id ? { ...l, density } : l)) };
}

export function applyDeletes(data: RoadmapData, deletes: readonly DeleteOp[]): RoadmapData {
  return deletes.reduce((acc, d) => {
    if (d.entityType === "milestone") return removeMilestoneOp(acc, d.targetId);
    if (d.entityType === "topLevelItem") return removeTopLevelItemOp(acc, d.targetId);
    return removeSwimlaneOp(acc, d.targetId);
  }, data);
}

/**
 * `newId` is resolved by the caller (mirrors applyAddMilestoneOps in
 * apply.ts) rather than generated in here — only "add" ops consume it; every
 * other kind already carries its own targetId.
 */
export function applySwimlaneOps(data: RoadmapData, ops: readonly { op: SwimlaneOp; newId: string }[]): RoadmapData {
  return ops.reduce((acc, { op, newId }) => {
    switch (op.kind) {
      case "add":
        return addSwimlaneOp(acc, op.swimlaneType, op.name, newId);
      case "rename":
        return renameSwimlaneOp(acc, op.targetId, op.name);
      case "reorder":
        return moveSwimlaneOp(acc, op.targetId, op.delta);
      case "recolor":
        return setLaneColorOp(acc, op.targetId, resolveNamedLaneColor(op.color));
      case "ragOverride":
        return setRagOverrideOp(acc, op.targetId, op.rag);
    }
  }, data);
}
