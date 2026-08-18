import { describe, expect, it } from "vitest";
import { bulkAcceptBaseline, bulkSetLane, bulkSetStatus, bulkShiftDates, buildBulkEditPreview } from "./apply";
import type { Milestone, Swimlane } from "@/components/timeline/types";

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "m1",
    laneId: "lane-1",
    title: "M1",
    date: "2026-01-01",
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
    ...overrides,
  };
}

const lanes: Swimlane[] = [
  { id: "lane-1", order: 0, type: "lane", name: "Lane A" },
  { id: "lane-2", order: 1, type: "lane", name: "Lane B" },
];

describe("bulkShiftDates", () => {
  it("shifts date and endDate for a duration pill by the same delta", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", endDate: "2026-01-10" });
    const ops = bulkShiftDates([m], ["m1"], 5);
    expect(ops).toEqual(
      expect.arrayContaining([
        { targetId: "m1", field: "date", newValue: "2026-01-06", reason: "bulk edit" },
        { targetId: "m1", field: "endDate", newValue: "2026-01-15", reason: "bulk edit" },
      ]),
    );
  });

  it("returns nothing for a zero delta", () => {
    expect(bulkShiftDates([milestone()], ["m1"], 0)).toEqual([]);
  });
});

describe("bulkSetStatus", () => {
  it("emits one status op per id", () => {
    expect(bulkSetStatus(["a", "b"], "complete")).toEqual([
      { targetId: "a", field: "status", newValue: "complete", reason: "bulk edit" },
      { targetId: "b", field: "status", newValue: "complete", reason: "bulk edit" },
    ]);
  });
});

describe("bulkSetLane", () => {
  it("pairs each id with the target lane", () => {
    expect(bulkSetLane(["a", "b"], "lane-2")).toEqual([
      { id: "a", laneId: "lane-2" },
      { id: "b", laneId: "lane-2" },
    ]);
  });
});

describe("bulkAcceptBaseline", () => {
  it("only includes milestones that actually have a baseline to accept", () => {
    const withBaseline = milestone({ id: "m1", originalDate: "2025-12-01" });
    const without = milestone({ id: "m2" });
    const ops = bulkAcceptBaseline([withBaseline, without], ["m1", "m2"]);
    expect(ops).toEqual([{ scope: "one", targetId: "m1", reason: "bulk accept baseline" }]);
  });
});

describe("buildBulkEditPreview", () => {
  it("skips a milestone already at the target status", () => {
    const m = milestone({ id: "m1", status: "complete" });
    const entries = buildBulkEditPreview([m], lanes, ["m1"], { kind: "status", status: "complete" });
    expect(entries).toHaveLength(0);
  });

  it("shows a lane-move as a before/after lane name pair", () => {
    const m = milestone({ id: "m1", laneId: "lane-1" });
    const entries = buildBulkEditPreview([m], lanes, ["m1"], { kind: "lane", laneId: "lane-2" });
    expect(entries[0].fieldChanges).toEqual([{ field: "lane", before: "Lane A", after: "Lane B" }]);
  });

  it("skips a milestone with no baseline for accept-baseline preview", () => {
    const entries = buildBulkEditPreview([milestone({ id: "m1" })], lanes, ["m1"], { kind: "acceptBaseline" });
    expect(entries).toHaveLength(0);
  });
});
