// Per-lane RAG rollup and top-risks ranking for Executive view (wayframe
// issue #8). Auto rollup is the default; Swimlane.ragOverride (resolved in
// the RAG-governance fog item) wins when a lead has set one. Trend compares
// the current rollup against the lane's rollupHistory (wayframe issue #33) —
// undefined until a lane has at least one snapshot dated before today.
import type { RoadmapData, Swimlane, Milestone, Status, Rag } from "@/components/timeline/types";

export type { Rag };

export interface LaneRollup {
  laneId: string;
  laneName: string;
  rag: Rag;
  atRiskCount: number;
  delayedCount: number;
  /**
   * Improving/worsening vs. the most recent rollupHistory entry dated before
   * today (never today's own just-written snapshot — that would trivially
   * compare equal). Undefined when no such entry exists yet, e.g. a lane's
   * first-ever view. The UI renders nothing in that case.
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

const RAG_ORDER: Record<Rag, number> = { green: 0, amber: 1, red: 2 };

/**
 * Most recent rollupHistory entry strictly before today — string comparison
 * is safe since dates are always "YYYY-MM-DD" (see cascade.ts's isBefore).
 */
function priorSnapshot(lane: Swimlane, todayKey: string) {
  return (lane.rollupHistory ?? [])
    .filter((s) => s.date < todayKey)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

function trendForLane(lane: Swimlane, currentRag: Rag, todayKey: string): LaneRollup["trend"] {
  const prior = priorSnapshot(lane, todayKey);
  if (!prior) return undefined;
  if (RAG_ORDER[currentRag] === RAG_ORDER[prior.rag]) return "flat";
  return RAG_ORDER[currentRag] < RAG_ORDER[prior.rag] ? "up" : "down";
}

export function laneRollups(data: RoadmapData, today: Date): LaneRollup[] {
  const todayKey = today.toISOString().slice(0, 10);
  return data.swimlanes
    .filter((l) => l.type === "lane")
    .map((lane) => {
      const milestones = data.milestones.filter((m) => m.laneId === lane.id);
      const rag = lane.ragOverride ?? ragForLane(milestones, today);
      return {
        laneId: lane.id,
        laneName: lane.name,
        rag,
        atRiskCount: milestones.filter((m) => m.status === "at-risk").length,
        delayedCount: milestones.filter((m) => m.status === "delayed").length,
        trend: trendForLane(lane, rag, todayKey),
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
