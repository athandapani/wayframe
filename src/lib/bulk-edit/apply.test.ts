import { describe, expect, it } from "vitest";
import { applyBulkPatchToProgram, bulkAcceptBaseline, buildBulkPatchPreview } from "./apply";
import type { Milestone, Program, TopLevelItem } from "@/components/timeline/types";

/**
 * One Program covering every entity shape this ticket's generalization
 * needs to distinguish:
 *   - pm1: a point Milestone (no endDate) — the "everything applies" case.
 *   - dm1: a duration-pill Milestone (endDate set) — only phaseShape/
 *     phaseSize/status/laneId/laneRow/date/endDate apply; every other
 *     styleOverride field is a documented no-op (see ./types.ts's doc).
 *   - tm1: a TopLevelItem "milestone" — status/date/fontScale/hidden/
 *     markerShape/markerScale/titleLabelPosition apply; color/
 *     dateLabelPosition/phaseShape/phaseSize/laneId/laneRow don't.
 *   - tp1: a TopLevelItem "phase" — status/date(startDate)/endDate/
 *     fontScale/hidden/phaseShape/phaseSize apply; everything marker/
 *     label-position/color/laneId/laneRow-shaped doesn't.
 *   - ta1: a TopLevelItem "annotation" — nothing in this module applies to
 *     it at all (no status/styleOverride field on the type).
 */
function baseProgram(): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test Program",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [
      { id: "lane-1", order: 0, type: "lane", name: "Lane A" },
      { id: "lane-2", order: 1, type: "lane", name: "Lane B" },
    ],
    topLevelItems: [
      { id: "tm1", type: "milestone", title: "Top milestone", date: "2026-01-05", status: "not-started" },
      { id: "tp1", type: "phase", title: "Top phase", startDate: "2026-01-01", endDate: "2026-01-10", status: "not-started" },
      { id: "ta1", type: "annotation", title: "Note", date: "2026-01-02", message: "x" },
    ],
    milestones: [
      { id: "pm1", laneId: "lane-1", title: "Point milestone", date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null },
      { id: "dm1", laneId: "lane-1", title: "Duration pill", date: "2026-01-01", endDate: "2026-01-10", laneRow: 1, status: "not-started", dependsOn: [], linksToTopLevelMilestone: null },
    ],
  };
}

function milestoneById(program: Program, id: string): Milestone {
  return program.milestones.find((m) => m.id === id)!;
}

function topLevelById(program: Program, id: string): TopLevelItem {
  return program.topLevelItems.find((t) => t.id === id)!;
}

describe("applyBulkPatchToProgram — status", () => {
  it("applies to a point Milestone, a duration-pill Milestone, and both non-annotation TopLevelItem variants; skips the annotation", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "status", value: "complete" }, ids: ["pm1", "dm1", "tm1", "tp1", "ta1"] }], []);
    expect(milestoneById(next, "pm1").status).toBe("complete");
    expect(milestoneById(next, "dm1").status).toBe("complete");
    expect((topLevelById(next, "tm1") as Extract<TopLevelItem, { type: "milestone" }>).status).toBe("complete");
    expect((topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>).status).toBe("complete");
    expect(topLevelById(next, "ta1")).toEqual(baseProgram().topLevelItems.find((t) => t.id === "ta1")); // annotation untouched
  });
});

describe("applyBulkPatchToProgram — laneId / laneRow (Milestone-only)", () => {
  it("laneId reassigns a Milestone but silently skips a TopLevelItem id (no laneId field to reassign)", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "laneId", value: "lane-2" }, ids: ["pm1", "dm1", "tm1"] }], []);
    expect(milestoneById(next, "pm1").laneId).toBe("lane-2");
    expect(milestoneById(next, "dm1").laneId).toBe("lane-2");
    expect(topLevelById(next, "tm1")).toEqual(baseProgram().topLevelItems.find((t) => t.id === "tm1"));
  });

  it("laneRow only applies to a duration-pill Milestone — a point Milestone is silently skipped", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "laneRow", value: 3 }, ids: ["pm1", "dm1"] }], []);
    expect(milestoneById(next, "dm1").laneRow).toBe(3);
    expect(milestoneById(next, "pm1").laneRow).toBeUndefined();
  });
});

