import { describe, expect, it } from "vitest";
import type { RoadmapData } from "@/components/timeline/types";
import { laneRollups } from "./rag";

function baseData(): RoadmapData {
  return {
    schemaVersion: "1.0",
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

describe("laneRollups trend (wayframe#33)", () => {
  it("is undefined when a lane has no rollupHistory yet", () => {
    const [rollup] = laneRollups(baseData(), new Date("2026-06-10"));
    expect(rollup.trend).toBeUndefined();
  });

  it("is undefined when the only history entry is today's own", () => {
    const data = baseData();
    data.swimlanes[0].rollupHistory = [{ date: "2026-06-10", rag: "red", atRiskCount: 1, delayedCount: 1 }];
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBeUndefined();
  });

  it("is up when current rag improved vs. the most recent prior entry", () => {
    const data = baseData();
    data.swimlanes[0].ragOverride = "green";
    data.swimlanes[0].rollupHistory = [{ date: "2026-06-09", rag: "red", atRiskCount: 2, delayedCount: 1 }];
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBe("up");
  });

  it("is down when current rag worsened vs. the most recent prior entry", () => {
    const data = baseData();
    data.swimlanes[0].ragOverride = "red";
    data.swimlanes[0].rollupHistory = [{ date: "2026-06-09", rag: "green", atRiskCount: 0, delayedCount: 0 }];
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBe("down");
  });

  it("is flat when current rag is unchanged vs. the most recent prior entry", () => {
    const data = baseData();
    data.swimlanes[0].ragOverride = "amber";
    data.swimlanes[0].rollupHistory = [{ date: "2026-06-09", rag: "amber", atRiskCount: 1, delayedCount: 0 }];
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBe("flat");
  });

  it("compares against the most recent prior entry, not the oldest", () => {
    const data = baseData();
    data.swimlanes[0].ragOverride = "red";
    data.swimlanes[0].rollupHistory = [
      { date: "2026-06-01", rag: "red", atRiskCount: 2, delayedCount: 1 },
      { date: "2026-06-09", rag: "green", atRiskCount: 0, delayedCount: 0 },
    ];
    const [rollup] = laneRollups(data, new Date("2026-06-10"));
    expect(rollup.trend).toBe("down");
  });
});
