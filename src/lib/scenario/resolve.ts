import { currentRev, type Milestone, type Program, type TopLevelItem } from "@/components/timeline/types";
import type { Scenario } from "./types";

/**
 * Surfaced, never silently dropped and never silently resurrected (t13,
 * wayframe#87) — the scenario owner decides what happens next for
 * `orphaned`/`dangling-reference`; `plan-moved` is purely informational
 * (the override still applies).
 */
export type ScenarioConflict =
  | { type: "plan-moved"; itemKind: "milestone" | "topLevelItem"; targetId: string; message: string }
  | { type: "orphaned"; itemKind: "milestone" | "topLevelItem"; targetId: string; message: string }
  | { type: "dangling-reference"; itemKind: "milestone"; targetId: string; message: string };

export interface ResolvedScenario {
  milestones: Milestone[];
  topLevelItems: TopLevelItem[];
  conflicts: ScenarioConflict[];
}

/**
 * Live-merges a Scenario's sparse deltas over a Program's current Baseline
 * state (t13, wayframe#87) — ported from
 * prototypes/scenario-rebase-87.html's `resolveScenarioView`, the core
 * answer to #87: a Scenario resolves as Baseline-merged-live, never a
 * frozen/materialized copy. Every field the Scenario hasn't overridden
 * flows straight through at whatever its *current* Program value is.
 *
 * Conflict rules, exactly as the prototype's walkthroughs established:
 *  - `remove` hides the item — no conflict, regardless of what Baseline does
 *    to it afterward (its fields no longer matter once hidden).
 *  - `modify` applies its patch on top of the item's *current* Baseline
 *    state. If the item's live `rev` has advanced past the override's
 *    `baseRevAtCreation`, that's a `plan-moved` conflict — informational
 *    only, the override still wins.
 *  - An override (of either kind) whose target no longer exists in the
 *    Program is `orphaned` — except a `remove` override, which agrees with
 *    Baseline already and gcScenario (apply.ts) should have cleared before
 *    resolve ever sees it; this stays defensive about that regardless.
 *  - A milestone addition's `dependsOn` pointing at neither a Baseline
 *    milestone nor another addition is a `dangling-reference` —
 *    topLevelItem additions have no `dependsOn`, so this only applies to
 *    milestone additions.
 *
 * Unconsumed today — no Scenario-switcher UI calls this yet (CONTEXT.md:
 * which Scenario a viewer is looking at is viewer-local state a future
 * ticket owns). Mirrors t36's presence-rendering-primitive and t4's
 * realtime-provider "scaffolded, not yet wired" treatment.
 */
export function resolveScenario(program: Program, scenario: Scenario): ResolvedScenario {
  const conflicts: ScenarioConflict[] = [];

  const milestoneIds = new Set(program.milestones.map((m) => m.id));
  const milestones: Milestone[] = [];
  for (const item of program.milestones) {
    const override = scenario.milestoneOverrides[item.id];
    if (!override) {
      milestones.push(item);
      continue;
    }
    if (override.op === "remove") continue;
    milestones.push({ ...item, ...override.patch });
    if (currentRev(item) > override.baseRevAtCreation) {
      conflicts.push({
        type: "plan-moved",
        itemKind: "milestone",
        targetId: item.id,
        message: `"${item.title}" changed in the plan since this scenario's override was set. The override still applies to the field(s) it touches; everything else follows the plan's current value.`,
      });
    }
  }
  for (const [targetId, override] of Object.entries(scenario.milestoneOverrides)) {
    if (milestoneIds.has(targetId)) continue;
    if (override.op === "remove") continue;
    conflicts.push({
      type: "orphaned",
      itemKind: "milestone",
      targetId,
      message: `A scenario override targets a milestone that no longer exists in the plan. Not shown in this scenario until dismissed.`,
    });
  }

  const knownMilestoneIds = new Set([...milestoneIds, ...Object.keys(scenario.milestoneAdditions)]);
  for (const addition of Object.values(scenario.milestoneAdditions)) {
    milestones.push(addition);
    for (const dep of addition.dependsOn) {
      if (!knownMilestoneIds.has(dep.id)) {
        conflicts.push({
          type: "dangling-reference",
          itemKind: "milestone",
          targetId: addition.id,
          message: `"${addition.title}" (added only in this scenario) depends on a milestone that doesn't exist in the plan or this scenario.`,
        });
      }
    }
  }

  const topLevelItemIds = new Set(program.topLevelItems.map((t) => t.id));
  const topLevelItems: TopLevelItem[] = [];
  for (const item of program.topLevelItems) {
    const override = scenario.topLevelItemOverrides[item.id];
    if (!override) {
      topLevelItems.push(item);
      continue;
    }
    if (override.op === "remove") continue;
    topLevelItems.push({ ...item, ...override.patch } as TopLevelItem);
    if (currentRev(item) > override.baseRevAtCreation) {
      conflicts.push({
        type: "plan-moved",
        itemKind: "topLevelItem",
        targetId: item.id,
        message: `"${item.title}" changed in the plan since this scenario's override was set. The override still applies to the field(s) it touches; everything else follows the plan's current value.`,
      });
    }
  }
  for (const [targetId, override] of Object.entries(scenario.topLevelItemOverrides)) {
    if (topLevelItemIds.has(targetId)) continue;
    if (override.op === "remove") continue;
    conflicts.push({
      type: "orphaned",
      itemKind: "topLevelItem",
      targetId,
      message: `A scenario override targets a top-level item that no longer exists in the plan. Not shown in this scenario until dismissed.`,
    });
  }
  for (const addition of Object.values(scenario.topLevelItemAdditions)) {
    topLevelItems.push(addition);
  }

  return { milestones, topLevelItems, conflicts };
}
