// PROTOTYPE fixture — throwaway, matches the RoadmapDocument shape from
// src/lib/extraction/resolve-ids.ts (post id-resolution, not the draft/tempKey shape).
// Fictional warehouse-robotics platform launch program — see wayframe issue #7.

export type Status = "not-started" | "on-track" | "at-risk" | "delayed" | "complete";

export interface Swimlane {
  id: string;
  order: number;
  type: "lane" | "separator";
  name: string;
}

export type TopLevelItem =
  | { id: string; type: "phase"; title: string; startDate: string; endDate: string; status: Status }
  | { id: string; type: "milestone"; title: string; date: string; status: Status }
  | { id: string; type: "annotation"; title: string; date: string; message: string };

export interface DependencyEdge {
  id: string; // predecessor milestone id
  showConnector: boolean;
}

export interface Milestone {
  id: string;
  laneId: string;
  title: string;
  date: string;
  status: Status;
  owner?: string;
  dependsOn: DependencyEdge[];
  linksToTopLevelMilestone: string | null;
  isCriticalPath: boolean;
}

export const swimlanes: Swimlane[] = [
  { id: "lane-rd", order: 0, type: "lane", name: "R&D" },
  { id: "lane-autonomy", order: 1, type: "lane", name: "Autonomy Software" },
  { id: "lane-safety", order: 2, type: "lane", name: "Safety Certification" },
  { id: "lane-mfg", order: 3, type: "lane", name: "Manufacturing & Supply Chain" },
  { id: "lane-pilot", order: 4, type: "lane", name: "Field Pilot Deployments" },
  { id: "lane-launch", order: 5, type: "lane", name: "Commercial Launch" },
];

export const topLevelItems: TopLevelItem[] = [
  { id: "top-kickoff", type: "milestone", title: "Program Kickoff", date: "2026-01-15", status: "complete" },
  { id: "top-phase1", type: "phase", title: "Foundation & Design", startDate: "2026-01-01", endDate: "2026-06-30", status: "complete" },
  { id: "top-board", type: "annotation", title: "Board Review", date: "2026-09-01", message: "Quarterly board checkpoint" },
  { id: "top-phase2", type: "phase", title: "Pilot & Scale", startDate: "2026-07-01", endDate: "2027-03-31", status: "on-track" },
  { id: "top-ga", type: "milestone", title: "GA Launch", date: "2027-06-01", status: "not-started" },
];

export const milestones: Milestone[] = [
  // R&D
  { id: "m1", laneId: "lane-rd", title: "Chassis design freeze", date: "2026-02-15", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m2", laneId: "lane-rd", title: "Sensor suite selection", date: "2026-03-30", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m3", laneId: "lane-rd", title: "Gen2 arm prototype", date: "2026-07-15", status: "on-track", dependsOn: [{ id: "m1", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },

  // Autonomy Software
  { id: "m4", laneId: "lane-autonomy", title: "Perception stack v1", date: "2026-04-01", status: "complete", dependsOn: [{ id: "m2", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m5", laneId: "lane-autonomy", title: "Nav stack SLAM integration", date: "2026-06-15", status: "at-risk", dependsOn: [{ id: "m4", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m6", laneId: "lane-autonomy", title: "Fleet orchestration alpha", date: "2026-09-01", status: "not-started", owner: "Autonomy", dependsOn: [{ id: "m5", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },

  // Safety Certification
  { id: "m7", laneId: "lane-safety", title: "Hazard analysis complete", date: "2026-05-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m8", laneId: "lane-safety", title: "UL 3100 pre-assessment", date: "2026-08-15", status: "at-risk", dependsOn: [{ id: "m7", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m9", laneId: "lane-safety", title: "UL 3100 certification", date: "2027-01-15", status: "not-started", owner: "Safety", dependsOn: [{ id: "m8", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },

  // Manufacturing & Supply Chain
  { id: "m10", laneId: "lane-mfg", title: "Supplier contracts signed", date: "2026-03-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m11", laneId: "lane-mfg", title: "Pilot line tooling", date: "2026-07-01", status: "delayed", dependsOn: [{ id: "m1", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m12", laneId: "lane-mfg", title: "Production line qualification", date: "2026-11-15", status: "not-started", dependsOn: [{ id: "m11", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },

  // Field Pilot Deployments
  { id: "m13", laneId: "lane-pilot", title: "Pilot site #1 selected", date: "2026-05-15", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m14", laneId: "lane-pilot", title: "Pilot deployment — Site 1", date: "2026-10-01", status: "not-started", owner: "Field Ops", dependsOn: [{ id: "m6", showConnector: true }, { id: "m9", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },
  { id: "m15", laneId: "lane-pilot", title: "Pilot deployment — Site 2", date: "2027-01-01", status: "not-started", dependsOn: [{ id: "m14", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m16", laneId: "lane-pilot", title: "Pilot results review", date: "2027-02-15", status: "not-started", owner: "Field Ops", dependsOn: [{ id: "m15", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },

  // Commercial Launch
  { id: "m17", laneId: "lane-launch", title: "Pricing model finalized", date: "2026-11-01", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m18", laneId: "lane-launch", title: "Sales enablement complete", date: "2027-03-01", status: "not-started", dependsOn: [{ id: "m17", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m19", laneId: "lane-launch", title: "Launch readiness review", date: "2027-04-15", status: "not-started", owner: "GTM", dependsOn: [{ id: "m16", showConnector: true }, { id: "m18", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },
  { id: "m20", laneId: "lane-launch", title: "GA Launch — Commercial", date: "2027-06-01", status: "not-started", owner: "GTM", dependsOn: [{ id: "m19", showConnector: true }], linksToTopLevelMilestone: "top-ga", isCriticalPath: true },
];
