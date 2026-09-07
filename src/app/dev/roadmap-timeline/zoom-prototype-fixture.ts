// PROTOTYPE FIXTURE (wayframe#84) — throwaway, feeds only the zoom-mechanism
// variants on this dev page. Not used by any test or real route. Spans 18
// months with a sparse background rate plus three dense bursts, so zooming
// into a burst vs. the sparse background actually feels different.
import type { RoadmapData, Milestone, Swimlane, TopLevelItem, Status } from "@/components/timeline/types";

const LANES = ["alpha", "beta", "gamma", "delta"];
const STATUSES: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildMilestones(): Milestone[] {
  const out: Milestone[] = [];
  let n = 0;
  const push = (lane: string, date: string, title: string) => {
    n += 1;
    out.push({
      id: `zm-${n}`,
      laneId: lane,
      title,
      date,
      status: STATUSES[n % STATUSES.length],
      dependsOn: [],
      linksToTopLevelMilestone: null,
      isCriticalPath: false,
    });
  };

  // Sparse background: ~1 milestone every 12 days per lane, 545-day span.
  for (const lane of LANES) {
    const offset = LANES.indexOf(lane) * 3;
    for (let d = offset; d < 545; d += 12) {
      push(lane, addDays("2026-01-01", d), `${lane} routine check`);
    }
  }

  // Dense bursts — the actual zoom-target moments.
  const bursts: Array<[string, string, number]> = [
    ["2026-04-15", "alpha", 10],
    ["2026-04-16", "beta", 6],
    ["2026-09-01", "alpha", 8],
    ["2026-09-02", "gamma", 7],
    ["2026-09-03", "delta", 6],
    ["2027-02-01", "beta", 9],
  ];
  for (const [start, lane, count] of bursts) {
    for (let i = 0; i < count; i++) {
      push(lane, addDays(start, i), `${lane} launch item ${i + 1}`);
    }
  }

  return out;
}

function buildSwimlanes(): Swimlane[] {
  return LANES.map((id, i) => ({ id, order: i, type: "lane" as const, name: id[0].toUpperCase() + id.slice(1) }));
}

function buildTopLevelItems(): TopLevelItem[] {
  return [
    { id: "zp-1", type: "phase", title: "Foundation", startDate: "2026-01-01", endDate: "2026-04-15", status: "complete" },
    { id: "zp-2", type: "phase", title: "Build-out", startDate: "2026-04-15", endDate: "2026-09-01", status: "on-track" },
    { id: "zp-3", type: "phase", title: "Hardening", startDate: "2026-09-01", endDate: "2027-02-01", status: "at-risk" },
    { id: "zp-4", type: "phase", title: "Launch", startDate: "2027-02-01", endDate: "2027-06-30", status: "not-started" },
    { id: "zt-1", type: "annotation", title: "Board review", date: "2026-09-01", message: "Mid-program checkpoint" },
  ];
}

export const zoomFixture: RoadmapData = {
  schemaVersion: "1.0",
  programName: "Zoom Prototype (throwaway)",
  generatedAt: new Date().toISOString(),
  owner: "Prototype",
  bluf: { statement: "18-month synthetic dataset for wayframe#84's zoom prototype.", bullets: [] },
  actionItems: [],
  swimlanes: buildSwimlanes(),
  topLevelItems: buildTopLevelItems(),
  milestones: buildMilestones(),
};

export const FULL_DOMAIN = { min: Date.parse("2026-01-01") - 14 * 86400000, max: Date.parse("2027-06-30") + 14 * 86400000 };
