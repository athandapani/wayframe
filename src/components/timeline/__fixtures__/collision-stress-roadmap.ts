// Dev-only stress fixture — deliberately engineered so every text-collision
// category in RoadmapTimeline renders on screen at once, on a single small
// chart, without hunting for it in the real demo data. Not the official demo
// dataset (src/data/demo-roadmap.ts, wayframe #10) — this one exists purely
// to make collisions reproducible. See src/app/dev/collision-stress/page.tsx,
// the route that renders it.
//
// Three engineered collision clusters:
// 1. Lane A, early May — four milestones within an 8-day span exercise the
//    existing tiered milestone-label system (label-layout.ts) — already
//    handled, included so the stress view shows the "already solved" case
//    alongside the others for contrast.
// 2. Lane B, early June — a slipped milestone (`originalDate` set) sits two
//    days from its neighbor, so GhostBadge's default cx+12/cy-18 offset
//    would land on a title — resolved in wayframe#47 (layoutGhostBadges'
//    tiered fold-in + generalized drag-to-reposition, see label-layout.ts);
//    still useful here to confirm the fix live against a real cluster.
// 3. Mid-June — Today plus a top-level showReferenceLine milestone, a lane
//    showReferenceLine milestone, and an annotation all land within a
//    3-day window — resolved in wayframe#51 (tiered layout +
//    drag-to-reposition, see reference-line-layout.ts); still useful here to
//    confirm the fix live against a real cluster.
import type { RoadmapData } from "../types";

export const collisionStressToday = new Date("2026-06-15T00:00:00Z");

export const collisionStressRoadmap: RoadmapData = {
  schemaVersion: "1.0",
  programName: "Collision Stress Fixture",
  generatedAt: "2026-06-15T00:00:00.000Z",
  lastUpdatedAt: "2026-06-15T00:00:00.000Z",
  owner: "Dev QA",
  bluf: {
    statement: "Every text-collision category forced into view at once — not a real program.",
    bullets: [],
  },
  actionItems: [],
  swimlanes: [
    { id: "sep-1", order: 0, type: "separator", name: "Collision cases" },
    { id: "lane-a", order: 1, type: "lane", name: "Lane A — dense label cluster" },
    { id: "lane-b", order: 2, type: "lane", name: "Lane B — ghost badge vs. label" },
  ],
  topLevelItems: [
    {
      id: "top-ga",
      type: "milestone",
      title: "GA Target Review",
      date: "2026-06-16",
      status: "on-track",
      showReferenceLine: true,
    },
    {
      id: "top-sync",
      type: "annotation",
      title: "Steering Sync",
      date: "2026-06-17",
      message: "Reference-line collision case: annotation near Today + two milestone reference lines.",
    },
  ],
  milestones: [
    // --- Cluster 1: dense label collision (already handled by label-layout.ts) ---
    { id: "m-a1", laneId: "lane-a", title: "Alpha Build Complete", date: "2026-05-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "m-a2", laneId: "lane-a", title: "Beta Build Complete", date: "2026-05-04", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "m-a3", laneId: "lane-a", title: "Release Candidate Cut", date: "2026-05-06", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "m-a4", laneId: "lane-a", title: "Final Build Sign-off", date: "2026-05-08", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },

    // --- Cluster 2: ghost badge vs. neighboring label (wayframe#47, open) ---
    {
      id: "m-b1",
      laneId: "lane-b",
      title: "Certification Submission",
      date: "2026-06-01",
      originalDate: "2026-05-27",
      status: "delayed",
      dependsOn: [],
      linksToTopLevelMilestone: null,
      isCriticalPath: false,
    },
    { id: "m-b2", laneId: "lane-b", title: "Lab Slot Confirmed", date: "2026-06-03", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },

    // --- Cluster 3: reference-line vs. reference-line (wayframe#51, open) ---
    // Paired with Today (2026-06-15) and the two topLevelItems above.
    {
      id: "m-c1",
      laneId: "lane-b",
      title: "Certification Freeze",
      date: "2026-06-14",
      status: "on-track",
      dependsOn: [],
      linksToTopLevelMilestone: null,
      isCriticalPath: false,
      showReferenceLine: true,
    },
  ],
};
