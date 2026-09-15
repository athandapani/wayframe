import { describe, expect, it } from "vitest";
import {
  ghostsForMilestone,
  ghostsForTopLevelItemPhase,
  ghostsForTopLevelItemMilestone,
  layoutItemGhosts,
  labelForDeltaGhost,
  type DeltaGhost,
} from "./delta-ghosts";
import { formatDateShort } from "./date-utils";
import type { Milestone, TopLevelItem } from "./types";

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "m1",
    laneId: "lane1",
    title: "Test Milestone",
    date: "2026-03-01",
    status: "on-track",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    ...overrides,
  };
}

function phaseItem(overrides: Partial<Extract<TopLevelItem, { type: "phase" }>> = {}): Extract<TopLevelItem, { type: "phase" }> {
  return {
    id: "p1",
    type: "phase",
    title: "Test Phase",
    startDate: "2026-01-01",
    endDate: "2026-02-01",
    status: "on-track",
    ...overrides,
  };
}

function tliMilestone(overrides: Partial<Extract<TopLevelItem, { type: "milestone" }>> = {}): Extract<TopLevelItem, { type: "milestone" }> {
  return {
    id: "tm1",
    type: "milestone",
    title: "Test TLI Milestone",
    date: "2026-03-01",
    status: "on-track",
    ...overrides,
  };
}

describe("ghostsForMilestone", () => {
  it("produces a slip ghost for a point milestone that slipped", () => {
    const m = milestone({ originalDate: "2026-02-20", date: "2026-03-01" });
    const ghosts = ghostsForMilestone(m);
    expect(ghosts).toEqual([{ itemId: "m1", kind: "slip", field: "date", from: "2026-02-20", to: "2026-03-01" }]);
  });

  it("produces an at-risk ghost for a point milestone with a projection", () => {
    const m = milestone({ potentialDate: "2026-03-15" });
    const ghosts = ghostsForMilestone(m);
    expect(ghosts).toEqual([{ itemId: "m1", kind: "at-risk", field: "date", from: "2026-03-01", to: "2026-03-15" }]);
  });

  it("produces both a slip and an at-risk ghost when both apply — ordering is layoutItemGhosts's job, not this function's", () => {
    const m = milestone({ originalDate: "2026-02-20", date: "2026-03-01", potentialDate: "2026-03-15" });
    const ghosts = ghostsForMilestone(m);
    expect(ghosts).toHaveLength(2);
    expect(ghosts).toContainEqual({ itemId: "m1", kind: "slip", field: "date", from: "2026-02-20", to: "2026-03-01" });
    expect(ghosts).toContainEqual({ itemId: "m1", kind: "at-risk", field: "date", from: "2026-03-01", to: "2026-03-15" });
  });

  it("produces NO slip ghost for a duration-pill milestone (endDate set) even with originalDate set — regression guard for the deliberate scope decision", () => {
    const m = milestone({ endDate: "2026-04-01", originalDate: "2026-02-20", date: "2026-03-01" });
    const ghosts = ghostsForMilestone(m);
    expect(ghosts.some((g) => g.kind === "slip")).toBe(false);
  });

  it("maps at-risk to the end edge for a duration-pill milestone", () => {
    const m = milestone({ endDate: "2026-04-01", potentialDate: "2026-04-20" });
    const ghosts = ghostsForMilestone(m);
    expect(ghosts).toEqual([{ itemId: "m1", kind: "at-risk", field: "endDate", from: "2026-04-01", to: "2026-04-20" }]);
  });

  it("passes through scenario diffs as scenario-diff ghosts", () => {
    const m = milestone();
    const ghosts = ghostsForMilestone(m, [{ field: "date", from: "2026-03-01", to: "2026-03-10" }]);
    expect(ghosts).toEqual([{ itemId: "m1", kind: "scenario-diff", field: "date", from: "2026-03-01", to: "2026-03-10" }]);
  });
});

