// PROTOTYPE fixture — wayframe#29. Extends sampleRoadmap with milestones
// that have originalDate set, so the ghost-rendering variants have
// something to show. Not the shared test fixture (sample-roadmap.ts) —
// deliberately kept separate so this doesn't perturb RoadmapTimeline.test.tsx.
import type { RoadmapData } from "@/components/timeline/types";

export const prototypeGhostRoadmap: RoadmapData = {
  schemaVersion: "1.0",
  programName: "Sample Program",
  generatedAt: "2026-08-01T00:00:00.000Z",
  owner: "Test Owner",
  bluf: {
    statement: "PROTOTYPE (wayframe#29) — ghost-rendering variants for slipped milestones.",
    bullets: ["Use the switcher at the bottom to compare variants A/B/C."],
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
      // Big slip (3 weeks) — the connector/ghost has room to breathe.
      originalDate: "2026-01-25",
    },
    {
      id: "m3",
      laneId: "lane-a",
      title: "Tight slip milestone",
      date: "2026-01-18",
      status: "at-risk",
      dependsOn: [],
      linksToTopLevelMilestone: null,
      isCriticalPath: false,
      // Small slip (4 days) — right next to m1 and near the Today line (2026-01-20):
      // stress-tests collision with an existing marker + the today reference line.
      originalDate: "2026-01-14",
    },
    {
      id: "m4",
      laneId: "lane-b",
      title: "Slipped earlier",
      date: "2026-01-08",
      status: "not-started",
      dependsOn: [],
      linksToTopLevelMilestone: null,
      isCriticalPath: false,
      // Negative slip (pulled in, not pushed out) — checks the ghost still reads
      // correctly when the original date is AFTER the new date, not before.
      originalDate: "2026-01-22",
    },
  ],
};
