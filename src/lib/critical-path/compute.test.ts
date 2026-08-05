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
  it("excludes a fully isolated milestone", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01" })];
    expect(computeCriticalPathIds({ milestones, topLevelItems: [] })).toEqual(new Set());
  });

  it("returns a CONNECTED chain — every node but the first has a critical predecessor", () => {
    // The property the whole feature rests on: the critical path has to be
    // drawable as a line. The previous slack-based implementation returned
    // a set of disconnected chain-ends with no edge between any two.
    const milestones = [
      milestone({ id: "a", date: "2026-01-01" }),
      milestone({ id: "b", date: "2026-06-01", dependsOn: [dep("a")] }),
      milestone({ id: "c", date: "2026-12-01", dependsOn: [dep("b")] }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical).toEqual(new Set(["a", "b", "c"]));

    const linked = milestones.filter((m) => critical.has(m.id) && m.dependsOn.some((d) => critical.has(d.id)));
    expect(linked.map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("picks the longer of two chains feeding the same finish", () => {
    const milestones = [
      milestone({ id: "short", date: "2026-11-01" }),
      milestone({ id: "long-1", date: "2026-02-01" }),
      milestone({ id: "long-2", date: "2026-05-01", dependsOn: [dep("long-1")] }),
      milestone({ id: "end", date: "2026-12-01", dependsOn: [dep("short"), dep("long-2")] }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical.has("end")).toBe(true);
    expect(critical.has("long-2")).toBe(true);
    expect(critical.has("long-1")).toBe(true);
    expect(critical.has("short")).toBe(false);
  });

  it("ignores a chain that doesn't reach the program finish", () => {
    const milestones = [
      milestone({ id: "early-a", date: "2026-01-01" }),
      milestone({ id: "early-b", date: "2026-02-01", dependsOn: [dep("early-a")] }),
      milestone({ id: "late-a", date: "2026-06-01" }),
      milestone({ id: "late-b", date: "2026-12-01", dependsOn: [dep("late-a")] }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical.has("late-b")).toBe(true);
    expect(critical.has("late-a")).toBe(true);
    expect(critical.has("early-b")).toBe(false);
    expect(critical.has("early-a")).toBe(false);
  });

  it("includes both endpoints when two chains tie for the finish date", () => {
    const milestones = [
      milestone({ id: "a1", date: "2026-01-01" }),
      milestone({ id: "a2", date: "2026-12-01", dependsOn: [dep("a1")] }),
      milestone({ id: "b1", date: "2026-02-01" }),
      milestone({ id: "b2", date: "2026-12-01", dependsOn: [dep("b1")] }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical).toEqual(new Set(["a1", "a2", "b1", "b2"]));
  });

  it("spans lanes — the chain is one graph across the whole document", () => {
    const milestones = [
      milestone({ id: "a", date: "2026-01-01", laneId: "lane-a" }),
      milestone({ id: "b", date: "2026-09-01", dependsOn: [dep("a")], laneId: "lane-b" }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems: [] });
    expect(critical).toEqual(new Set(["a", "b"]));
  });

  it("lets a linked top-level milestone set the program finish", () => {
    const topLevelItems: TopLevelItem[] = [{ id: "top-ga", type: "milestone", title: "GA", date: "2027-06-01", status: "on-track" }];
    const milestones = [
      milestone({ id: "a", date: "2026-01-01" }),
      milestone({ id: "b", date: "2026-02-01", dependsOn: [dep("a")], linksToTopLevelMilestone: "top-ga" }),
      milestone({ id: "other", date: "2026-05-01", dependsOn: [dep("a")] }),
    ];
    const critical = computeCriticalPathIds({ milestones, topLevelItems });
    // `b` reaches GA, so its chain paces the program even though `other` is later.
    expect(critical.has("b")).toBe(true);
    expect(critical.has("a")).toBe(true);
    expect(critical.has("other")).toBe(false);
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
    const data = {
      schemaVersion: "1.0",
      programName: "p",
      generatedAt: "2026-01-01T00:00:00Z",
      owner: "o",
      bluf: { statement: "s", bullets: [] },
      actionItems: [],
      swimlanes: [],
      topLevelItems: [],
      milestones: [
        // isolated -> computes false, forced on via override
        milestone({ id: "a", date: "2026-01-01", isCriticalPathOverride: true }),
        // on the real chain -> computes true, forced off via override
        milestone({ id: "b", date: "2026-06-01", isCriticalPathOverride: false }),
        milestone({ id: "c", date: "2026-12-01", dependsOn: [dep("b")] }),
      ],
    };
    const result = withComputedCriticalPath(data);
    const by = (id: string) => result.milestones.find((m) => m.id === id)!;
    expect(by("a").isCriticalPath).toBe(true);
    expect(by("b").isCriticalPath).toBe(false);
    expect(by("c").isCriticalPath).toBe(true);
  });
});
