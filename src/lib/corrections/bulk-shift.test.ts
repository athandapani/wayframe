import { describe, expect, it } from "vitest";
import type { Milestone, TopLevelItem } from "@/components/timeline/types";
import { applyCascade } from "./cascade";
import { resolveBulkShiftOps } from "./bulk-shift";
import type { BulkShiftOp } from "./schema";

function milestone(overrides: Partial<Milestone> & Pick<Milestone, "id" | "date" | "laneId">): Milestone {
  return {
    title: overrides.id,
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
    ...overrides,
  };
}

describe("resolveBulkShiftOps", () => {
  it("shifts every milestone in a lane by deltaDays (lane selector)", () => {
    const milestones: Milestone[] = [
      milestone({ id: "m1", laneId: "lane-a", date: "2026-01-01" }),
      milestone({ id: "m2", laneId: "lane-a", date: "2026-02-01" }),
      milestone({ id: "m3", laneId: "lane-b", date: "2026-01-15" }),
    ];
    const op: BulkShiftOp = { selector: { kind: "lane", laneId: "lane-a" }, deltaDays: 7, reason: "shift lane-a" };

    const resolved = resolveBulkShiftOps(milestones, [], [op]);

    const byId = new Map(resolved.patchOps.map((o) => [o.targetId, o]));
    expect(byId.get("m1")?.newValue).toBe("2026-01-08");
    expect(byId.get("m2")?.newValue).toBe("2026-02-08");
    expect(byId.has("m3")).toBe(false);
  });

  it("shifts every PROGRAM-band item via the reserved PROGRAM pseudo-lane", () => {
    const topLevelItems: TopLevelItem[] = [
      { id: "t1", type: "milestone", title: "GA", date: "2026-03-01", status: "not-started" },
      { id: "t2", type: "annotation", title: "Note", date: "2026-03-05", message: "hi" },
    ];
    const op: BulkShiftOp = { selector: { kind: "lane", laneId: "PROGRAM" }, deltaDays: 3, reason: "shift band" };

    const resolved = resolveBulkShiftOps([], topLevelItems, [op]);

    const byId = new Map(resolved.topLevelItemOps.map((o) => [`${o.targetId}:${o.field}`, o]));
    expect(byId.get("t1:date")?.newValue).toBe("2026-03-04");
    expect(byId.get("t2:date")?.newValue).toBe("2026-03-08");
  });

  it("shifts both startDate and endDate together for a phase, preserving its span", () => {
    const topLevelItems: TopLevelItem[] = [{ id: "p1", type: "phase", title: "R&D", startDate: "2026-01-01", endDate: "2026-04-01", status: "on-track" }];
    const op: BulkShiftOp = { selector: { kind: "ids", ids: ["p1"] }, deltaDays: 10, reason: "slip" };

    const resolved = resolveBulkShiftOps([], topLevelItems, [op]);

    const byField = new Map(resolved.topLevelItemOps.map((o) => [o.field, o]));
    expect(byField.get("startDate")?.newValue).toBe("2026-01-11");
    expect(byField.get("endDate")?.newValue).toBe("2026-04-11");
  });

  it("shifts a milestone's endDate (duration pill) alongside its date", () => {
    const milestones: Milestone[] = [milestone({ id: "m1", laneId: "lane-a", date: "2026-01-01", endDate: "2026-01-15" })];
    const op: BulkShiftOp = { selector: { kind: "ids", ids: ["m1"] }, deltaDays: -5, reason: "pull ahead" };

    const resolved = resolveBulkShiftOps(milestones, [], [op]);

    const byField = new Map(resolved.patchOps.map((o) => [o.field, o]));
    expect(byField.get("date")?.newValue).toBe("2025-12-27");
    expect(byField.get("endDate")?.newValue).toBe("2026-01-10");
  });

  it("resolves an ids selector mixing milestone and top-level-item ids", () => {
    const milestones: Milestone[] = [milestone({ id: "m1", laneId: "lane-a", date: "2026-01-01" })];
    const topLevelItems: TopLevelItem[] = [{ id: "t1", type: "milestone", title: "GA", date: "2026-02-01", status: "not-started" }];
    const op: BulkShiftOp = { selector: { kind: "ids", ids: ["m1", "t1"] }, deltaDays: 1, reason: "nudge both" };

    const resolved = resolveBulkShiftOps(milestones, topLevelItems, [op]);

    expect(resolved.patchOps).toHaveLength(1);
    expect(resolved.patchOps[0].newValue).toBe("2026-01-02");
    expect(resolved.topLevelItemOps).toHaveLength(1);
    expect(resolved.topLevelItemOps[0].newValue).toBe("2026-02-02");
  });

  it("silently skips an id that resolves to nothing (stale proposal), instead of throwing", () => {
    const milestones: Milestone[] = [milestone({ id: "m1", laneId: "lane-a", date: "2026-01-01" })];
    const op: BulkShiftOp = { selector: { kind: "ids", ids: ["m1", "ghost-id"] }, deltaDays: 1, reason: "nudge" };

    const resolved = resolveBulkShiftOps(milestones, [], [op]);

    expect(resolved.patchOps).toHaveLength(1);
  });

  describe("after selector", () => {
    const milestones: Milestone[] = [
      milestone({ id: "before", laneId: "lane-a", date: "2026-01-01" }),
      milestone({ id: "anchor", laneId: "lane-a", date: "2026-02-01" }),
      milestone({ id: "after-same-lane", laneId: "lane-a", date: "2026-03-01" }),
      milestone({ id: "after-other-lane", laneId: "lane-b", date: "2026-04-01" }),
    ];
    const topLevelItems: TopLevelItem[] = [
      { id: "band-before", type: "milestone", title: "Kickoff", date: "2026-01-15", status: "not-started" },
      { id: "band-after", type: "milestone", title: "GA", date: "2026-05-01", status: "not-started" },
    ];

    it("shifts the anchor and everything on/after its date, across lanes and the band, inclusive", () => {
      const op: BulkShiftOp = { selector: { kind: "after", afterId: "anchor" }, deltaDays: 5, reason: "external slip" };
      const resolved = resolveBulkShiftOps(milestones, topLevelItems, [op]);

      const shiftedMilestoneIds = new Set(resolved.patchOps.map((o) => o.targetId));
      expect(shiftedMilestoneIds.has("before")).toBe(false);
      expect(shiftedMilestoneIds.has("anchor")).toBe(true); // inclusive
      expect(shiftedMilestoneIds.has("after-same-lane")).toBe(true);
      expect(shiftedMilestoneIds.has("after-other-lane")).toBe(true); // not lane-scoped

      const shiftedTopLevelIds = new Set(resolved.topLevelItemOps.map((o) => o.targetId));
      expect(shiftedTopLevelIds.has("band-before")).toBe(false);
      expect(shiftedTopLevelIds.has("band-after")).toBe(true);
    });

    it("resolves an anchor that is itself a top-level item", () => {
      const op: BulkShiftOp = { selector: { kind: "after", afterId: "band-before" }, deltaDays: 2, reason: "shift from band anchor" };
      const resolved = resolveBulkShiftOps(milestones, topLevelItems, [op]);

      // Cutoff is band-before's date (2026-01-15); "before" (2026-01-01) stays put, everything else shifts.
      const shiftedMilestoneIds = new Set(resolved.patchOps.map((o) => o.targetId));
      expect(shiftedMilestoneIds.has("before")).toBe(false);
      expect(shiftedMilestoneIds.has("anchor")).toBe(true);
      const shiftedTopLevelIds = new Set(resolved.topLevelItemOps.map((o) => o.targetId));
      expect(shiftedTopLevelIds.has("band-before")).toBe(true);
      expect(shiftedTopLevelIds.has("band-after")).toBe(true);
    });
  });
});

