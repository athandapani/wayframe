import type { Milestone, Program, TopLevelItem } from "@/components/timeline/types";
import type { MilestoneOverride, Scenario, TopLevelItemOverride } from "./types";

/**
 * Pure delta-mutation helpers over a Scenario (t13, wayframe#87) — mirrors
 * prototypes/scenario-rebase-87.html's `scenarioReducer`. Two invariants
 * carried over exactly from the prototype, both enforced simply by these
 * functions always *overwriting* the map entry rather than merging into it:
 *
 *  - Setting a `modify` override on a target always replaces any prior
 *    override on that same id — deltas don't stack, the latest one wins.
 *  - Setting a `remove` override always collapses any prior `modify` on the
 *    same target — a hidden item's field overrides are meaningless, so
 *    there's nothing left to preserve.
 */

export function setMilestoneOverride(scenario: Scenario, targetId: string, override: MilestoneOverride): Scenario {
  return { ...scenario, milestoneOverrides: { ...scenario.milestoneOverrides, [targetId]: override } };
}

export function setTopLevelItemOverride(scenario: Scenario, targetId: string, override: TopLevelItemOverride): Scenario {
  return { ...scenario, topLevelItemOverrides: { ...scenario.topLevelItemOverrides, [targetId]: override } };
}

/** Clears an override outright — the scenario owner's response to an "orphaned" conflict (resolveScenario), never auto-triggered. */
export function dismissMilestoneOverride(scenario: Scenario, targetId: string): Scenario {
  const milestoneOverrides = { ...scenario.milestoneOverrides };
  delete milestoneOverrides[targetId];
  return { ...scenario, milestoneOverrides };
}

export function dismissTopLevelItemOverride(scenario: Scenario, targetId: string): Scenario {
  const topLevelItemOverrides = { ...scenario.topLevelItemOverrides };
  delete topLevelItemOverrides[targetId];
  return { ...scenario, topLevelItemOverrides };
}

export function addMilestoneAddition(scenario: Scenario, item: Milestone): Scenario {
  return { ...scenario, milestoneAdditions: { ...scenario.milestoneAdditions, [item.id]: item } };
}

export function addTopLevelItemAddition(scenario: Scenario, item: TopLevelItem): Scenario {
  return { ...scenario, topLevelItemAdditions: { ...scenario.topLevelItemAdditions, [item.id]: item } };
}

/**
 * Drops overrides Baseline has already made moot (t13, wayframe#87): a
 * `remove` override whose target Baseline already deleted needed nothing
 * further from the scenario owner — both sides already agree the item is
 * gone, so there's nothing to surface. Never touches a `modify` override
 * this way — a Baseline deletion under a live `modify` is a real conflict,
 * left for resolveScenario to surface as "orphaned" until explicitly
 * dismissed, never silently dropped or resurrected.
 */
export function gcScenario(program: Program, scenario: Scenario): Scenario {
  const milestoneIds = new Set(program.milestones.map((m) => m.id));
  const topLevelItemIds = new Set(program.topLevelItems.map((t) => t.id));

  const milestoneOverrides = { ...scenario.milestoneOverrides };
  for (const [targetId, override] of Object.entries(milestoneOverrides)) {
    if (override.op === "remove" && !milestoneIds.has(targetId)) delete milestoneOverrides[targetId];
  }

  const topLevelItemOverrides = { ...scenario.topLevelItemOverrides };
  for (const [targetId, override] of Object.entries(topLevelItemOverrides)) {
    if (override.op === "remove" && !topLevelItemIds.has(targetId)) delete topLevelItemOverrides[targetId];
  }

  return { ...scenario, milestoneOverrides, topLevelItemOverrides };
}

/**
 * Re-points override keys a cross-Program move renamed (wayframe#131).
 *
 * `idMap` is the old-id -> new-id map a move plan produces —
 * `SwimlaneMovePlan.idMap` verbatim for a swimlane move, or
 * `{ [sourceId]: plan.clonedMilestone.id }` for a single milestone
 * (src/lib/corrections/cross-program-move.ts). Relocating an item across
 * Programs mints a genuinely new, storage-durable id in the destination's own
 * id space rather than carrying the old one over (CONTEXT.md's Cross-Program
 * id namespacing section), which would otherwise leave every Scenario
 * override on that item pointing at an id no longer in any Program.
 * `resolveScenario` already reports that safely as an `orphaned` conflict —
 * nothing is lost silently, and that safety net stays exactly as it is — but
 * the override's *intent* survives the move just fine, since both Programs
 * share one Portfolio and therefore one set of Scenarios. This preserves it.
 *
 * Three things deliberately NOT rewritten:
 *
 *  - `topLevelItemOverrides`. A milestone id and a topLevelItem id are
 *    separate id spaces that can collide without naming the same target (see
 *    Scenario's own doc), and the move primitive relocates milestones and
 *    swimlanes only — so an `idMap` hit on a topLevelItem id would be a
 *    coincidence, not a match. The lane id `SwimlaneMovePlan.idMap` carries
 *    is harmless here for the same reason: nothing is keyed by lane id.
 *  - A `milestoneAdditions` entry's `dependsOn` edge onto a moved milestone.
 *    Re-pointing that would manufacture exactly the cross-Program dependency
 *    edge the move primitive drops on purpose (#124); it stays a
 *    `dangling-reference` conflict for the scenario owner to resolve.
 *  - Anything about the override's own content, except `baseRevAtCreation`
 *    (below) — the patch is the intent being preserved.
 *
 * `baseRevAtCreation` restarts at 1 on a `modify` override, because the
 * clone's `rev` does: both move planners build the destination copy with
 * `rev: undefined`, which every rev-comparison site reads as 1 (`currentRev`,
 * types.ts). Carrying a pre-move `baseRevAtCreation` of, say, 5 across would
 * silently suppress `plan-moved` for the clone's next four real edits.
 *
 * What this does NOT buy, and shouldn't be read as buying: an override that
 * no longer produces an `orphaned` conflict anywhere. `resolveScenario` takes
 * one Program while a Scenario is Portfolio-scoped, so a multi-Program
 * Portfolio already reports `orphaned` for every override targeting a sibling
 * Program's milestone, move or no move — pre-existing, and a
 * resolver/ownership question rather than this one's. The honest statement is
 * a swap: before the move exactly one Program applied the override and its
 * siblings called it orphaned; after, exactly one still does — the one the
 * milestone is now in. Without this, none does. See the end-to-end cases in
 * apply.test.ts, which run the real planner and the real resolver.
 *
 * Returns `scenario` unchanged (by identity) when `idMap` names no override
 * this Scenario holds, so a caller can skip a no-op write cheaply.
 */
export function repointScenarioOverrides(scenario: Scenario, idMap: Record<string, string>): Scenario {
  const entries = Object.entries(scenario.milestoneOverrides);
  if (!entries.some(([targetId]) => idMap[targetId])) return scenario;

  const milestoneOverrides: Record<string, MilestoneOverride> = {};
  for (const [targetId, override] of entries) {
    const newId = idMap[targetId];
    if (!newId) {
      milestoneOverrides[targetId] = override;
      continue;
    }
    milestoneOverrides[newId] = override.op === "modify" ? { ...override, baseRevAtCreation: 1 } : override;
  }
  return { ...scenario, milestoneOverrides };
}
