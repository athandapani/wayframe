// PROTOTYPE — throwaway. wayframe#125.
//
// Three mock Programs, enough content that the merged canvas has real
// density (bands that actually need collapsing, lanes that actually need a
// Program tab). No fetch, no auth, no Yjs — #126 wires the real multi-room
// data behind whichever layout wins.
import type { Portfolio, Program } from "@/components/timeline/types";

export const MOCK_PORTFOLIO: Portfolio = {
  id: "proto-portfolio",
  schemaVersion: 1,
  legendCategories: [
    { id: "cat-eng", name: "Engineering", color: "#6366f1" },
    { id: "cat-gtm", name: "Go-to-market", color: "#0ea5e9" },
  ],
};

function program(
  id: string,
  name: string,
  order: number,
  owner: string,
  lanes: { id: string; name: string; groupId?: string }[],
  groups: { id: string; name: string; color: string }[],
  milestones: Program["milestones"],
): Program {
  return {
    id,
    portfolioId: MOCK_PORTFOLIO.id,
    order,
    programName: name,
    generatedAt: "2026-01-02T00:00:00.000Z",
    lastUpdatedAt: "2026-09-18T00:00:00.000Z",
    owner,
    bluf: { statement: `${name} is tracking to plan with two watch items.`, bullets: [] },
    actionItems: [],
    swimlaneGroups: groups.map((g, i) => ({ id: g.id, order: i, name: g.name, color: g.color })),
    swimlanes: lanes.map((l, i) => ({ id: l.id, order: i, type: "lane" as const, name: l.name, groupId: l.groupId })),
    topLevelItems: [
      { id: `${id}-top-1`, type: "milestone", title: "Steering review", date: "2026-04-15", status: "on-track" },
      { id: `${id}-top-2`, type: "phase", title: "Delivery window", startDate: "2026-02-01", endDate: "2026-08-31", status: "on-track" },
    ],
    milestones,
  };
}

export const MOCK_PROGRAMS: Program[] = [
  program(
    "prog-platform",
    "Core Platform",
    0,
    "Priya N.",
    [
      { id: "lane-api", name: "API", groupId: "grp-build" },
      { id: "lane-infra", name: "Infrastructure", groupId: "grp-build" },
      { id: "lane-sec", name: "Security", groupId: "grp-assure" },
    ],
    [
      { id: "grp-build", name: "Build", color: "#6366f1" },
      { id: "grp-assure", name: "Assure", color: "#0f766e" },
    ],
    [
      { id: "pf-m1", laneId: "lane-api", title: "v2 API contract frozen", date: "2026-02-10", status: "complete", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "pf-m2", laneId: "lane-api", title: "Partner beta", date: "2026-03-20", endDate: "2026-05-30", status: "on-track", percentComplete: 45, dependsOn: [{ id: "pf-m1", showConnector: true }], linksToTopLevelMilestone: null },
      { id: "pf-m3", laneId: "lane-infra", title: "Multi-region cutover", date: "2026-06-12", status: "at-risk", potentialDate: "2026-07-24", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "pf-m4", laneId: "lane-infra", title: "Cost guardrails", date: "2026-09-01", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "pf-m5", laneId: "lane-sec", title: "Pen test", date: "2026-05-04", endDate: "2026-06-05", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "pf-m6", laneId: "lane-sec", title: "SOC2 evidence pack", date: "2026-10-16", status: "delayed", dependsOn: [], linksToTopLevelMilestone: null },
    ],
  ),
  program(
    "prog-onboarding",
    "Customer Onboarding",
    1,
    "Marcus L.",
    [
      { id: "lane-ux", name: "Experience", groupId: "grp-launch" },
      { id: "lane-support", name: "Support readiness", groupId: "grp-launch" },
      { id: "lane-pilot", name: "Pilot accounts" },
    ],
    [{ id: "grp-launch", name: "Launch", color: "#c2410c" }],
    [
      { id: "on-m1", laneId: "lane-ux", title: "Guided setup flow", date: "2026-01-19", endDate: "2026-04-10", status: "on-track", percentComplete: 70, dependsOn: [], linksToTopLevelMilestone: null },
      { id: "on-m2", laneId: "lane-ux", title: "Self-serve trial live", date: "2026-05-22", status: "at-risk", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "on-m3", laneId: "lane-support", title: "Runbook complete", date: "2026-03-06", status: "complete", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "on-m4", laneId: "lane-support", title: "Tier-1 training", date: "2026-07-03", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "on-m5", laneId: "lane-pilot", title: "Five pilots signed", date: "2026-08-14", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "on-m6", laneId: "lane-pilot", title: "Pilot retro", date: "2026-11-06", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null },
    ],
  ),
  program(
    "prog-data",
    "Data & Reporting",
    2,
    "Sana K.",
    [
      { id: "lane-pipe", name: "Pipelines" },
      { id: "lane-dash", name: "Dashboards" },
    ],
    [],
    [
      { id: "dt-m1", laneId: "lane-pipe", title: "Warehouse migration", date: "2026-02-02", endDate: "2026-06-26", status: "at-risk", percentComplete: 30, dependsOn: [], linksToTopLevelMilestone: null },
      { id: "dt-m2", laneId: "lane-pipe", title: "Event schema v3", date: "2026-07-31", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "dt-m3", laneId: "lane-dash", title: "Exec dashboard", date: "2026-04-24", status: "complete", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "dt-m4", laneId: "lane-dash", title: "Self-serve metrics", date: "2026-09-25", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null },
    ],
  ),
];

