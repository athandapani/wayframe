// PROTOTYPE fixture (wayframe#104, throwaway) — not used by any test, only
// by /dev/roadmap-timeline?merged=1. Answers wayframe#104's actual question
// by construction rather than by adding a second "Program" concept to
// RoadmapTimeline: a Program is modeled as one more depth-0 SwimlaneGroup
// (see SwimlaneGroup.parentGroupId/accentHue in types.ts), so the merged
// All-Programs view is just ONE RoadmapData document whose top-level groups
// happen to be Programs. computeRowsAndBands's recursion (wayframe#104) and
// theme.laneRamp-tinted Program bands do the rest — no new RoadmapTimeline
// props needed at all.
//
// Deliberately exercises:
// - Three Programs with staggered, only-partially-overlapping date windows
//   (Atlas: Nov'25-Apr'26, Comet: Jan'26-Aug'26, Nova: Feb'26-May'26) so the
//   shared axis visibly has to be the union, not any one Program's own
//   range (already decided per #t26's question — this just proves
//   computeDomain needs zero changes to get it, since it already unions
//   every milestone's date across whatever RoadmapData it's handed).
// - Atlas & Comet each nest a real SwimlaneGroup (depth 1) inside their
//   Program band (depth 0), so a Program band and an ordinary group band
//   render stacked in the same gutter at once — the literal case #t26
//   asked about.
// - Nova has zero nested groups (every lane sits directly under the Program
//   band) — proves a Program band alone, depth 0 with no depth-1 children,
//   renders fine mixed in with Programs that do nest.
// - Every id is prefixed by its Program's key (atlas__/comet__/nova__),
//   including two lanes deliberately named "qa" in both Atlas and Comet.
//   Merging N Programs' own documents always needs this: each Program's ids
//   are only unique within its own CRDT subdocument (#t14's decision), so a
//   real merge step must namespace by (programId, localId) exactly like
//   this fixture does by construction — the prototype doesn't re-litigate
//   that, it demonstrates the shape production needs to produce.
import type { RoadmapData } from "../types";

export const prototypeMergedProgramsFixture: RoadmapData = {
  schemaVersion: "1.0",
  programName: "All-Programs (merged view prototype)",
  generatedAt: "2026-09-08T00:00:00.000Z",
  owner: "Prototype",
  bluf: { statement: "All-Programs merged view layout prototype (wayframe#104).", bullets: [] },
  actionItems: [],
  swimlaneGroups: [
    // --- Program bands (depth 0) ---
    { id: "atlas", order: 0, name: "Atlas Platform", accentHue: 20 },
    { id: "comet", order: 10, name: "Comet Mobile", accentHue: 140 },
    { id: "nova", order: 20, name: "Nova Growth", accentHue: 260 },
    // --- Ordinary SwimlaneGroups (depth 1), nested inside a Program ---
    { id: "atlas__grp-core", order: 0, name: "Core Platform", color: "#8250df", parentGroupId: "atlas" },
    { id: "comet__grp-squads", order: 0, name: "Mobile Squads", color: "#1a7f37", parentGroupId: "comet" },
  ],
  swimlanes: [
    // Atlas Platform
    { id: "atlas__lane-be", order: 0, type: "lane", name: "Backend", groupId: "atlas__grp-core" },
    { id: "atlas__lane-data", order: 1, type: "lane", name: "Data", groupId: "atlas__grp-core" },
    { id: "atlas__lane-design", order: 1, type: "lane", name: "Design", groupId: "atlas" },
    { id: "atlas__lane-qa", order: 2, type: "lane", name: "QA", groupId: "atlas" },
    // Comet Mobile
    { id: "comet__lane-ios", order: 0, type: "lane", name: "iOS", groupId: "comet__grp-squads" },
    { id: "comet__lane-android", order: 1, type: "lane", name: "Android", groupId: "comet__grp-squads" },
    { id: "comet__lane-qa", order: 1, type: "lane", name: "QA", groupId: "comet" },
    // Nova Growth — no nested group; every lane sits directly under the Program band.
    { id: "nova__lane-lifecycle", order: 0, type: "lane", name: "Lifecycle", groupId: "nova" },
    { id: "nova__lane-paid", order: 1, type: "lane", name: "Paid Acquisition", groupId: "nova" },
  ],
  topLevelItems: [{ id: "top-1", type: "phase", title: "Portfolio window", startDate: "2025-11-01", endDate: "2026-08-01", status: "on-track" }],
  milestones: [
    // Atlas — Nov'25 to Apr'26, the earliest-starting Program.
    { id: "atlas__m1", laneId: "atlas__lane-be", title: "Core API frozen", date: "2025-11-20", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "atlas__m2", laneId: "atlas__lane-data", title: "Warehouse migration", date: "2026-01-10", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "atlas__m3", laneId: "atlas__lane-design", title: "Design system v2", date: "2026-02-05", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "atlas__m4", laneId: "atlas__lane-qa", title: "Platform GA", date: "2026-04-01", status: "at-risk", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    // Comet — Jan'26 to Aug'26, the latest-running Program (extends the shared axis past the other two).
    { id: "comet__m1", laneId: "comet__lane-ios", title: "iOS beta", date: "2026-03-01", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "comet__m2", laneId: "comet__lane-android", title: "Android beta", date: "2026-03-15", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "comet__m3", laneId: "comet__lane-qa", title: "Store submission", date: "2026-08-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    // Nova — Feb'26 to May'26, overlaps the middle of both other Programs.
    { id: "nova__m1", laneId: "nova__lane-lifecycle", title: "Lifecycle v1", date: "2026-02-20", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "nova__m2", laneId: "nova__lane-paid", title: "Paid channel live", date: "2026-05-01", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  ],
};