describe("bulk shift + applyCascade interaction", () => {
  it("cascades onto a dependent outside the bulk selection", () => {
    const milestones: Milestone[] = [
      milestone({ id: "predecessor", laneId: "lane-a", date: "2026-01-01" }),
      milestone({ id: "dependent", laneId: "lane-b", date: "2026-01-05", dependsOn: [{ id: "predecessor", showConnector: true }] }),
    ];
    const op: BulkShiftOp = { selector: { kind: "ids", ids: ["predecessor"] }, deltaDays: 10, reason: "external slip" };

    const resolved = resolveBulkShiftOps(milestones, [], [op]);
    const ops = applyCascade(milestones, resolved.patchOps);

    const byId = new Map(ops.map((o) => [o.targetId, o]));
    expect(byId.get("predecessor")?.newValue).toBe("2026-01-11");
    // dependent (2026-01-05) now precedes predecessor's new date -> cascades to the day after.
    expect(byId.get("dependent")?.newValue).toBe("2026-01-12");
  });

  it("does not double-shift a dependent that is itself inside the bulk selection", () => {
    const milestones: Milestone[] = [
      milestone({ id: "predecessor", laneId: "lane-a", date: "2026-01-01" }),
      // Already safely after where predecessor will land — bulk-shifting
      // both by the same delta must not ALSO push this via cascade.
      milestone({ id: "dependent", laneId: "lane-a", date: "2026-02-01", dependsOn: [{ id: "predecessor", showConnector: true }] }),
    ];
    const op: BulkShiftOp = { selector: { kind: "lane", laneId: "lane-a" }, deltaDays: 10, reason: "shift whole lane" };

    const resolved = resolveBulkShiftOps(milestones, [], [op]);
    const ops = applyCascade(milestones, resolved.patchOps);

    const dateOpsForDependent = ops.filter((o) => o.targetId === "dependent" && o.field === "date");
    expect(dateOpsForDependent).toHaveLength(1);
    expect(dateOpsForDependent[0].newValue).toBe("2026-02-11");
    expect(dateOpsForDependent[0].reason).not.toContain("cascaded");
  });
});