describe("ghostsForTopLevelItemPhase", () => {
  it("produces a start-slip ghost only", () => {
    const t = phaseItem({ originalStartDate: "2025-12-20", startDate: "2026-01-01" });
    const ghosts = ghostsForTopLevelItemPhase(t);
    expect(ghosts).toEqual([{ itemId: "p1", kind: "slip", field: "startDate", from: "2025-12-20", to: "2026-01-01" }]);
  });

  it("produces an end-slip ghost only", () => {
    const t = phaseItem({ originalEndDate: "2026-01-20", endDate: "2026-02-01" });
    const ghosts = ghostsForTopLevelItemPhase(t);
    expect(ghosts).toEqual([{ itemId: "p1", kind: "slip", field: "endDate", from: "2026-01-20", to: "2026-02-01" }]);
  });

  it("produces both independent slip edges when both apply", () => {
    const t = phaseItem({
      originalStartDate: "2025-12-20",
      startDate: "2026-01-01",
      originalEndDate: "2026-01-20",
      endDate: "2026-02-01",
    });
    const ghosts = ghostsForTopLevelItemPhase(t);
    expect(ghosts).toHaveLength(2);
    expect(ghosts).toContainEqual({ itemId: "p1", kind: "slip", field: "startDate", from: "2025-12-20", to: "2026-01-01" });
    expect(ghosts).toContainEqual({ itemId: "p1", kind: "slip", field: "endDate", from: "2026-01-20", to: "2026-02-01" });
  });

  it("maps at-risk to the end edge", () => {
    const t = phaseItem({ potentialDate: "2026-02-20" });
    const ghosts = ghostsForTopLevelItemPhase(t);
    expect(ghosts).toEqual([{ itemId: "p1", kind: "at-risk", field: "endDate", from: "2026-02-01", to: "2026-02-20" }]);
  });

  it("returns all three kinds plus a scenario diff (4 ghosts total) — feeds the overflow test below", () => {
    const t = phaseItem({
      originalStartDate: "2025-12-20",
      startDate: "2026-01-01",
      originalEndDate: "2026-01-20",
      endDate: "2026-02-01",
      potentialDate: "2026-02-20",
    });
    const ghosts = ghostsForTopLevelItemPhase(t, [{ field: "endDate", from: "2026-02-01", to: "2026-02-25" }]);
    expect(ghosts).toHaveLength(4);
  });
});

describe("ghostsForTopLevelItemMilestone", () => {
  it("produces an at-risk ghost only", () => {
    const t = tliMilestone({ potentialDate: "2026-03-15" });
    const ghosts = ghostsForTopLevelItemMilestone(t);
    expect(ghosts).toEqual([{ itemId: "tm1", kind: "at-risk", field: "date", from: "2026-03-01", to: "2026-03-15" }]);
  });

  it("never produces a slip ghost — this variant has no originalDate field to slip from (regression guard)", () => {
    const t = tliMilestone({ potentialDate: "2026-03-15" });
    const ghosts = ghostsForTopLevelItemMilestone(t);
    expect(ghosts.some((g) => g.kind === "slip")).toBe(false);
  });

  it("passes through scenario diffs", () => {
    const t = tliMilestone();
    const ghosts = ghostsForTopLevelItemMilestone(t, [{ field: "date", from: "2026-03-01", to: "2026-03-08" }]);
    expect(ghosts).toEqual([{ itemId: "tm1", kind: "scenario-diff", field: "date", from: "2026-03-01", to: "2026-03-08" }]);
  });
});