describe("applyBulkPatchToProgram — date (couples endDate, exactly mirroring resolveBulkShiftOps)", () => {
  it("shifts a point Milestone's date, a duration-pill Milestone's date+endDate together, a TopLevelItem-milestone's date, a TopLevelItem-phase's startDate+endDate together, and an annotation's date", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "date", deltaDays: 5 }, ids: ["pm1", "dm1", "tm1", "tp1", "ta1"] }], []);
    expect(milestoneById(next, "pm1").date).toBe("2026-01-06");
    expect(milestoneById(next, "dm1").date).toBe("2026-01-06");
    expect(milestoneById(next, "dm1").endDate).toBe("2026-01-15");
    expect((topLevelById(next, "tm1") as Extract<TopLevelItem, { type: "milestone" }>).date).toBe("2026-01-10");
    const phase = topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>;
    expect(phase.startDate).toBe("2026-01-06");
    expect(phase.endDate).toBe("2026-01-15");
    expect((topLevelById(next, "ta1") as Extract<TopLevelItem, { type: "annotation" }>).date).toBe("2026-01-07");
  });

  it("cascades a dependent Milestone's date forward, reusing applyCascade exactly as every other date-op path does", () => {
    const program = baseProgram();
    program.milestones.push({
      id: "dep1",
      laneId: "lane-1",
      title: "Depends on pm1",
      date: "2026-01-02",
      status: "not-started",
      dependsOn: [{ id: "pm1", showConnector: true }],
      linksToTopLevelMilestone: null,
    });
    const next = applyBulkPatchToProgram(program, [{ op: { field: "date", deltaDays: 10 }, ids: ["pm1"] }], []);
    expect(milestoneById(next, "pm1").date).toBe("2026-01-11");
    // dep1 would now start before its predecessor — cascade pushes it to predecessor+1
    expect(milestoneById(next, "dep1").date).toBe("2026-01-12");
  });
});

describe("applyBulkPatchToProgram — endDate (independent end-edge resize, NOT coupled to date)", () => {
  it("resizes a duration-pill Milestone's endDate and a TopLevelItem-phase's endDate without moving the start", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "endDate", deltaDays: 3 }, ids: ["pm1", "dm1", "tm1", "tp1", "ta1"] }], []);
    expect(milestoneById(next, "dm1").date).toBe("2026-01-01"); // start untouched
    expect(milestoneById(next, "dm1").endDate).toBe("2026-01-13");
    const phase = topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>;
    expect(phase.startDate).toBe("2026-01-01"); // start untouched
    expect(phase.endDate).toBe("2026-01-13");
    // No endDate concept on these — silently skipped, no throw, no change.
    expect(milestoneById(next, "pm1")).toEqual(baseProgram().milestones.find((m) => m.id === "pm1"));
    expect(topLevelById(next, "tm1")).toEqual(baseProgram().topLevelItems.find((t) => t.id === "tm1"));
  });
});

