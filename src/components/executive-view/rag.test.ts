import { describe, expect, it } from "vitest";
import type { Program } from "@/components/timeline/types";
import { laneRollups, programRollup, portfolioRollup, worstRag } from "./rag";

function baseData(): Program {
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
  };
}

function programWith(overrides: Partial<Program>): Program {
  return { ...baseData(), ...overrides };
}

describe("laneRollups trend (wayframe#33)", () => {
  it("is undefined when a lane has no rollupHistory yet", () => {
    const [rollup] = laneRollups(baseData(), new Date("2026-06-10"));
    expect(rollup.trend).toBeUndefined();
  });

  it("is undefined when the only history entry is today's own", () => {
    const data = baseData();
    data.swimlanes[0].rollupHistory = { "2026-06-10": { rag: "red", atRiskCount: 1, delayedCount: 1 } };
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBeUndefined();
  });

  it("is up when current rag improved vs. the most recent prior entry", () => {
    const data = baseData();
    data.swimlanes[0].ragOverride = "green";
    data.swimlanes[0].rollupHistory = { "2026-06-09": { rag: "red", atRiskCount: 2, delayedCount: 1 } };
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBe("up");
  });

  it("is down when current rag worsened vs. the most recent prior entry", () => {
    const data = baseData();
    data.swimlanes[0].ragOverride = "red";
    data.swimlanes[0].rollupHistory = { "2026-06-09": { rag: "green", atRiskCount: 0, delayedCount: 0 } };
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBe("down");
  });

  it("is flat when current rag is unchanged vs. the most recent prior entry", () => {
    const data = baseData();
    data.swimlanes[0].ragOverride = "amber";
    data.swimlanes[0].rollupHistory = { "2026-06-09": { rag: "amber", atRiskCount: 1, delayedCount: 0 } };
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBe("flat");
  });

  it("compares against the most recent prior entry, not the oldest", () => {
    const data = baseData();
    data.swimlanes[0].ragOverride = "red";
    data.swimlanes[0].rollupHistory = {
      "2026-06-01": { rag: "red", atRiskCount: 2, delayedCount: 1 },
      "2026-06-09": { rag: "green", atRiskCount: 0, delayedCount: 0 },
    };
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBe("down");
  });
});

describe("worstRag", () => {
  it("defaults to green for an empty list", () => {
    expect(worstRag([])).toBe("green");
  });

  it("picks the worst of a mixed list regardless of order", () => {
    expect(worstRag(["green", "amber", "green"])).toBe("amber");
    expect(worstRag(["red", "green", "amber"])).toBe("red");
  });
});

describe("programRollup (t27)", () => {
  it("is worst-of its lanes' rollups", () => {
    const data = programWith({
      swimlanes: [
        { id: "lane-1", order: 0, type: "lane", name: "Lane 1", ragOverride: "green" },
        { id: "lane-2", order: 1, type: "lane", name: "Lane 2", ragOverride: "red" },
      ],
    });
    const rollup = programRollup(data, new Date("2026-06-10"));
    expect(rollup.rag).toBe("red");
    expect(rollup.programId).toBe("program-1");
  });

  it("sums at-risk/delayed counts across lanes", () => {
    const data = programWith({
      swimlanes: [
        { id: "lane-1", order: 0, type: "lane", name: "Lane 1" },
        { id: "lane-2", order: 1, type: "lane", name: "Lane 2" },
      ],
      milestones: [
        { id: "m1", laneId: "lane-1", title: "M1", date: "2026-06-01", status: "delayed", dependsOn: [], linksToTopLevelMilestone: null },
        { id: "m2", laneId: "lane-2", title: "M2", date: "2026-06-01", status: "at-risk", dependsOn: [], linksToTopLevelMilestone: null },
      ],
    });
    const rollup = programRollup(data, new Date("2026-06-10"));
    expect(rollup.delayedCount).toBe(1);
    expect(rollup.atRiskCount).toBe(1);
  });

  it("trend is undefined until at least one lane has prior-day history", () => {
    const data = programWith({
      swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1", ragOverride: "red" }],
    });
    expect(programRollup(data, new Date("2026-06-10")).trend).toBeUndefined();
  });

  it("trend aggregates the worst prior rag across lanes, not just one lane", () => {
    const data = programWith({
      swimlanes: [
        {
          id: "lane-1",
          order: 0,
          type: "lane",
          name: "Lane 1",
          ragOverride: "amber",
          rollupHistory: { "2026-06-09": { rag: "green", atRiskCount: 0, delayedCount: 0 } },
        },
        {
          id: "lane-2",
          order: 1,
          type: "lane",
          name: "Lane 2",
          ragOverride: "amber",
          rollupHistory: { "2026-06-09": { rag: "red", atRiskCount: 1, delayedCount: 1 } },
        },
      ],
    });
    // current program rag = amber (worst of amber/amber); prior aggregate = red (worst of green/red) -> improved -> up
    const rollup = programRollup(data, new Date("2026-06-10"));
    expect(rollup.rag).toBe("amber");
    expect(rollup.trend).toBe("up");
  });
});

describe("portfolioRollup (t27)", () => {
  it("is worst-of every Program's own rollup", () => {
    const green = programWith({ id: "p1", swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "L", ragOverride: "green" }] });
    const red = programWith({ id: "p2", swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "L", ragOverride: "red" }] });
    const rollup = portfolioRollup([green, red], new Date("2026-06-10"));
    expect(rollup.rag).toBe("red");
    expect(rollup.programs.map((p) => p.programId)).toEqual(["p1", "p2"]);
  });

  it("a Program with no contributing lanes doesn't drag down the aggregate", () => {
    const empty = programWith({ id: "p1", swimlanes: [] });
    const green = programWith({ id: "p2", swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "L", ragOverride: "green" }] });
    const rollup = portfolioRollup([empty, green], new Date("2026-06-10"));
    expect(rollup.rag).toBe("green");
  });

  it("trend is undefined until at least one Program has prior-day history", () => {
    const data = programWith({ swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "L", ragOverride: "red" }] });
    expect(portfolioRollup([data], new Date("2026-06-10")).trend).toBeUndefined();
  });

  it("trend improves when the worst prior-day aggregate was worse than today's", () => {
    const data = programWith({
      swimlanes: [
        {
          id: "lane-1",
          order: 0,
          type: "lane",
          name: "L",
          ragOverride: "green",
          rollupHistory: { "2026-06-09": { rag: "red", atRiskCount: 1, delayedCount: 1 } },
        },
      ],
    });
    expect(portfolioRollup([data], new Date("2026-06-10")).trend).toBe("up");
  });
});
