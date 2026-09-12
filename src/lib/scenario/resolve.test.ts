import { describe, expect, it } from "vitest";
import type { Milestone, Program, TopLevelItem } from "@/components/timeline/types";
import { resolveScenario } from "./resolve";
import { addMilestoneAddition, setMilestoneOverride } from "./apply";
import { createScenario, type Scenario } from "./types";

function milestone(overrides: Partial<Milestone> & Pick<Milestone, "id" | "date">): Milestone {
  return {
    laneId: "lane-1",
    title: overrides.id,
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
    ...overrides,
  };
}

function phase(overrides: Partial<Extract<TopLevelItem, { type: "phase" }>> & Pick<TopLevelItem, "id">): TopLevelItem {
  return {
    type: "phase",
    title: overrides.id,
    status: "not-started",
    startDate: "2026-01-01",
    endDate: "2026-02-01",
    ...overrides,
  } as TopLevelItem;
}

function program(overrides: Partial<Pick<Program, "milestones" | "topLevelItems">>): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test Program",
    generatedAt: "2026-01-01T00:00:00.000Z",
    owner: "owner",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

describe("resolveScenario", () => {
  it("passes every item through unchanged when the scenario has no deltas", () => {
    const m = milestone({ id: "m1", date: "2026-01-01" });
    const p = program({ milestones: [m] });
    const scenario = createScenario("s1", "Plan B");
    const resolved = resolveScenario(p, scenario);
    expect(resolved.milestones).toEqual([m]);
    expect(resolved.conflicts).toEqual([]);
  });

  it("applies a modify override with no baseline drift and reports no conflict", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", rev: 1 });
    const p = program({ milestones: [m] });
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });
    const resolved = resolveScenario(p, scenario);
    expect(resolved.milestones).toEqual([{ ...m, status: "at-risk" }]);
    expect(resolved.conflicts).toEqual([]);
  });

  it("still applies the override but flags plan-moved once baseline's rev advances past baseRevAtCreation", () => {
    const m = milestone({ id: "m1", date: "2026-03-01", rev: 2 }); // baseline moved the date after the override was set
    const p = program({ milestones: [m] });
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });
    const resolved = resolveScenario(p, scenario);
    expect(resolved.milestones).toEqual([{ ...m, status: "at-risk" }]);
    expect(resolved.conflicts).toEqual([{ type: "plan-moved", itemKind: "milestone", targetId: "m1", message: expect.any(String) }]);
  });

  it("hides a remove-overridden item with no conflict, regardless of baseline drift", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", rev: 5 });
    const p = program({ milestones: [m] });
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "remove" });
    const resolved = resolveScenario(p, scenario);
    expect(resolved.milestones).toEqual([]);
    expect(resolved.conflicts).toEqual([]);
  });

  it("surfaces a persistent orphaned conflict when a modify override's target is deleted from baseline", () => {
    const p = program({ milestones: [] }); // m1 deleted from baseline
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "delayed" }, baseRevAtCreation: 1 });
    const resolved = resolveScenario(p, scenario);
    expect(resolved.milestones).toEqual([]);
    expect(resolved.conflicts).toEqual([{ type: "orphaned", itemKind: "milestone", targetId: "m1", message: expect.any(String) }]);
  });

  it("never surfaces an orphan for a remove override whose target baseline already deleted — that's agreement, not conflict", () => {
    const p = program({ milestones: [] });
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "remove" });
    const resolved = resolveScenario(p, scenario);
    expect(resolved.conflicts).toEqual([]);
  });

  it("renders a valid addition with a real dependsOn and no conflict", () => {
    const anchor = milestone({ id: "m1", date: "2026-01-01" });
    const p = program({ milestones: [anchor] });
    const addition = milestone({ id: "new-1", date: "2026-03-01", dependsOn: [{ id: "m1", showConnector: true }] });
    let scenario = createScenario("s1", "Plan B");
    scenario = addMilestoneAddition(scenario, addition);
    const resolved = resolveScenario(p, scenario);
    expect(resolved.milestones).toEqual([anchor, addition]);
    expect(resolved.conflicts).toEqual([]);
  });

  it("flags a dangling-reference when an addition depends on an id absent from both baseline and the scenario", () => {
    const p = program({ milestones: [] });
    const addition = milestone({ id: "new-1", date: "2026-03-01", dependsOn: [{ id: "ghost", showConnector: true }] });
    let scenario = createScenario("s1", "Plan B");
    scenario = addMilestoneAddition(scenario, addition);
    const resolved = resolveScenario(p, scenario);
    expect(resolved.conflicts).toEqual([{ type: "dangling-reference", itemKind: "milestone", targetId: "new-1", message: expect.any(String) }]);
  });

  it("applies topLevelItem overrides the same way as milestone overrides", () => {
    const ph = phase({ id: "p1", rev: 1 });
    const p = program({ topLevelItems: [ph] });
    let scenario: Scenario = createScenario("s1", "Plan B");
    scenario = { ...scenario, topLevelItemOverrides: { p1: { op: "modify", patch: { status: "delayed" }, baseRevAtCreation: 1 } } };
    const resolved = resolveScenario(p, scenario);
    expect(resolved.topLevelItems).toEqual([{ ...ph, status: "delayed" }]);
    expect(resolved.conflicts).toEqual([]);
  });
});