describe("applyBulkPatchToProgram — styleOverride.* applicability (this ticket's own load-bearing research)", () => {
  it("markerShape/markerScale: point Milestone + TopLevelItem-milestone only — duration pill and phase are silent no-ops", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "styleOverride.markerShape", value: "star" }, ids: ["pm1", "dm1", "tm1", "tp1"] }], []);
    expect(milestoneById(next, "pm1").styleOverride?.markerShape).toBe("star");
    expect(milestoneById(next, "dm1").styleOverride).toBeUndefined();
    expect((topLevelById(next, "tm1") as Extract<TopLevelItem, { type: "milestone" }>).styleOverride?.markerShape).toBe("star");
    expect((topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>).styleOverride).toBeUndefined();
  });

  it("color: point Milestone ONLY — never a duration pill, never either TopLevelItem variant", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "styleOverride.color", value: "#ff0000" }, ids: ["pm1", "dm1", "tm1", "tp1"] }], []);
    expect(milestoneById(next, "pm1").styleOverride?.color).toBe("#ff0000");
    expect(milestoneById(next, "dm1").styleOverride).toBeUndefined();
    expect((topLevelById(next, "tm1") as Extract<TopLevelItem, { type: "milestone" }>).styleOverride).toBeUndefined();
    expect((topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>).styleOverride).toBeUndefined();
  });

  it("hidden/fontScale: point Milestone + both non-annotation TopLevelItem variants — never a duration pill", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "styleOverride.hidden", value: true }, ids: ["pm1", "dm1", "tm1", "tp1"] }], []);
    expect(milestoneById(next, "pm1").styleOverride?.hidden).toBe(true);
    expect(milestoneById(next, "dm1").styleOverride).toBeUndefined();
    expect((topLevelById(next, "tm1") as Extract<TopLevelItem, { type: "milestone" }>).styleOverride?.hidden).toBe(true);
    expect((topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>).styleOverride?.hidden).toBe(true);
  });

  it("titleLabelPosition: point Milestone + TopLevelItem-milestone only — never a phase (fixed label) or a duration pill", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "styleOverride.titleLabelPosition", value: "top" }, ids: ["pm1", "dm1", "tm1", "tp1"] }], []);
    expect(milestoneById(next, "pm1").styleOverride?.titleLabelPosition).toBe("top");
    expect(milestoneById(next, "dm1").styleOverride).toBeUndefined();
    expect((topLevelById(next, "tm1") as Extract<TopLevelItem, { type: "milestone" }>).styleOverride?.titleLabelPosition).toBe("top");
    expect((topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>).styleOverride).toBeUndefined();
  });

  it("dateLabelPosition: point Milestone ONLY — no render path ever shows a date label for a TopLevelItem or a duration pill", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "styleOverride.dateLabelPosition", value: "bottom" }, ids: ["pm1", "dm1", "tm1", "tp1"] }], []);
    expect(milestoneById(next, "pm1").styleOverride?.dateLabelPosition).toBe("bottom");
    expect(milestoneById(next, "dm1").styleOverride).toBeUndefined();
    expect((topLevelById(next, "tm1") as Extract<TopLevelItem, { type: "milestone" }>).styleOverride).toBeUndefined();
    expect((topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>).styleOverride).toBeUndefined();
  });

  it("phaseShape/phaseSize: duration-pill Milestone + TopLevelItem-phase only — never a point Milestone or TopLevelItem-milestone", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "styleOverride.phaseShape", value: "rectangle" }, ids: ["pm1", "dm1", "tm1", "tp1"] }], []);
    expect(milestoneById(next, "pm1").styleOverride).toBeUndefined();
    expect(milestoneById(next, "dm1").styleOverride?.phaseShape).toBe("rectangle");
    expect((topLevelById(next, "tm1") as Extract<TopLevelItem, { type: "milestone" }>).styleOverride).toBeUndefined();
    expect((topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>).styleOverride?.phaseShape).toBe("rectangle");
  });

  it("merges multiple styleOverride fields onto the same item without clobbering each other", () => {
    const program = baseProgram();
    const withShape = applyBulkPatchToProgram(program, [{ op: { field: "styleOverride.markerShape", value: "star" }, ids: ["pm1"] }], []);
    const withBoth = applyBulkPatchToProgram(withShape, [{ op: { field: "styleOverride.color", value: "#00ff00" }, ids: ["pm1"] }], []);
    expect(milestoneById(withBoth, "pm1").styleOverride).toEqual({ markerShape: "star", color: "#00ff00" });
  });
});

describe("applyBulkPatchToProgram — mixed selection where the field only applies to some ids", () => {
  it("skips ids the field doesn't apply to instead of throwing, applying only to the ones it does", () => {
    const program = baseProgram();
    expect(() => applyBulkPatchToProgram(program, [{ op: { field: "styleOverride.color", value: "#123456" }, ids: ["pm1", "dm1", "tm1", "tp1", "ta1"] }], [])).not.toThrow();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "styleOverride.color", value: "#123456" }, ids: ["pm1", "dm1", "tm1", "tp1", "ta1"] }], []);
    expect(milestoneById(next, "pm1").styleOverride?.color).toBe("#123456");
    expect(milestoneById(next, "dm1").styleOverride).toBeUndefined();
    expect((topLevelById(next, "tm1") as Extract<TopLevelItem, { type: "milestone" }>).styleOverride).toBeUndefined();
    expect((topLevelById(next, "tp1") as Extract<TopLevelItem, { type: "phase" }>).styleOverride).toBeUndefined();
    expect(topLevelById(next, "ta1")).toEqual(baseProgram().topLevelItems.find((t) => t.id === "ta1"));
  });

  it("silently ignores an unknown id in the batch", () => {
    const program = baseProgram();
    expect(() => applyBulkPatchToProgram(program, [{ op: { field: "status", value: "complete" }, ids: ["not-a-real-id"] }], [])).not.toThrow();
  });
});

