// PROTOTYPE — bridges the real RoadmapData/Milestone shape (src/data/demo-roadmap.ts)
// to the resolver's lighter MilestoneRef shape (prototype-scope-widening/resolve.mts),
// and applies a resolved edit back onto a real RoadmapData copy so the chart
// visibly updates when a correction is applied — the point of hosting this
// over the real chart instead of an isolated fixture.
import type { RoadmapData } from "@/components/timeline/types";
import type { MilestoneRef, Lane } from "@/lib/corrections/prototype-scope-widening/fixture.mts";
import type { EditOp } from "@/lib/corrections/prototype-scope-widening/resolve.mts";

export function toMilestoneRefs(data: RoadmapData): MilestoneRef[] {
  const laneNameById = new Map(data.swimlanes.map((l) => [l.id, l.name]));
  return data.milestones.map((m) => ({
    id: m.id,
    title: m.title,
    laneId: m.laneId,
    laneName: laneNameById.get(m.laneId) ?? m.laneId,
    date: m.date,
    status: m.status,
    owner: m.owner,
    comment: m.comment,
  }));
}

export function toLanes(data: RoadmapData): Lane[] {
  return data.swimlanes.filter((l) => l.type === "lane").map((l) => ({ id: l.id, name: l.name }));
}

export function applyEdit(data: RoadmapData, edit: EditOp): RoadmapData {
  return {
    ...data,
    milestones: data.milestones.map((m) => (m.id === edit.targetId ? { ...m, [edit.field]: edit.newValue } : m)),
  };
}
