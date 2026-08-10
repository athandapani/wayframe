// Small fixture for RoadmapTimeline tests — not the official demo dataset
// (that's wayframe issue #10, still open). Deliberately minimal: one
// separator, two lanes, a phase, a milestone, an annotation, and a
// cross-lane dependency so the connector/critical-path paths get exercised.
import type { RoadmapData } from "../types";

export const sampleRoadmap: RoadmapData = {
  schemaVersion: "1.0",
  programName: "Sample Program",
  generatedAt: "2026-08-01T00:00:00.000Z",
  lastUpdatedAt: "2026-08-01T00:00:00.000Z",
  owner: "Test Owner",
  bluf: {
    statement: "Sample bottom-line statement for tests.",
    bullets: ["Sample supporting bullet."],
  },
  actionItems: [],
  swimlanes: [
    { id: "sep-1", order: 0, type: "separator", name: "Group" },
    { id: "lane-a", order: 1, type: "lane", name: "Lane A" },
    { id: "lane-b", order: 2, type: "lane", name: "Lane B" },
  ],
  topLevelItems: [
    { id: "top-1", type: "phase", title: "Phase One", startDate: "2026-01-01", endDate: "2026-03-01", status: "on-track" },
    { id: "top-2", type: "milestone", title: "Kickoff", date: "2026-01-05", status: "complete" },
    { id: "top-3", type: "annotation", title: "Review", date: "2026-02-01", message: "Checkpoint" },
  ],
  milestones: [
    { id: "m1", laneId: "lane-a", title: "First milestone", date: "2026-01-10", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: true },
    {
      id: "m2",
      laneId: "lane-b",
      title: "Second milestone",
      date: "2026-02-15",
      status: "at-risk",
      dependsOn: [{ id: "m1", showConnector: true }],
      linksToTopLevelMilestone: null,
      isCriticalPath: true,
    },
  ],
};
