// Rendering-layer types for the swimlane/milestone timeline. Mirrors the
// resolved document shape produced by resolveDraftIds() in
// src/lib/extraction/resolve-ids.ts — that function types its output as
// RoadmapDocument with topLevelItems/milestones as Record<string, unknown>[]
// (untyped past shape validation); this is the properly-typed equivalent the
// timeline component actually consumes.
//
// Known gap surfaced while building this component (wayframe issue #7):
// two fields demoed in the design prototype have no backing schema field yet
// — a milestone short-form label/abbreviation, and lane-scoped duration
// pills (only top-level phases carry a date range today). Both are recorded
// as open follow-ups rather than added here unilaterally.

export type Status = "not-started" | "on-track" | "at-risk" | "delayed" | "complete";

export interface Swimlane {
  id: string;
  order: number;
  type: "lane" | "separator";
  name: string;
}

export type TopLevelItem =
  | { id: string; type: "milestone"; title: string; date: string; status: Status }
  | { id: string; type: "phase"; title: string; startDate: string; endDate: string; status: Status }
  | { id: string; type: "annotation"; title: string; date: string; message: string };

export interface DependencyEdge {
  id: string; // predecessor milestone id
  showConnector: boolean;
}

export interface Attachment {
  type: "image" | "link";
  url: string;
  label?: string;
}

export interface Milestone {
  id: string;
  laneId: string;
  title: string;
  date: string;
  status: Status;
  percentComplete?: number;
  owner?: string;
  comment?: string;
  dependsOn: DependencyEdge[];
  linksToTopLevelMilestone: string | null;
  isCriticalPath: boolean;
  attachments?: Attachment[];
}

export interface RoadmapData {
  schemaVersion: string;
  programName: string;
  generatedAt: string;
  owner: string;
  reportsTo?: string;
  nextReviewDate?: string;
  bluf: { statement: string; bullets: string[] };
  swimlanes: Swimlane[];
  topLevelItems: TopLevelItem[];
  milestones: Milestone[];
}
