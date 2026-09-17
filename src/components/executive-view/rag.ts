// Per-lane RAG rollup and top-risks ranking for Executive view (wayframe
// issue #8). Auto rollup is the default; Swimlane.ragOverride (resolved in
// the RAG-governance fog item) wins when a lead has set one. Trend compares
// the current rollup against the lane's rollupHistory (wayframe issue #33) —
// undefined until a lane has at least one snapshot dated before today.
import type { Program, RenderableProgram, RollupSnapshot, Swimlane, Milestone, Status, Rag } from "@/components/timeline/types";

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

/** Worst-of reduction over a set of already-resolved Rag values — the same rule ragForLane applies to milestone statuses, generalized one (or two) tiers up per t27's gist. Empty input defaults to green, matching ragForLane's own empty-milestones default. */
export function worstRag(rags: Rag[]): Rag {
  let worst: Rag = "green";
  for (const r of rags) {
    if (RAG_ORDER[r] > RAG_ORDER[worst]) worst = r;
  }
  return worst;
}

/**
 * Most recent rollupHistory entry strictly before today — string comparison
 * of the record's date keys is safe since dates are always "YYYY-MM-DD"
 * (see cascade.ts's isBefore).
 */
function priorSnapshot(lane: Swimlane, todayKey: string): RollupSnapshot | undefined {
  const history = lane.rollupHistory ?? {};
  const priorKey = Object.keys(history)
    .filter((date) => date < todayKey)
    .sort()
    .at(-1);
  return priorKey ? history[priorKey] : undefined;
}

function trendFromPrior(currentRag: Rag, priorRag: Rag | undefined): LaneRollup["trend"] {
  if (!priorRag) return undefined;
  if (RAG_ORDER[currentRag] === RAG_ORDER[priorRag]) return "flat";
  return RAG_ORDER[currentRag] < RAG_ORDER[priorRag] ? "up" : "down";
}

function trendForLane(lane: Swimlane, currentRag: Rag, todayKey: string): LaneRollup["trend"] {
  return trendFromPrior(currentRag, priorSnapshot(lane, todayKey)?.rag);
}

/**
 * The worst-of each contributing lane's own most-recent-prior-to-today
 * snapshot rag (t27) — never a lookup by a single shared date, since lanes
 * snapshot independently. A lane with no prior snapshot simply doesn't
 * contribute (mirrors a Program with zero contributing lanes not
 * contributing to a Portfolio-tier date, per the gist). Undefined only when
 * NO lane in the set has any prior snapshot yet.
 */
function priorAggregateForLanes(lanes: Swimlane[], todayKey: string): Rag | undefined {
  const priorRags = lanes
    .map((lane) => priorSnapshot(lane, todayKey)?.rag)
    .filter((r): r is Rag => r !== undefined);
  return priorRags.length > 0 ? worstRag(priorRags) : undefined;
}

export function laneRollups(data: Program, today: Date): LaneRollup[] {
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

export interface ProgramRollup {
  programId: string;
  programName: string;
  rag: Rag;
  atRiskCount: number;
  delayedCount: number;
  /** Same undefined-until-a-contributing-lane-has-prior-history rule as LaneRollup['trend'], just aggregated across this Program's own lanes (t27). */
  trend?: LaneRollup["trend"];
}

/**
 * Program-tier RAG (t27): ragForLane's worst-status-wins rule applied one
 * tier up, live, over this Program's own laneRollups() — never a second
 * mechanism, and never persisted (mirrors #89/t14's "compute live, don't
 * add a second unbounded log" move). Lane-level ragOverride already flows
 * through via laneRollups(), so a lead's manual pin at the lane tier is
 * respected here for free.
 */
export function programRollup(program: Program, today: Date): ProgramRollup {
  const todayKey = today.toISOString().slice(0, 10);
  const lanes = laneRollups(program, today);
  const rag = worstRag(lanes.map((l) => l.rag));
  const priorRag = priorAggregateForLanes(program.swimlanes.filter((l) => l.type === "lane"), todayKey);
  return {
    programId: program.id,
    programName: program.programName,
    rag,
    atRiskCount: lanes.reduce((sum, l) => sum + l.atRiskCount, 0),
    delayedCount: lanes.reduce((sum, l) => sum + l.delayedCount, 0),
    trend: trendFromPrior(rag, priorRag),
  };
}

export interface PortfolioRollup {
  rag: Rag;
  atRiskCount: number;
  delayedCount: number;
  trend?: LaneRollup["trend"];
  programs: ProgramRollup[];
}

/**
 * Portfolio-tier RAG (t27): the same worst-status-wins rule applied one more
 * tier up, live, over every Program's own Program-level RAG — recursive
 * reuse of one rollup rule at every tier (Lane -> Program -> Portfolio), no
 * new persisted history at this tier either. A Program contributing zero
 * lanes (or none with prior history yet, e.g. newly added to the Portfolio
 * per #t26) simply doesn't contribute to that date's aggregate, same as a
 * lane with no rollupHistory not contributing at the tier below.
 */
export function portfolioRollup(programs: Program[], today: Date): PortfolioRollup {
  const todayKey = today.toISOString().slice(0, 10);
  const programs_ = programs.map((p) => programRollup(p, today));
  const rag = worstRag(programs_.map((p) => p.rag));
  const priorRags = programs
    .map((p) => priorAggregateForLanes(p.swimlanes.filter((l) => l.type === "lane"), todayKey))
    .filter((r): r is Rag => r !== undefined);
  const priorRag = priorRags.length > 0 ? worstRag(priorRags) : undefined;
  return {
    rag,
    atRiskCount: programs_.reduce((sum, p) => sum + p.atRiskCount, 0),
    delayedCount: programs_.reduce((sum, p) => sum + p.delayedCount, 0),
    trend: trendFromPrior(rag, priorRag),
    programs: programs_,
  };
}

// Sourced from theme.ragColor via the --wf-rag-* CSS vars RoadmapWorkspace.tsx
// publishes (wayframe#82) — same pattern ExecutiveTimeline.tsx's own RAG_COLOR
// uses. Exported so every RAG-tinted surface (ExecutiveView's lane tiles, the
// All-Programs rollup chips added in t27) shares one border/background pair
// per bucket instead of each defining its own.
export const RAG_BORDER: Record<Rag, string> = {
  green: "var(--wf-rag-green, #22c55e)",
  amber: "var(--wf-rag-amber, #f59e0b)",
  red: "var(--wf-rag-red, #ef4444)",
};
export const RAG_BG: Record<Rag, string> = {
  green: `color-mix(in srgb, ${RAG_BORDER.green} 12%, transparent)`,
  amber: `color-mix(in srgb, ${RAG_BORDER.amber} 14%, transparent)`,
  red: `color-mix(in srgb, ${RAG_BORDER.red} 14%, transparent)`,
};

/** Ranks by severity, critical-path first, then soonest date. Takes RenderableProgram (t14) since isCriticalPath is computed at the render boundary, not persisted on Program's own Milestone. */
export function topRisks(data: RenderableProgram, limit = 3): RiskItem[] {
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
