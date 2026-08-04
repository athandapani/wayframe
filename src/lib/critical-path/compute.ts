import type { Milestone, RoadmapData, TopLevelItem } from "@/components/timeline/types";

/**
 * True critical-path (CPM) calculation, per wayframe#34's design decision.
 *
 * Every milestone already carries a fixed `date` (extraction or manual
 * edit already set it) — this isn't computing dates from scratch the way a
 * traditional scheduling tool does. Instead it's a backward pass over the
 * existing dates: a milestone's "late-allowable date" is the latest its own
 * date could be without pushing any successor later than that successor's
 * own committed date. A milestone with no successors is unconstrained, so
 * its late-allowable date is just its own date. `slack = lateAllowableDate
 * - date`; `slack <= 0` (zero *or negative*) means critical — a predecessor
 * already later than what a successor's date implies is the most critical
 * state, not a separate one.
 *
 * The graph is one DAG across the whole document: lane Milestone.dependsOn
 * edges (cross-lane included, matching how they already render), plus each
 * milestone's linksToTopLevelMilestone as an implicit edge into a top-level
 * `milestone`-type TopLevelItem (never a `phase` — linksToTopLevelMilestone
 * only ever references a top-level milestone in practice; phase date-range
 * math is intentionally out of scope, see #34).
 *
 * A milestone with no dependency relationship in any direction (no
 * dependsOn, nothing depends on it, no linksToTopLevelMilestone) is
 * excluded entirely rather than trivially computing critical — without
 * this, every disconnected milestone would show critical purely because
 * nothing constrains it, which isn't what "critical path" means here.
 */

function topLevelMilestoneDates(topLevelItems: readonly TopLevelItem[]): Map<string, string> {
  const dates = new Map<string, string>();
  for (const t of topLevelItems) {
    if (t.type === "milestone") dates.set(t.id, t.date);
  }
  return dates;
}

/** Ids of milestones the given milestone must happen no later than, per the current data. */
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

  function linkedTopLevelDate(m: Milestone): string | undefined {
    return m.linksToTopLevelMilestone !== null ? topLevelDateById.get(m.linksToTopLevelMilestone) : undefined;
  }

  function isIsolated(m: Milestone): boolean {
    return m.dependsOn.length === 0 && (dependents.get(m.id)?.length ?? 0) === 0 && linkedTopLevelDate(m) === undefined;
  }

  const memo = new Map<string, string>();
  const visiting = new Set<string>();

  function lateAllowableDate(id: string): string {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const m = byId.get(id)!;
    // A cyclic dependsOn graph shouldn't occur in valid data — fall back to
    // the node's own date rather than recursing forever if it does.
    if (visiting.has(id)) return m.date;
    visiting.add(id);

    const constraints: string[] = [];
    for (const depId of dependents.get(id) ?? []) constraints.push(lateAllowableDate(depId));
    const linked = linkedTopLevelDate(m);
    if (linked !== undefined) constraints.push(linked);

    const result = constraints.length > 0 ? constraints.reduce((min, d) => (d < min ? d : min)) : m.date;
    visiting.delete(id);
    memo.set(id, result);
    return result;
  }

  const critical = new Set<string>();
  for (const m of milestones) {
    if (isIsolated(m)) continue;
    if (lateAllowableDate(m.id) <= m.date) critical.add(m.id);
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
