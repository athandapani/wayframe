import { describe, expect, it } from "vitest";
import type { Milestone } from "@/components/timeline/types";
import { applyCascade } from "./cascade";
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

// Same 2-hop chain #9's hand-driven prototype validated: mech-5 -> safety-4
// -> safety-5 -> launch-4, plus pilot-5/auto-6 also feeding launch-4.
const milestones: Milestone[] = [
  milestone({ id: "mech-5", date: "2026-09-25" }),
  milestone({ id: "auto-6", date: "2026-11-01" }),
  milestone({ id: "safety-4", date: "2026-10-20", dependsOn: [{ id: "mech-5", showConnector: true }] }),
  milestone({ id: "safety-5", date: "2026-12-15", dependsOn: [{ id: "safety-4", showConnector: true }] }),
  milestone({ id: "pilot-5", date: "2027-01-05" }),
  milestone({
    id: "launch-4",
    date: "2027-02-01",
    dependsOn: [
      { id: "safety-5", showConnector: true },
      { id: "pilot-5", showConnector: true },
      { id: "auto-6", showConnector: true },
    ],
  }),
];

describe("applyCascade", () => {
  it("cascades a date shift through a multi-hop dependency chain", () => {
    const directOps: PatchOp[] = [
      { targetId: "mech-5", field: "date", newValue: "2026-10-30", reason: "shifted by 5 days" },
    ];

    const ops = applyCascade(milestones, directOps);

    const byId = new Map(ops.map((op) => [op.targetId, op]));
    expect(byId.get("mech-5")?.newValue).toBe("2026-10-30");
    // safety-4 (2026-10-20) now precedes its predecessor's new date -> cascades to the day after.
    expect(byId.get("safety-4")?.newValue).toBe("2026-10-31");
    // safety-5 (2026-12-15) still safely after safety-4's cascaded date -> untouched.
    expect(byId.has("safety-5")).toBe(false);
    // launch-4 depends on safety-5 (untouched), pilot-5, auto-6 -> untouched.
    expect(byId.has("launch-4")).toBe(false);
  });

  it("cascades transitively all the way to a dependent three hops away", () => {
    const directOps: PatchOp[] = [
      { targetId: "mech-5", field: "date", newValue: "2027-03-01", reason: "shifted well past launch" },
    ];

    const ops = applyCascade(milestones, directOps);
    const byId = new Map(ops.map((op) => [op.targetId, op]));

    expect(byId.get("safety-4")?.newValue).toBe("2027-03-02");
    expect(byId.get("safety-5")?.newValue).toBe("2027-03-03");
    expect(byId.get("launch-4")?.newValue).toBe("2027-03-04");
    expect(byId.get("launch-4")?.reason).toContain("cascaded");
  });

  it("does not cascade a status-only op", () => {
    const directOps: PatchOp[] = [{ targetId: "mech-5", field: "status", newValue: "delayed", reason: "marked delayed" }];
    const ops = applyCascade(milestones, directOps);
    expect(ops).toEqual(directOps);
  });

  it("leaves an already-later dependent alone", () => {
    const directOps: PatchOp[] = [
      { targetId: "mech-5", field: "date", newValue: "2026-09-26", reason: "shifted by 1 day" },
    ];
    const ops = applyCascade(milestones, directOps);
    expect(ops).toHaveLength(1);
  });
});
