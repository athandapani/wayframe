// PROTOTYPE — throwaway. Answers wayframe#8: what does Executive view show
// (RAG rollup per lane, trend arrow, top-3-risks) vs Program view. Pure
// derivations, no I/O — the three UI variants render whatever this returns.
import type { RoadmapData, Milestone, Status } from "@/components/timeline/types";

export type Rag = "green" | "amber" | "red";

export interface LaneRollup {
  laneId: string;
  laneName: string;
  rag: Rag;
  atRiskCount: number;
  delayedCount: number;
  /** MOCKED — no historical/prior-rollup field exists in the schema yet.
   * See #8 resolution: real trend needs a schema addition, flagged not
   * fixed here. */
  trend: "up" | "down" | "flat";
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
 * slipped before it even began). Whether this should be auto-computed at
 * all vs. manually set by the L2 lead is still open (map's "Swimlane RAG
 * rollup logic" fog item) — this is one reasonable stance, not a ruling.
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

// MOCKED demo-only trend lookup — see LaneRollup.trend doc comment above.
const MOCK_TREND: Record<string, LaneRollup["trend"]> = {
  "lane-mech": "flat",
  "lane-auto": "flat",
  "lane-safety": "down",
  "lane-mfg": "up",
  "lane-pilot": "down",
  "lane-launch": "flat",
};

export function laneRollups(data: RoadmapData, today: Date): LaneRollup[] {
  return data.swimlanes
    .filter((l) => l.type === "lane")
    .map((lane) => {
      const milestones = data.milestones.filter((m) => m.laneId === lane.id);
      return {
        laneId: lane.id,
        laneName: lane.name,
        rag: ragForLane(milestones, today),
        atRiskCount: milestones.filter((m) => m.status === "at-risk").length,
        delayedCount: milestones.filter((m) => m.status === "delayed").length,
        trend: MOCK_TREND[lane.id] ?? "flat",
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
