import { describe, expect, it } from "vitest";
import type { Program } from "@/components/timeline/types";
import { detectOrphanedEdits } from "./program-conflict";

function program(overrides: Partial<Pick<Program, "milestones" | "topLevelItems">>): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test Program",
    generatedAt: "2026-01-01T00:00:00.000Z",
    owner: "owner",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

describe("detectOrphanedEdits", () => {
  it("returns a conflict for a pending milestone edit whose id no longer exists in the merged program", () => {
    const merged = program({ milestones: [] });
    const conflicts = detectOrphanedEdits([{ id: "m1", kind: "milestone" }], merged);
    expect(conflicts).toEqual([
      { type: "orphaned", itemKind: "milestone", targetId: "m1", message: expect.stringContaining("milestone") },
    ]);
  });

  it("returns a conflict for a pending topLevelItem edit whose id no longer exists", () => {
    const merged = program({ topLevelItems: [] });
    const conflicts = detectOrphanedEdits([{ id: "t1", kind: "topLevelItem" }], merged);
    expect(conflicts).toEqual([{ type: "orphaned", itemKind: "topLevelItem", targetId: "t1", message: expect.any(String) }]);
  });

  it("returns [] when the pending edit's id is still present in the merged program", () => {
    const merged = program({
      milestones: [
        { id: "m1", laneId: "lane-1", title: "M1", date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null },
      ],
    });
    expect(detectOrphanedEdits([{ id: "m1", kind: "milestone" }], merged)).toEqual([]);
  });

  it("uses milestone-specific wording distinct from topLevelItem wording", () => {
    const merged = program({});
    const [milestoneConflict] = detectOrphanedEdits([{ id: "m1", kind: "milestone" }], merged);
    const [topLevelConflict] = detectOrphanedEdits([{ id: "t1", kind: "topLevelItem" }], merged);
    expect(milestoneConflict.message).not.toBe(topLevelConflict.message);
    expect(milestoneConflict.message.toLowerCase()).toContain("milestone");
  });

  it("handles multiple pending edits independently — some orphaned, some not", () => {
    const merged = program({
      milestones: [
        { id: "m-alive", laneId: "lane-1", title: "Alive", date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null },
      ],
      topLevelItems: [{ id: "t-alive", type: "annotation", title: "Alive", date: "2026-01-01", message: "" }],
    });
    const conflicts = detectOrphanedEdits(
      [
        { id: "m-alive", kind: "milestone" },
        { id: "m-gone", kind: "milestone" },
        { id: "t-alive", kind: "topLevelItem" },
        { id: "t-gone", kind: "topLevelItem" },
      ],
      merged,
    );
    expect(conflicts.map((c) => c.targetId).sort()).toEqual(["m-gone", "t-gone"]);
  });

  it("returns [] for an empty pendingEdits list", () => {
    expect(detectOrphanedEdits([], program({}))).toEqual([]);
  });
});
