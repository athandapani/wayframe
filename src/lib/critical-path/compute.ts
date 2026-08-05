import type { Milestone, RoadmapData, TopLevelItem } from "@/components/timeline/types";

/**
 * Critical path = the longest dependency chain that ends at the program's
 * finish.
 *
 * WHY THIS AND NOT SLACK. wayframe#34 specified a zero/negative-slack
 * backward pass over each milestone's already-fixed `date`. That was
 * implemented and shipped, and it does not work — not as a bug, but
 * structurally:
 *
 *   - A node with no successors got a late-allowable date equal to its own
 *     date, so every chain-end was critical by construction. On the demo
 *     document that produced five "critical" milestones with no dependency
 *     edge between any two of them.
 *   - Anchoring terminals to the program finish instead fixes that, but
 *     exposes the deeper problem: without durations, a milestone whose
 *     successor is later can always slip up to that successor's date, so it
 *     has slack. Zero slack only occurs when two linked dates are exactly
 *     equal. A connected chain is therefore essentially unreachable.
 *
 * Real CPM gets its connectivity from durations (finish-to-start), and this
 * model has none — milestones are points, not spans. So "critical path" is
 * redefined here as the chain that paces the program: walk back from the
 * latest milestone, at each step taking the predecessor that starts the
 * longest chain. That is connected by construction, which is what makes it
 * drawable as a line, and it answers the question a reader actually asks —
 * "what sequence determines the finish date?"
 *
 * Ties (equal chain depth) resolve to the later predecessor: of two
 * equally-long chains, the one running latest is the one with least room.
 *
 * The graph is one DAG across the whole document: lane Milestone.dependsOn
 * edges, cross-lane included. `linksToTopLevelMilestone` still contributes
 * the program-finish date (a lane milestone tied to a top-level milestone
 * can pace the program) but is not itself walked, since top-level items
 * have no predecessors to continue a chain into.
 *
 * A milestone with no dependency relationship in any direction is excluded:
 * an isolated point is not part of any path.
 */

function topLevelMilestoneDates(topLevelItems: readonly TopLevelItem[]): Map<string, string> {
  const dates = new Map<string, string>();
  for (const t of topLevelItems) {
    if (t.type === "milestone") dates.set(t.id, t.date);
  }
  return dates;
}

/** Ids of milestones that depend on the given milestone. */
function buildDependents(milestones: readonly Milestone[]): Map<string, string[]> {
  const dependents = new Map<string, string[]>();
  for (const m of milestones) {
    for (const dep of m.dependsOn) {
      if (!dependents.has(dep.id)) dependents.set(dep.id, []);
      dependents.get(dep.id)!.push(m.id);
    }
  }
  return dependents;
}

export function computeCriticalPathIds(data: Pick<RoadmapData, "milestones" | "topLevelItems">): Set<string> {
  const { milestones } = data;
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const dependents = buildDependents(milestones);
  const topLevelDateById = topLevelMilestoneDates(data.topLevelItems);

  function connected(m: Milestone): boolean {
    return m.dependsOn.length > 0 || (dependents.get(m.id)?.length ?? 0) > 0;
  }

  const linked = (m: Milestone) => (m.linksToTopLevelMilestone !== null ? topLevelDateById.get(m.linksToTopLevelMilestone) : undefined);

  /**
   * When a milestone carries a duration (`endDate`, wayframe#15) it's a span,
   * not a point, and the span's END is what paces anything downstream — a
   * six-week qualification window that starts early can still finish last.
   * Milestones without a duration finish on their own date.
   */
  const finishOf = (m: Milestone) => m.endDate ?? m.date;

  /** Hops in the longest chain ending at `id`, plus the predecessor that gives it. */
  const memo = new Map<string, { depth: number; via: string | null }>();
  const visiting = new Set<string>();

  function longestChainTo(id: string): { depth: number; via: string | null } {
    const cached = memo.get(id);
    if (cached) return cached;
    // Cyclic data shouldn't occur, but a cycle here would otherwise recurse
    // forever — treat the revisited node as a chain start.
    if (visiting.has(id)) return { depth: 0, via: null };
    visiting.add(id);

    const m = byId.get(id)!;
    let best: { depth: number; via: string | null } = { depth: 0, via: null };
    for (const dep of m.dependsOn) {
      const pred = byId.get(dep.id);
      if (!pred) continue;
      const candidate = longestChainTo(dep.id).depth + 1;
      const better = candidate > best.depth || (candidate === best.depth && best.via !== null && pred.date > byId.get(best.via)!.date);
      if (better) best = { depth: candidate, via: dep.id };
    }

    visiting.delete(id);
    memo.set(id, best);
    return best;
  }

  // The program's finish, including any top-level milestone a lane
  // milestone is tied to.
  const eligible = milestones.filter(connected);
  if (eligible.length === 0) return new Set();
  const programEnd = eligible.reduce((acc, m) => {
    const d = [finishOf(m), linked(m)].filter(Boolean) as string[];
    const latest = d.reduce((a, b) => (a > b ? a : b));
    return latest > acc ? latest : acc;
  }, "");

  // Every milestone sitting at the finish anchors a chain — ties included,
  // so two lanes landing on the same end date both show. Among those, only
  // the deepest chains count: a single milestone that happens to land on
  // the finish date shouldn't read as critical as a six-hop chain that
  // fought its way there.
  const atEnd = eligible.filter((m) => finishOf(m) === programEnd || linked(m) === programEnd);
  const deepest = atEnd.reduce((max, m) => Math.max(max, longestChainTo(m.id).depth), 0);
  const endpoints = atEnd.filter((m) => longestChainTo(m.id).depth === deepest);

  const critical = new Set<string>();
  for (const end of endpoints) {
    let cursor: string | null = end.id;
    while (cursor && !critical.has(cursor)) {
      critical.add(cursor);
      cursor = longestChainTo(cursor).via;
    }
  }
  return critical;
}

/** Recomputes every milestone's isCriticalPath (override-overlaid) and returns a new RoadmapData. */
export function withComputedCriticalPath(data: RoadmapData): RoadmapData {
  const critical = computeCriticalPathIds(data);
  return {
    ...data,
    milestones: data.milestones.map((m) => ({
      ...m,
      isCriticalPath: m.isCriticalPathOverride ?? critical.has(m.id),
    })),
  };
}
