// PROTOTYPE (wayframe#17) — shared field derivation only (no layout, no
// components) so all three variants edit the exact same v1 field set and
// stay comparable. Each variant is free to lay these fields out however it
// wants.

import type { Milestone, RoadmapData } from "@/components/timeline/types";

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

export const STATUS_OPTIONS: Milestone["status"][] = ["not-started", "on-track", "at-risk", "delayed", "complete"];

export function milestoneToFields(m: Milestone): EditableMilestoneFields {
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

/** Deferred in v1 — shown read-only so the reviewer can judge whether that's the right call. */
export function dependencyTitles(data: RoadmapData, m: Milestone): string[] {
  const byId = new Map(data.milestones.map((x) => [x.id, x.title]));
  return m.dependsOn.map((d) => byId.get(d.id) ?? d.id);
}
