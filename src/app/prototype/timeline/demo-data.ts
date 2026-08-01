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
  | { id: string; type: "milestone"; title: string; date: string; status: Status; showReferenceLine?: boolean }
  | { id: string; type: "annotation"; title: string; date: string; message: string };

export interface DependencyEdge {
  id: string; // predecessor milestone id
  showConnector: boolean;
}

export interface Milestone {
  id: string;
  laneId: string;
  title: string;
  shortLabel: string;
  date: string;
  status: Status;
  owner?: string;
  dependsOn: DependencyEdge[];
  linksToTopLevelMilestone: string | null;
  isCriticalPath: boolean;
}

// duration bar living inside a single swimlane (not the top-level band) —
// same concept as a top-level phase, scoped to one lane.
export interface LanePill {
  id: string;
  laneId: string;
  title: string;
  startDate: string;
  endDate: string;
}

// swimlanes include separators, each acting as a group header for the lanes
// that follow it — demoing: [group header] 5 lanes [group header] 1 lane.
export const swimlanes: Swimlane[] = [
  { id: "sep-product", order: 0, type: "separator", name: "Product Development" },
  { id: "lane-rd", order: 1, type: "lane", name: "R&D" },
  { id: "lane-autonomy", order: 2, type: "lane", name: "Autonomy Software" },
  { id: "lane-safety", order: 3, type: "lane", name: "Safety Certification" },
  { id: "lane-mfg", order: 4, type: "lane", name: "Manufacturing & Supply Chain" },
  { id: "lane-pilot", order: 5, type: "lane", name: "Field Pilot Deployments" },
  { id: "sep-gtm", order: 6, type: "separator", name: "Go-to-Market" },
  { id: "lane-launch", order: 7, type: "lane", name: "Commercial Launch" },
];

export const topLevelItems: TopLevelItem[] = [
  { id: "top-kickoff", type: "milestone", title: "Program Kickoff", date: "2026-01-15", status: "complete", showReferenceLine: true },
  { id: "top-phase1", type: "phase", title: "Foundation & Design", startDate: "2026-01-01", endDate: "2026-06-30", status: "complete" },
  { id: "top-board", type: "annotation", title: "Board Review", date: "2026-09-01", message: "Quarterly board checkpoint" },
  { id: "top-phase2", type: "phase", title: "Pilot & Scale", startDate: "2026-07-01", endDate: "2027-03-31", status: "on-track" },
  { id: "top-ga", type: "milestone", title: "GA Launch", date: "2027-06-01", status: "not-started", showReferenceLine: true },
];

export const milestones: Milestone[] = [
  // R&D
  { id: "m1", laneId: "lane-rd", title: "Chassis design freeze", shortLabel: "CDF", date: "2026-02-15", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m1b", laneId: "lane-rd", title: "Vendor demo review", shortLabel: "VD", date: "2026-02-25", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m2", laneId: "lane-rd", title: "Sensor suite selection", shortLabel: "SSS", date: "2026-03-30", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m3", laneId: "lane-rd", title: "Gen2 arm prototype", shortLabel: "G2AP", date: "2026-07-15", status: "on-track", dependsOn: [{ id: "m1", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },

  // Autonomy Software
  { id: "m4", laneId: "lane-autonomy", title: "Perception stack v1", shortLabel: "PSV1", date: "2026-04-01", status: "complete", dependsOn: [{ id: "m2", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m5", laneId: "lane-autonomy", title: "Nav stack SLAM integration", shortLabel: "SLAM", date: "2026-06-15", status: "at-risk", dependsOn: [{ id: "m4", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m6", laneId: "lane-autonomy", title: "Fleet orchestration alpha", shortLabel: "FOA", date: "2026-09-01", status: "not-started", owner: "Autonomy", dependsOn: [{ id: "m5", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },

  // Safety Certification
  { id: "m7", laneId: "lane-safety", title: "Hazard analysis complete", shortLabel: "HAC", date: "2026-05-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m8", laneId: "lane-safety", title: "UL 3100 pre-assessment", shortLabel: "PA", date: "2026-08-15", status: "at-risk", dependsOn: [{ id: "m7", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m9", laneId: "lane-safety", title: "UL 3100 certification", shortLabel: "CERT", date: "2027-01-15", status: "not-started", owner: "Safety", dependsOn: [{ id: "m8", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },

  // Manufacturing & Supply Chain
  { id: "m10", laneId: "lane-mfg", title: "Supplier contracts signed", shortLabel: "SCS", date: "2026-03-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m11", laneId: "lane-mfg", title: "Pilot line tooling", shortLabel: "PLT", date: "2026-07-01", status: "delayed", dependsOn: [{ id: "m1", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m12", laneId: "lane-mfg", title: "Production line qualification", shortLabel: "PLQ", date: "2026-11-15", status: "not-started", dependsOn: [{ id: "m11", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },

  // Field Pilot Deployments
  { id: "m13", laneId: "lane-pilot", title: "Pilot site #1 selected", shortLabel: "PS1", date: "2026-05-15", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m14", laneId: "lane-pilot", title: "Pilot deployment — Site 1", shortLabel: "PD1", date: "2026-10-01", status: "not-started", owner: "Field Ops", dependsOn: [{ id: "m6", showConnector: true }, { id: "m9", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },
  { id: "m15", laneId: "lane-pilot", title: "Pilot deployment — Site 2", shortLabel: "PD2", date: "2027-01-01", status: "not-started", dependsOn: [{ id: "m14", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m16", laneId: "lane-pilot", title: "Pilot results review", shortLabel: "PRR", date: "2027-02-15", status: "not-started", owner: "Field Ops", dependsOn: [{ id: "m15", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },

  // Commercial Launch
  { id: "m17", laneId: "lane-launch", title: "Pricing model finalized", shortLabel: "PMF", date: "2026-11-01", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m18", laneId: "lane-launch", title: "Sales enablement complete", shortLabel: "SEC", date: "2027-03-01", status: "not-started", dependsOn: [{ id: "m17", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: false },
  { id: "m19", laneId: "lane-launch", title: "Launch readiness review", shortLabel: "LRR", date: "2027-04-15", status: "not-started", owner: "GTM", dependsOn: [{ id: "m16", showConnector: true }, { id: "m18", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },
  { id: "m20", laneId: "lane-launch", title: "GA Launch — Commercial", shortLabel: "GA", date: "2027-06-01", status: "not-started", owner: "GTM", dependsOn: [{ id: "m19", showConnector: true }], linksToTopLevelMilestone: "top-ga", isCriticalPath: true },
];

export const lanePills: LanePill[] = [
  { id: "p1", laneId: "lane-rd", title: "Concept & Requirements", startDate: "2026-01-05", endDate: "2026-02-08" },
  { id: "p2", laneId: "lane-autonomy", title: "Architecture Spike", startDate: "2026-01-10", endDate: "2026-03-20" },
];

export const bluf = {
  statement:
    "On track for GA in Jun 2027, but UL 3100 certification is the critical-path bottleneck — a 4-week slip there pushes commercial launch by the same amount.",
  bullets: [
    "Fleet orchestration alpha and UL 3100 certification both feed the Site 1 pilot deployment — either slipping delays everything downstream.",
    "Manufacturing's pilot line tooling is already delayed; watch for knock-on risk to production qualification.",
  ],
};
