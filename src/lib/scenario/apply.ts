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
