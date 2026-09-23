import { describe, expect, it } from "vitest";
import type { Milestone, Program } from "@/components/timeline/types";
import { addMilestoneAddition, dismissMilestoneOverride, gcScenario, repointScenarioOverrides, setMilestoneOverride, setTopLevelItemOverride } from "./apply";
import { createScenario } from "./types";
import { resolveScenario } from "./resolve";
import { planMilestoneMove } from "@/lib/corrections/cross-program-move";

function milestone(overrides: Partial<Milestone> & Pick<Milestone, "id" | "date">): Milestone {
  return {
    laneId: "lane-1",
    title: overrides.id,
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
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

describe("repointScenarioOverrides", () => {
  it("carries a modify override over to the moved milestone's new id", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });
    scenario = repointScenarioOverrides(scenario, { m1: "m1-new" });
    expect(Object.keys(scenario.milestoneOverrides)).toEqual(["m1-new"]);
    expect(scenario.milestoneOverrides["m1-new"]).toEqual({ op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });
  });

  it("carries a remove override over too — a hidden item stays hidden after the move", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "remove" });
    scenario = repointScenarioOverrides(scenario, { m1: "m1-new" });
    expect(scenario.milestoneOverrides).toEqual({ "m1-new": { op: "remove" } });
  });

  it("rebases baseRevAtCreation to 1, since the destination clone's own rev restarts there", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "delayed" }, baseRevAtCreation: 5 });
    scenario = repointScenarioOverrides(scenario, { m1: "m1-new" });
    expect(scenario.milestoneOverrides["m1-new"]).toEqual({ op: "modify", patch: { status: "delayed" }, baseRevAtCreation: 1 });
  });

  it("rewrites every id in a swimlane move's idMap and leaves the rest alone", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });
    scenario = setMilestoneOverride(scenario, "m2", { op: "remove" });
    scenario = setMilestoneOverride(scenario, "elsewhere", { op: "modify", patch: { status: "complete" }, baseRevAtCreation: 3 });
    // A swimlane move's idMap carries the lane id alongside its milestones —
    // nothing is keyed by lane id, so it passes through harmlessly.
    scenario = repointScenarioOverrides(scenario, { "lane-1": "lane-new", m1: "m1-new", m2: "m2-new" });
    expect(Object.keys(scenario.milestoneOverrides).sort()).toEqual(["elsewhere", "m1-new", "m2-new"]);
    expect(scenario.milestoneOverrides.elsewhere).toEqual({ op: "modify", patch: { status: "complete" }, baseRevAtCreation: 3 });
  });

  it("never rewrites topLevelItemOverrides — a colliding id there names a different target", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setTopLevelItemOverride(scenario, "m1", { op: "modify", patch: { title: "Phase One" }, baseRevAtCreation: 1 });
    const next = repointScenarioOverrides(scenario, { m1: "m1-new" });
    expect(next.topLevelItemOverrides).toEqual({ m1: { op: "modify", patch: { title: "Phase One" }, baseRevAtCreation: 1 } });
  });

  it("leaves a scenario-only addition's dependsOn edge alone — re-pointing it would manufacture a cross-Program dependency", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = addMilestoneAddition(scenario, milestone({ id: "new-1", date: "2026-03-01", dependsOn: [{ id: "m1", showConnector: true }] }));
    scenario = repointScenarioOverrides(scenario, { m1: "m1-new" });
    expect(scenario.milestoneAdditions["new-1"].dependsOn).toEqual([{ id: "m1", showConnector: true }]);
  });

  it("returns the same object when the idMap names no override it holds", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "remove" });
    expect(repointScenarioOverrides(scenario, { other: "other-new" })).toBe(scenario);
    expect(repointScenarioOverrides(scenario, {})).toBe(scenario);
  });

  it("is idempotent — a second pass with the same idMap finds nothing left to move", () => {
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });
    const once = repointScenarioOverrides(scenario, { m1: "m1-new" });
    expect(repointScenarioOverrides(once, { m1: "m1-new" })).toBe(once);
  });
});

/**
 * The end-to-end claim wayframe#131 actually makes, run through the real move
 * planner and the real resolver rather than asserted as prose.
 *
 * Read these two together, and mind what `orphaned` means per-Program.
 * `resolveScenario` takes ONE Program, while a Scenario is Portfolio-scoped —
 * so in any multi-Program Portfolio it already reports `orphaned` for every
 * override targeting a sibling Program's milestone, move or no move. That is
 * pre-existing (nothing here changes it, and it is a resolver/ownership
 * question, not this ticket's), and it is why the honest statement of what
 * the re-point buys is a swap, not an elimination: before the move exactly
 * one Program applied the override and the others reported it orphaned;
 * after, exactly one Program still applies it — the one the milestone is
 * actually in now — and the others report it orphaned, same as any other
 * sibling-Program override. Without the re-point, NO Program applies it and
 * every one of them reports it orphaned.
 */
describe("repointScenarioOverrides across a real cross-Program move", () => {
  it("moves which Program applies the override, rather than losing it", () => {
    const source = { ...program([milestone({ id: "m1", date: "2026-01-01", status: "not-started" })]), id: "program-1" };
    const dest = { ...program([]), id: "program-2" };

    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });

    // Before the move: the source applies it, the (sibling) destination
    // reports it orphaned — the pre-existing per-Program resolve behaviour.
    expect(resolveScenario(source, scenario).milestones[0].status).toBe("at-risk");
    expect(resolveScenario(dest, scenario).conflicts).toEqual([expect.objectContaining({ type: "orphaned", targetId: "m1" })]);

    const plan = planMilestoneMove(source, dest, "m1", "lane-1", "m1-in-p2")!;
    const moved = repointScenarioOverrides(scenario, { m1: plan.clonedMilestone.id });

    // After: the two Programs have swapped roles, and the override still
    // applies to the same real-world milestone under its new id.
    const inDest = resolveScenario(plan.destNext, moved);
    expect(inDest.milestones.map((m) => [m.id, m.status])).toEqual([["m1-in-p2", "at-risk"]]);
    expect(inDest.conflicts).toEqual([]);
    expect(resolveScenario(plan.sourceNext, moved).conflicts).toEqual([expect.objectContaining({ type: "orphaned", targetId: "m1-in-p2" })]);
  });

  it("without the re-point, NO Program applies the override any more — the intent this ticket preserves", () => {
    const source = { ...program([milestone({ id: "m1", date: "2026-01-01" })]), id: "program-1" };
    const dest = { ...program([]), id: "program-2" };

    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { status: "at-risk" }, baseRevAtCreation: 1 });

    const plan = planMilestoneMove(source, dest, "m1", "lane-1", "m1-in-p2")!;
    expect(resolveScenario(plan.sourceNext, scenario).conflicts).toEqual([expect.objectContaining({ type: "orphaned", targetId: "m1" })]);
    const inDest = resolveScenario(plan.destNext, scenario);
    expect(inDest.conflicts).toEqual([expect.objectContaining({ type: "orphaned", targetId: "m1" })]);
    expect(inDest.milestones.map((m) => m.status)).toEqual(["not-started"]); // the clone, unpatched
  });
});