describe("layoutItemGhosts", () => {
  it("places a single ghost at tier 0, labeled", () => {
    const ghosts: DeltaGhost[] = [{ itemId: "m1", kind: "slip", field: "date", from: "2026-02-20", to: "2026-03-01" }];
    const { placed, overflowCount } = layoutItemGhosts(ghosts);
    expect(placed).toEqual([{ ...ghosts[0], tier: 0, labeled: true }]);
    expect(overflowCount).toBe(0);
  });

  it("at-risk wins tier 0/labeled over slip — the literal fix for the t9 bug (prototype walkthrough 2)", () => {
    const slip: DeltaGhost = { itemId: "m1", kind: "slip", field: "date", from: "2026-02-20", to: "2026-03-01" };
    const atRisk: DeltaGhost = { itemId: "m1", kind: "at-risk", field: "date", from: "2026-03-01", to: "2026-03-15" };
    const { placed, overflowCount } = layoutItemGhosts([slip, atRisk]);
    expect(placed).toEqual([
      { ...atRisk, tier: 0, labeled: true },
      { ...slip, tier: 1, labeled: false },
    ]);
    expect(overflowCount).toBe(0);
  });

  it("orders all three kinds by priority: scenario-diff, at-risk, slip (prototype walkthrough 3)", () => {
    const slip: DeltaGhost = { itemId: "m1", kind: "slip", field: "date", from: "2026-02-20", to: "2026-03-01" };
    const atRisk: DeltaGhost = { itemId: "m1", kind: "at-risk", field: "date", from: "2026-03-01", to: "2026-03-15" };
    const scenarioDiff: DeltaGhost = { itemId: "m1", kind: "scenario-diff", field: "date", from: "2026-03-01", to: "2026-03-20" };
    const { placed, overflowCount } = layoutItemGhosts([slip, atRisk, scenarioDiff]);
    expect(placed).toEqual([
      { ...scenarioDiff, tier: 0, labeled: true },
      { ...atRisk, tier: 1, labeled: false },
      { ...slip, tier: 2, labeled: false },
    ]);
    expect(overflowCount).toBe(0);
  });

  it("overflows the lowest-priority (slip) ghost when four ghosts compete for three tiers (prototype walkthrough 6)", () => {
    const slip: DeltaGhost = { itemId: "m1", kind: "slip", field: "date", from: "2026-02-20", to: "2026-03-01" };
    const atRisk: DeltaGhost = { itemId: "m1", kind: "at-risk", field: "date", from: "2026-03-01", to: "2026-03-15" };
    const scenarioDiff: DeltaGhost = { itemId: "m1", kind: "scenario-diff", field: "date", from: "2026-03-01", to: "2026-03-20" };
    const secondSlip: DeltaGhost = { itemId: "m1", kind: "slip", field: "startDate", from: "2026-01-01", to: "2026-01-10" };
    const { placed, overflowCount } = layoutItemGhosts([slip, atRisk, scenarioDiff, secondSlip]);
    expect(placed).toHaveLength(3);
    expect(overflowCount).toBe(1);
    expect(placed.map((p) => p.kind)).toEqual(["scenario-diff", "at-risk", "slip"]);
    // exactly one slip made it in, and one slip (the lowest-priority kind) overflowed
    expect(placed.filter((p) => p.kind === "slip")).toHaveLength(1);
  });

  it("returns an empty placement for an empty input", () => {
    const { placed, overflowCount } = layoutItemGhosts([]);
    expect(placed).toEqual([]);
    expect(overflowCount).toBe(0);
  });
});

describe("labelForDeltaGhost", () => {
  it("formats a late slip with a + prefix", () => {
    const ghost: DeltaGhost = { itemId: "m1", kind: "slip", field: "date", from: "2026-02-21", to: "2026-03-01" };
    expect(labelForDeltaGhost(ghost)).toBe("+8d");
  });

  it("formats an early slip with no + prefix", () => {
    const ghost: DeltaGhost = { itemId: "m1", kind: "slip", field: "date", from: "2026-03-04", to: "2026-03-01" };
    expect(labelForDeltaGhost(ghost)).toBe("-3d");
  });

  it("formats an at-risk label as +Nd risk · <formatDateShort output>", () => {
    const ghost: DeltaGhost = { itemId: "m1", kind: "at-risk", field: "date", from: "2026-03-01", to: "2026-03-13" };
    expect(labelForDeltaGhost(ghost)).toBe(`+12d risk · ${formatDateShort("2026-03-13")}`);
  });

  it("formats a scenario-diff label as Scenario: <formatDateShort output>", () => {
    const ghost: DeltaGhost = { itemId: "m1", kind: "scenario-diff", field: "date", from: "2026-03-01", to: "2026-03-20" };
    expect(labelForDeltaGhost(ghost)).toBe(`Scenario: ${formatDateShort("2026-03-20")}`);
  });
});