// ---------------------------------------------------------------------------
// wayframe#127 additions: the mock Version store.
//
// A Version is the WHOLE Roadmap at one moment — every Program together, as
// one dated immutable record (#119's resolution). So a mock version holds a
// full `Program[]`, not a diff and not a Deck IR (that's the *other*,
// export-oriented thing #128 relabels "Export Snapshot").
//
// The older versions are built by rolling the live Programs BACKWARDS, which
// is what makes the prototype worth clicking: stepping through the list
// visibly redraws the canvas (milestones that hadn't been added yet
// disappear, at-risk dates snap back to their earlier plan), so a variant
// gets judged on "can I feel which version I'm looking at", not on the
// prettiness of a list of dates.
import type { Milestone } from "@/components/timeline/types";

export interface MockVersion {
  id: string;
  savedAt: string;
  savedBy: string;
  /** Optional human label. Whether the UI even *asks* for one, and when, is part of what the variants disagree about. */
  label?: string;
  programs: Program[];
}

/** Roll a date back by `days`, keeping the yyyy-mm-dd shape the documents use. */
function rollBack(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * An older state of the whole Roadmap: drop the milestones that hadn't been
 * created yet (`drop`), pull everything else back by `shiftDays`, and undo
 * the status drift so an earlier version reads as the calmer plan it was.
 */
function olderThan(programs: Program[], { drop, shiftDays }: { drop: string[]; shiftDays: number }): Program[] {
  return programs.map((p) => ({
    ...p,
    milestones: p.milestones
      .filter((m) => !drop.includes(m.id))
      .map((m): Milestone => ({
        ...m,
        date: rollBack(m.date, shiftDays),
        endDate: m.endDate ? rollBack(m.endDate, shiftDays) : undefined,
        potentialDate: undefined,
        status: m.status === "at-risk" || m.status === "delayed" ? "on-track" : m.status,
        dependsOn: m.dependsOn.filter((d) => !drop.includes(d.id)),
      })),
  }));
}

/** Newest first — the order every variant lists them in; only the *shape* of the list is in question. */
export const MOCK_VERSIONS: MockVersion[] = [
  {
    id: "v4",
    savedAt: "2026-05-11T16:40:00.000Z",
    savedBy: "Priya N.",
    label: "Pre-QBR baseline",
    programs: olderThan(MOCK_PROGRAMS, { drop: ["pf-m6"], shiftDays: 4 }),
  },
  {
    id: "v3",
    savedAt: "2026-04-28T17:05:00.000Z",
    savedBy: "Marcus L.",
    programs: olderThan(MOCK_PROGRAMS, { drop: ["pf-m6", "dt-m4"], shiftDays: 11 }),
  },
  {
    id: "v2",
    savedAt: "2026-03-30T14:20:00.000Z",
    savedBy: "Priya N.",
    label: "After the Q1 replan",
    programs: olderThan(MOCK_PROGRAMS, { drop: ["pf-m6", "dt-m4", "on-m6", "pf-m4"], shiftDays: 23 }),
  },
  {
    id: "v1",
    savedAt: "2026-02-09T15:00:00.000Z",
    savedBy: "Sana K.",
    label: "Kickoff plan",
    programs: olderThan(MOCK_PROGRAMS, { drop: ["pf-m6", "dt-m4", "on-m6", "pf-m4", "on-m5", "dt-m2"], shiftDays: 38 }),
  },
];
