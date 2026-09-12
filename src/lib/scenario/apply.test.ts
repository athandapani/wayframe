import { describe, expect, it } from "vitest";
import type { Milestone, Program } from "@/components/timeline/types";
import { addMilestoneAddition, dismissMilestoneOverride, gcScenario, setMilestoneOverride } from "./apply";
import { createScenario } from "./types";

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

function program(milestones: Milestone[]): Program {
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
    milestones,
  };
}

describe("setMilestoneOverride", () => {
  it("replaces a prior override on the same target rather than stacking", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });
    scenario = setMilestoneOverride(scenario, "m1", { op: "remove" });
    expect(Object.keys(scenario.milestoneOverrides)).toEqual(["m1"]);
    expect(scenario.milestoneOverrides.m1).toEqual({ op: "remove" });
  });

  it("reactivates a removed target when a modify override is set on it afterward — only the latest delta survives", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "remove" });
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });
    expect(scenario.milestoneOverrides.m1).toEqual({ op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });
  });
});

describe("dismissMilestoneOverride", () => {
  it("deletes the override entirely", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "remove" });
    scenario = dismissMilestoneOverride(scenario, "m1");
    expect(scenario.milestoneOverrides).toEqual({});
  });
});

describe("addMilestoneAddition", () => {
  it("keys the addition by the new item's own id", () => {
    let scenario = createScenario("s1", "Plan B");
    const addition = milestone({ id: "new-1", date: "2026-03-01" });
    scenario = addMilestoneAddition(scenario, addition);
    expect(scenario.milestoneAdditions["new-1"]).toEqual(addition);
  });
});

describe("gcScenario", () => {
  it("drops a remove override once Baseline agrees by deleting the target too", () => {
    const p = program([]); // Baseline no longer has m1
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "remove" });
    scenario = gcScenario(p, scenario);
    expect(scenario.milestoneOverrides).toEqual({});
  });

  it("never touches a modify override whose target Baseline deleted — that's a real conflict, not agreement", () => {
    const p = program([]); // Baseline no longer has m1
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "delayed" }, baseRevAtCreation: 1 });
    scenario = gcScenario(p, scenario);
    expect(scenario.milestoneOverrides.m1).toEqual({ op: "modify", patch: { status: "delayed" }, baseRevAtCreation: 1 });
  });

  it("leaves a remove override alone while Baseline still has the target", () => {
    const p = program([milestone({ id: "m1", date: "2026-01-01" })]);
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "remove" });
    scenario = gcScenario(p, scenario);
    expect(scenario.milestoneOverrides.m1).toEqual({ op: "remove" });
  });
});
