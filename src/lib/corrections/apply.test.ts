import { describe, expect, it } from "vitest";
import type { Milestone } from "@/components/timeline/types";
import { applyOps } from "./apply";
import type { PatchOp } from "./schema";

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

describe("applyOps", () => {
  it("stamps originalDate the first time a milestone's date shifts", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01" })];
    const ops: PatchOp[] = [{ targetId: "m1", field: "date", newValue: "2026-01-08", reason: "shifted" }];

    const result = applyOps(milestones, ops);
    expect(result[0].date).toBe("2026-01-08");
    expect(result[0].originalDate).toBe("2026-01-01");
  });

  it("does not move the baseline on a second shift", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-08", originalDate: "2026-01-01" })];
    const ops: PatchOp[] = [{ targetId: "m1", field: "date", newValue: "2026-01-15", reason: "shifted again" }];

    const result = applyOps(milestones, ops);
    expect(result[0].date).toBe("2026-01-15");
    expect(result[0].originalDate).toBe("2026-01-01");
  });

  it("applies a status op without touching date fields", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01", status: "not-started" })];
    const ops: PatchOp[] = [{ targetId: "m1", field: "status", newValue: "complete", reason: "marked complete" }];

    const result = applyOps(milestones, ops);
    expect(result[0].status).toBe("complete");
    expect(result[0].date).toBe("2026-01-01");
    expect(result[0].originalDate).toBeUndefined();
  });

  it("leaves milestones with no matching op untouched", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01" }), milestone({ id: "m2", date: "2026-02-01" })];
    const ops: PatchOp[] = [{ targetId: "m1", field: "date", newValue: "2026-01-08", reason: "shifted" }];

    const result = applyOps(milestones, ops);
    expect(result[1]).toBe(milestones[1]);
  });

  it("applies every field a manual edit can touch (wayframe#18/#19) in one batch", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01", owner: "A. Boyer" })];
    const ops: PatchOp[] = [
      { targetId: "m1", field: "title", newValue: "New Title", reason: "manual edit" },
      { targetId: "m1", field: "percentComplete", newValue: 40, reason: "manual edit" },
      { targetId: "m1", field: "isCriticalPathOverride", newValue: true, reason: "manual edit" },
      { targetId: "m1", field: "shortLabel", newValue: "NT", reason: "manual edit" },
    ];

    const result = applyOps(milestones, ops);
    expect(result[0]).toMatchObject({ title: "New Title", percentComplete: 40, isCriticalPathOverride: true, shortLabel: "NT" });
  });

  it("clears an optional field (owner/comment/shortLabel) when the op's newValue is an empty string", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01", owner: "A. Boyer", comment: "note", shortLabel: "AB" })];
    const ops: PatchOp[] = [
      { targetId: "m1", field: "owner", newValue: "", reason: "cleared" },
      { targetId: "m1", field: "comment", newValue: "", reason: "cleared" },
      { targetId: "m1", field: "shortLabel", newValue: "", reason: "cleared" },
    ];

    const result = applyOps(milestones, ops);
    expect(result[0].owner).toBeUndefined();
    expect(result[0].comment).toBeUndefined();
    expect(result[0].shortLabel).toBeUndefined();
  });
});
