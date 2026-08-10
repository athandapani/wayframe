// PROTOTYPE fixture — a trimmed, real subset of src/data/demo-roadmap.ts.
// Not a new dataset: same ids, titles, lanes, dates as the shipped demo,
// minus most of the milestones that aren't load-bearing for this question.
// One addition: "new-1" / "New milestone", reproducing the exact object
// addMilestone() creates client-side, to replay the real bug report.

export interface Lane {
  id: string;
  name: string;
}

export interface MilestoneRef {
  id: string;
  title: string;
  laneId: string;
  laneName: string;
  date: string;
  status: string;
  owner?: string;
  comment?: string;
}

export const lanes: Lane[] = [
  { id: "lane-mech", name: "Mechanical & Hardware" },
  { id: "lane-safety", name: "Safety Certification" },
  { id: "lane-mfg", name: "Manufacturing & Supply Chain" },
  { id: "lane-pilot", name: "Field Pilot Deployments" },
  { id: "lane-launch", name: "Commercial Launch" },
];

const laneNameById = new Map(lanes.map((l) => [l.id, l.name]));

function ref(m: Omit<MilestoneRef, "laneName">): MilestoneRef {
  return { ...m, laneName: laneNameById.get(m.laneId) ?? m.laneId };
}

export function initialMilestones(): MilestoneRef[] {
  return [
    ref({ id: "mech-5", laneId: "lane-mech", title: "Pilot-Build Hardware Lot (x10)", date: "2026-09-25", status: "at-risk" }),
    ref({ id: "safety-4", laneId: "lane-safety", title: "Third-Party Safety Lab Testing", date: "2026-10-20", status: "delayed", owner: "T. Boyer — Safety & Compliance" }),
    ref({ id: "safety-5", laneId: "lane-safety", title: "UL 3100 Certification Issued", date: "2026-12-15", status: "not-started" }),
    ref({ id: "mfg-3", laneId: "lane-mfg", title: "Pilot Line Bring-up", date: "2026-09-15", status: "on-track" }),
    ref({ id: "mfg-4", laneId: "lane-mfg", title: "Supplier PPAP Approval", date: "2026-10-01", status: "on-track" }),
    ref({ id: "pilot-2", laneId: "lane-pilot", title: "Pilot Site 1 Go-Live", date: "2026-07-01", status: "complete" }),
    ref({ id: "pilot-3", laneId: "lane-pilot", title: "Pilot Site 2 Go-Live", date: "2026-09-20", status: "at-risk" }),
    ref({ id: "pilot-4", laneId: "lane-pilot", title: "Pilot Site 3 Go-Live", date: "2026-11-01", status: "not-started" }),
    ref({ id: "pilot-5", laneId: "lane-pilot", title: "Pilot Fleet Uptime ≥ 95% Sustained (30 days)", date: "2027-01-05", status: "not-started" }),
    ref({ id: "launch-2", laneId: "lane-launch", title: "Channel Partner Agreements Signed", date: "2026-09-10", status: "on-track" }),
    // Reproduces the real bug report exactly: freshly added via the "+"
    // affordance, still carrying addMilestone()'s default title.
    ref({ id: "new-1", laneId: "lane-mfg", title: "New milestone", date: "2026-12-01", status: "not-started" }),
  ];
}
