import { describe, expect, it } from "vitest";
import type { Milestone } from "@/components/timeline/types";
import { buildMilestoneEditOps, milestoneToEditableFields } from "./build-milestone-ops";

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

describe("buildMilestoneEditOps", () => {
  it("emits no ops when the draft matches the original", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", title: "Kickoff" });
    const ops = buildMilestoneEditOps(m, milestoneToEditableFields(m));
    expect(ops).toEqual([]);
  });

  it("emits one op per changed field only", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", title: "Kickoff", percentComplete: 20 });
    const draft = { ...milestoneToEditableFields(m), title: "Kickoff Review", percentComplete: 50 };

    const ops = buildMilestoneEditOps(m, draft);
    expect(ops).toHaveLength(2);
    expect(ops).toContainEqual(expect.objectContaining({ field: "title", newValue: "Kickoff Review" }));
    expect(ops).toContainEqual(expect.objectContaining({ field: "percentComplete", newValue: 50 }));
  });

  it("emits an owner-clear op when the draft blanks out an optional field", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", owner: "A. Boyer" });
    const draft = { ...milestoneToEditableFields(m), owner: "" };

    const ops = buildMilestoneEditOps(m, draft);
    expect(ops).toEqual([{ targetId: "m1", field: "owner", newValue: "", reason: "manual edit" }]);
  });

  it("emits a showReferenceLine op when the checkbox is toggled (wayframe#48)", () => {
    const m = milestone({ id: "m1", date: "2026-01-01" });
    const draft = { ...milestoneToEditableFields(m), showReferenceLine: true };

    const ops = buildMilestoneEditOps(m, draft);
    expect(ops).toEqual([{ targetId: "m1", field: "showReferenceLine", newValue: true, reason: "manual edit" }]);
  });
});