describe("applyBulkPatchToProgram — delete (both entity types, outside the field-patch model)", () => {
  it("removes a Milestone id and a TopLevelItem id, leaving the rest untouched", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [], ["pm1", "tp1"]);
    expect(next.milestones.map((m) => m.id)).toEqual(["dm1"]);
    expect(next.topLevelItems.map((t) => t.id)).toEqual(["tm1", "ta1"]);
  });

  it("silently ignores an unknown delete id", () => {
    const program = baseProgram();
    expect(() => applyBulkPatchToProgram(program, [], ["not-a-real-id"])).not.toThrow();
    const next = applyBulkPatchToProgram(program, [], ["not-a-real-id"]);
    expect(next.milestones).toHaveLength(2);
    expect(next.topLevelItems).toHaveLength(3);
  });

  it("combines field patches and deletes in one call", () => {
    const program = baseProgram();
    const next = applyBulkPatchToProgram(program, [{ op: { field: "status", value: "complete" }, ids: ["dm1"] }], ["pm1"]);
    expect(next.milestones.map((m) => m.id)).toEqual(["dm1"]);
    expect(next.milestones[0].status).toBe("complete");
  });
});

describe("bulkAcceptBaseline — unchanged, stays outside the field-patch model", () => {
  it("only includes milestones that actually have a baseline to accept", () => {
    const program = baseProgram();
    program.milestones[0].originalDate = "2025-12-01";
    const ops = bulkAcceptBaseline(program.milestones, ["pm1", "dm1"]);
    expect(ops).toEqual([{ scope: "one", targetId: "pm1", reason: "bulk accept baseline" }]);
  });
});

describe("buildBulkPatchPreview", () => {
  it("skips an item already at the target status", () => {
    const program = baseProgram();
    program.milestones[0].status = "complete";
    const entries = buildBulkPatchPreview(program, [{ op: { field: "status", value: "complete" }, ids: ["pm1"] }], []);
    expect(entries).toHaveLength(0);
  });

  it("shows a laneId change as a before/after lane NAME pair, not raw ids", () => {
    const program = baseProgram();
    const entries = buildBulkPatchPreview(program, [{ op: { field: "laneId", value: "lane-2" }, ids: ["pm1"] }], []);
    expect(entries).toHaveLength(1);
    expect(entries[0].fieldChanges).toEqual([{ field: "Lane", before: "Lane A", after: "Lane B" }]);
    expect(entries[0].detail).toBe("Lane A"); // current lane, for context
  });

  it("shows a date shift as before/after ISO dates", () => {
    const program = baseProgram();
    const entries = buildBulkPatchPreview(program, [{ op: { field: "date", deltaDays: 5 }, ids: ["pm1"] }], []);
    expect(entries[0].fieldChanges).toEqual([{ field: "Date", before: "2026-01-01", after: "2026-01-06" }]);
  });

  it("omits a row entirely for an id the field doesn't apply to (mixed selection)", () => {
    const program = baseProgram();
    const entries = buildBulkPatchPreview(program, [{ op: { field: "styleOverride.color", value: "#fff" }, ids: ["pm1", "dm1", "tm1"] }], []);
    expect(entries.map((e) => e.id)).toEqual(["pm1"]);
  });

  it("emits a 'remove' kind entry per delete id", () => {
    const program = baseProgram();
    const entries = buildBulkPatchPreview(program, [], ["pm1", "tp1"]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === "remove")).toBe(true);
    expect(entries.map((e) => e.title).sort()).toEqual(["Point milestone", "Top phase"]);
  });
});
