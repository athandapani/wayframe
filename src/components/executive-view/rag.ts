// Per-lane RAG rollup and top-risks ranking for Executive view (wayframe
// issue #8). Auto rollup is the default; Swimlane.ragOverride (resolved in
// the RAG-governance fog item) wins when a lead has set one. Trend is
// deliberately left unpopulated (see LaneRollup.trend doc) rather than
// faked: there's no historical/prior-rollup data in the schema to compute
// a real trend from yet.
import type { RoadmapData, Milestone, Status, Rag } from "@/components/timeline/types";

export type { Rag };

export interface LaneRollup {
  laneId: string;
  laneName: string;
  rag: Rag;
  atRiskCount: number;
  delayedCount: number;
  /**
   * Improving/worsening vs. the last rollup. Always undefined today — no
   * schema field holds a prior rollup or historical snapshot to compare
   * against. The UI renders nothing when this is undefined; wiring a real
   * value needs a schema decision first (flagged on the wayfinder map's
   * "Not yet specified" list, not resolved by this ticket).
   */
  trend?: "up" | "down" | "flat";
}

export interface RiskItem {
  milestoneId: string;
  laneName: string;
  title: string;
  status: Status;
  date: string;
  comment?: string;
}

const SEVERITY: Record<Status, number> = {
  delayed: 3,
  "at-risk": 2,
  "not-started": 0,
  "on-track": 0,
  complete: 0,
};

/**
 * Auto worst-status-wins rollup, with one date-aware refinement: a
 * not-started milestone whose date has already passed counts as red (it
 * slipped before it even began). This is the default only — a swimlane's
 * `ragOverride` (see laneRollups) always wins when set.
 */
export function ragForLane(milestones: Milestone[], today: Date): Rag {
  const todayTs = today.getTime();
  let worst: Rag = "green";
  for (const m of milestones) {
    if (m.status === "delayed") return "red";
    if (m.status === "not-started" && new Date(m.date).getTime() < todayTs) return "red";
    if (m.status === "at-risk") worst = "amber";
  }
  return worst;
}

export function laneRollups(data: RoadmapData, today: Date): LaneRollup[] {
  return data.swimlanes
    .filter((l) => l.type === "lane")
    .map((lane) => {
      const milestones = data.milestones.filter((m) => m.laneId === lane.id);
      return {
        laneId: lane.id,
        laneName: lane.name,
        rag: lane.ragOverride ?? ragForLane(milestones, today),
        atRiskCount: milestones.filter((m) => m.status === "at-risk").length,
        delayedCount: milestones.filter((m) => m.status === "delayed").length,
      };
    });
}

/** Ranks by severity, critical-path first, then soonest date. */
export function topRisks(data: RoadmapData, limit = 3): RiskItem[] {
  const laneNameById = new Map(data.swimlanes.map((l) => [l.id, l.name]));
  return data.milestones
    .filter((m) => SEVERITY[m.status] > 0)
    .sort((a, b) => {
      if (a.isCriticalPath !== b.isCriticalPath) return a.isCriticalPath ? -1 : 1;
      if (SEVERITY[b.status] !== SEVERITY[a.status]) return SEVERITY[b.status] - SEVERITY[a.status];
      return a.date < b.date ? -1 : 1;
    })
    .slice(0, limit)
    .map((m) => ({
      milestoneId: m.id,
      laneName: laneNameById.get(m.laneId) ?? m.laneId,
      title: m.title,
      status: m.status,
      date: m.date,
      comment: m.comment,
    }));
}
