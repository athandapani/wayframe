import { describe, expect, it } from "vitest";
import type { Milestone, Program } from "@/components/timeline/types";
import { scanReferentialProblems } from "./referential-scan";

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

function baseProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

describe("scanReferentialProblems", () => {
  it("returns no problems for a fully consistent program", () => {
    const program = baseProgram({
      milestones: [milestone({ id: "m1", date: "2026-01-01" }), milestone({ id: "m2", date: "2026-02-01", dependsOn: [{ id: "m1", showConnector: true }] })],
    });
    expect(scanReferentialProblems(program)).toEqual([]);
  });

  it("surfaces a dangling laneId without mutating the program or throwing", () => {
    // Same shape as a concurrent delete-lane + set-laneId collision (t14's
    // prototype walkthrough 1): the lane is simply gone by the time this
    // scan runs, whatever op caused that.
    const program = baseProgram({ milestones: [milestone({ id: "m1", date: "2026-01-01", laneId: "deleted-lane" })] });
    const snapshotBefore = JSON.stringify(program);

    const problems = scanReferentialProblems(program);

    expect(problems).toEqual([{ kind: "dangling-lane", milestoneId: "m1", laneId: "deleted-lane", message: expect.any(String) }]);
    expect(JSON.stringify(program)).toBe(snapshotBefore);
  });

  it("surfaces a dependsOn edge to a milestone that no longer exists", () => {
    const program = baseProgram({
      milestones: [milestone({ id: "m1", date: "2026-01-01", dependsOn: [{ id: "gone", showConnector: true }] })],
    });
    expect(scanReferentialProblems(program)).toEqual([{ kind: "dangling-dependency", milestoneId: "m1", dependencyId: "gone", message: expect.any(String) }]);
  });

  it("surfaces a linksToTopLevelMilestone pointing at a nonexistent top-level item", () => {
    const program = baseProgram({
      milestones: [milestone({ id: "m1", date: "2026-01-01", linksToTopLevelMilestone: "gone" })],
    });
    expect(scanReferentialProblems(program)).toEqual([{ kind: "dangling-top-level-link", milestoneId: "m1", topLevelItemId: "gone", message: expect.any(String) }]);
  });

  it("surfaces every simultaneous problem on one milestone, not just the first", () => {
    const program = baseProgram({
      milestones: [
        milestone({
          id: "m1",
          date: "2026-01-01",
          laneId: "deleted-lane",
          dependsOn: [{ id: "gone", showConnector: true }],
          linksToTopLevelMilestone: "also-gone",
        }),
      ],
    });
    const problems = scanReferentialProblems(program);
    expect(problems).toHaveLength(3);
    expect(problems.map((p) => p.kind).sort()).toEqual(["dangling-dependency", "dangling-lane", "dangling-top-level-link"]);
  });
});
