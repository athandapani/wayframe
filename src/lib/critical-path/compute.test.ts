import { describe, expect, it } from "vitest";
import type { Milestone, TopLevelItem } from "@/components/timeline/types";
import { computeCriticalPathIds, withComputedCriticalPath } from "./compute";

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

function dep(id: string): { id: string; showConnector: boolean } {
  return { id, showConnector: true };
}

describe("computeCriticalPathIds", () => {
  it("excludes a fully isolated milestone (no dependsOn, nothing depends on it, no top-level link)", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01" })];
    expect(computeCriticalPathIds({ milestones, topLevelItems: [] })).toEqual(new Set());
  });

  it("marks the terminal node of a chain critical trivially (nothing constrains its own date)", () => {
    const milestones = [
      milestone({ id: "a", date: "2026-01-01" }),
      milestone({ id: "b", date: "2026-02-01", dependsOn: [dep("a")] }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical.has("b")).toBe(true);
  });

  it("marks a predecessor critical when there is zero slack between it and its successor", () => {
    // b's late-allowable date is its own date (terminal). a feeds directly into b with a's
    // date already at the boundary, so a has zero slack too.
    const milestones = [
      milestone({ id: "a", date: "2026-01-15" }),
      milestone({ id: "b", date: "2026-01-15", dependsOn: [dep("a")] }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical.has("a")).toBe(true);
    expect(critical.has("b")).toBe(true);
  });

  it("leaves slack (non-critical) on a predecessor with room before its successor's date", () => {
    const milestones = [
      milestone({ id: "a", date: "2026-01-01" }),
      milestone({ id: "b", date: "2026-06-01", dependsOn: [dep("a")] }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical.has("a")).toBe(false);
    expect(critical.has("b")).toBe(true); // terminal, trivially critical relative to itself
  });

  it("still marks critical when a predecessor's date is already later than its successor implies (negative slack)", () => {
    const milestones = [
      milestone({ id: "a", date: "2026-03-01" }),
      milestone({ id: "b", date: "2026-01-01", dependsOn: [dep("a")] }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical.has("a")).toBe(true);
    expect(critical.has("b")).toBe(true);
  });

  it("computes across a cross-lane chain in one whole-document graph", () => {
    const milestones = [
      milestone({ id: "a", date: "2026-01-01", laneId: "lane-a" }),
      milestone({ id: "b", date: "2026-01-01", dependsOn: [dep("a")], laneId: "lane-b" }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical.has("a")).toBe(true);
    expect(critical.has("b")).toBe(true);
  });

  it("treats linksToTopLevelMilestone as an implicit edge into a top-level milestone-type item", () => {
    const topLevelItems: TopLevelItem[] = [{ id: "top-ga", type: "milestone", title: "GA", date: "2026-06-01", status: "on-track" }];
    const milestones = [milestone({ id: "a", date: "2026-06-01", linksToTopLevelMilestone: "top-ga" })];
    const critical = computeCriticalPathIds({ milestones, topLevelItems });
    expect(critical.has("a")).toBe(true);
  });

  it("ignores linksToTopLevelMilestone when the referenced item is a phase, not a milestone", () => {
    const topLevelItems: TopLevelItem[] = [{ id: "top-phase", type: "phase", title: "Phase", startDate: "2026-01-01", endDate: "2026-06-01", status: "on-track" }];
    // a has no other edges, so if the phase link counted, it wouldn't be isolated; since it's ignored, a is isolated.
    const milestones = [milestone({ id: "a", date: "2026-06-01", linksToTopLevelMilestone: "top-phase" })];
    const critical = computeCriticalPathIds({ milestones, topLevelItems });
    expect(critical.has("a")).toBe(false);
  });

  it("does not stack-overflow on a cyclic dependsOn graph", () => {
    const milestones = [
      milestone({ id: "a", date: "2026-01-01", dependsOn: [dep("b")] }),
      milestone({ id: "b", date: "2026-01-01", dependsOn: [dep("a")] }),
    ];
    expect(() => computeCriticalPathIds({ milestones, topLevelItems: [] })).not.toThrow();
  });
});

describe("withComputedCriticalPath", () => {
  it("overlays isCriticalPathOverride over the computed result", () => {
    const milestones = [
      // isolated -> computes false, but forced on via override.
      milestone({ id: "a", date: "2026-01-01", isCriticalPathOverride: true }),
      // terminal chain end -> computes true, but forced off via override.
      milestone({ id: "b", date: "2026-01-01" }),
    ];
    const data = {
      schemaVersion: "1.0",
      programName: "p",
      generatedAt: "2026-01-01T00:00:00Z",
      owner: "o",
      bluf: { statement: "s", bullets: [] },
      actionItems: [],
      swimlanes: [],
      topLevelItems: [],
      milestones: [{ ...milestones[1], isCriticalPathOverride: false, dependsOn: [dep("a")] }, milestones[0]],
    };
    const result = withComputedCriticalPath(data);
    expect(result.milestones.find((m) => m.id === "a")!.isCriticalPath).toBe(true);
    expect(result.milestones.find((m) => m.id === "b")!.isCriticalPath).toBe(false);
  });
});
