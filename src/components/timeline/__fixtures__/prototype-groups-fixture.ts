// PROTOTYPE fixture (wayframe#100, throwaway) — not used by any test, only
// by /dev/roadmap-timeline?groups=rail|header|hybrid. Deliberately exercises
// the cases the design question turns on: a short (1-lane) group next to a
// tall (4-lane) one, so "hybrid"'s rotate-vs-abbreviate threshold actually
// switches; a long group name, so rotated-text clamping actually engages;
// one legacy `type:"separator"` band plus an ungrouped lane, so the
// zero-groups render path stays provably untouched; and a collapsed group,
// so the reserved-band-height-with-no-members path renders too.
import type { RoadmapData } from "../types";

export const prototypeGroupsFixture: RoadmapData = {
  schemaVersion: "1.0",
  programName: "Groups Prototype",
  generatedAt: "2026-09-08T00:00:00.000Z",
  owner: "Prototype",
  bluf: { statement: "Swimlane Groups layout/interaction prototype (wayframe#100).", bullets: [] },
  actionItems: [],
  swimlaneGroups: [
    { id: "grp-eng", order: 0, name: "Engineering Workstreams", color: "#8250df" },
    { id: "grp-launch", order: 20, name: "Launch Readiness & Go-to-Market Coordination", color: "#1a7f37" },
    { id: "grp-legal", order: 30, name: "Legal", color: "#bf8700", collapsed: true },
  ],
  swimlanes: [
    // grp-eng: 4 lanes -> tall enough to rotate in "hybrid", plenty of room in "rail".
    { id: "lane-be", order: 1, type: "lane", name: "Backend", groupId: "grp-eng" },
    { id: "lane-fe", order: 2, type: "lane", name: "Frontend", groupId: "grp-eng" },
    { id: "lane-infra", order: 3, type: "lane", name: "Infra", groupId: "grp-eng", density: "lean" },
    { id: "lane-qa", order: 4, type: "lane", name: "QA", groupId: "grp-eng", density: "lean" },
    // Ungrouped lane sitting between two groups — proves group membership
    // is a real FK, not "everything until the next boundary."
    { id: "lane-design", order: 10, type: "lane", name: "Design (ungrouped)" },
    // grp-launch: 1 lane -> short; "hybrid" should fall back to the
    // abbreviation chip instead of rotating a name this long into a sliver.
    { id: "lane-mkt", order: 21, type: "lane", name: "Marketing", groupId: "grp-launch" },
    // grp-legal: collapsed with a member still assigned to it, so the
    // "reserved band, member rows skipped" path renders (not the
    // zero-members path).
    { id: "lane-legal", order: 31, type: "lane", name: "Contracts Review", groupId: "grp-legal" },
    // Legacy flat separator + lane, untouched by any group — the
    // zero-groups-on-this-row rendering path.
    { id: "sep-legacy", order: 40, type: "separator", name: "Legacy Section (flat separator)" },
    { id: "lane-legacy", order: 41, type: "lane", name: "Ops" },
  ],
  topLevelItems: [{ id: "top-1", type: "phase", title: "Program window", startDate: "2026-01-01", endDate: "2026-06-01", status: "on-track" }],
  milestones: [
    { id: "m1", laneId: "lane-be", title: "API contract frozen", date: "2026-01-15", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "m2", laneId: "lane-fe", title: "UI beta", date: "2026-02-10", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "m3", laneId: "lane-infra", title: "Prod cluster ready", date: "2026-02-20", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "m4", laneId: "lane-qa", title: "Regression pass", date: "2026-03-05", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "m5", laneId: "lane-design", title: "Brand refresh", date: "2026-01-25", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "m6", laneId: "lane-mkt", title: "Launch campaign live", date: "2026-04-01", status: "at-risk", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "m7", laneId: "lane-legacy", title: "Runbook signed off", date: "2026-03-15", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
  ],
};
