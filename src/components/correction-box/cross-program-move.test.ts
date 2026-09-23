import { describe, expect, it, vi } from "vitest";
import type { Milestone, Program } from "@/components/timeline/types";
import type { UseCorrectionBoxResult } from "./use-correction-box";
import { moveMilestoneBetweenPrograms, moveSwimlaneBetweenPrograms } from "./cross-program-move";

function milestone(id: string, laneId: string, overrides: Partial<Milestone> = {}): Milestone {
  return { id, laneId, title: id, date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, ...overrides };
}

function baseProgram(id: string, overrides: Partial<Program> = {}): Program {
  return {
    id,
    portfolioId: "portfolio-1",
    order: 0,
    programName: id,
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "o",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

/**
 * A minimal `UseCorrectionBoxResult` test double — only the six
 * cross-Program move actions (plus `data`) are ever read/called by
 * cross-program-move.ts itself; every other field is stubbed since the
 * interface requires them. `calls` is a single shared log across BOTH boxes
 * a test constructs, so dispatch ORDER between the two boxes (not just
 * within one) can be asserted.
 */
function makeBoxDouble(data: Program, calls: string[]) {
  return {
    data,
    setMilestoneLane: vi.fn((id: string, laneId: string) => calls.push(`setMilestoneLane(${id},${laneId})`)),
    receiveMovedMilestone: vi.fn((m: Milestone) => calls.push(`receiveMovedMilestone(${m.id})`)),
    receiveMovedSwimlane: vi.fn((s: { id: string }) => calls.push(`receiveMovedSwimlane(${s.id})`)),
    releaseMovedMilestone: vi.fn((id: string) => calls.push(`releaseMovedMilestone(${id})`)),
    releaseMovedSwimlane: vi.fn((id: string) => calls.push(`releaseMovedSwimlane(${id})`)),
    repointScenarioOverrides: vi.fn((idMap: Record<string, string>) =>
      calls.push(`repointScenarioOverrides(${Object.entries(idMap).map(([from, to]) => `${from}->${to}`).sort().join(",")})`),
    ),
    // Every other UseCorrectionBoxResult member is unused by the code under test.
  } as unknown as UseCorrectionBoxResult;
}

const ALLOWED = { sourceCanEdit: true, destCanEdit: true };

describe("moveMilestoneBetweenPrograms", () => {
  it("refuses the move (and dispatches to neither box) when the source side isn't editable", () => {
    const calls: string[] = [];
    const source = makeBoxDouble(baseProgram("p1", { milestones: [milestone("m1", "lane-a")] }), calls);
    const dest = makeBoxDouble(baseProgram("p2"), calls);

    const plan = moveMilestoneBetweenPrograms(source, dest, "m1", "lane-x", { sourceCanEdit: false, destCanEdit: true });
    expect(plan).toBeNull();
    expect(calls).toEqual([]);
  });

  it("refuses the move (and dispatches to neither box) when the destination side isn't editable", () => {
    const calls: string[] = [];
    const source = makeBoxDouble(baseProgram("p1", { milestones: [milestone("m1", "lane-a")] }), calls);
    const dest = makeBoxDouble(baseProgram("p2"), calls);

    const plan = moveMilestoneBetweenPrograms(source, dest, "m1", "lane-x", { sourceCanEdit: true, destCanEdit: false });
    expect(plan).toBeNull();
    expect(calls).toEqual([]);
  });

  it("delegates a same-Program call to setMilestoneLane — no clone, no re-id", () => {
    const calls: string[] = [];
    const program = baseProgram("p1", { milestones: [milestone("m1", "lane-a")] });
    const source = makeBoxDouble(program, calls);
    const dest = makeBoxDouble(program, calls); // same Program object, same id

    const plan = moveMilestoneBetweenPrograms(source, dest, "m1", "lane-b", ALLOWED);
    expect(plan).toBeNull();
    expect(calls).toEqual(["setMilestoneLane(m1,lane-b)"]);
    expect(source.receiveMovedMilestone).not.toHaveBeenCalled();
    expect(source.releaseMovedMilestone).not.toHaveBeenCalled();
  });

  it("is a no-op for a same-Program call when the milestone id doesn't resolve", () => {
    const calls: string[] = [];
    const program = baseProgram("p1", { milestones: [] });
    const source = makeBoxDouble(program, calls);
    const dest = makeBoxDouble(program, calls);

    const plan = moveMilestoneBetweenPrograms(source, dest, "nope", "lane-b", ALLOWED);
    expect(plan).toBeNull();
    expect(calls).toEqual([]);
  });

  it("dispatches the destination insert BEFORE the source release, and returns the plan", () => {
    const calls: string[] = [];
    const source = makeBoxDouble(baseProgram("p1", { milestones: [milestone("m1", "lane-a")] }), calls);
    const dest = makeBoxDouble(baseProgram("p2", { swimlanes: [{ id: "lane-x", order: 0, type: "lane", name: "X" }] }), calls);

    const plan = moveMilestoneBetweenPrograms(source, dest, "m1", "lane-x", ALLOWED);
    expect(plan).not.toBeNull();
    expect(plan!.clonedMilestone.laneId).toBe("lane-x");
    expect(calls[0]).toMatch(/^receiveMovedMilestone\(/);
    expect(calls[1]).toBe("releaseMovedMilestone(m1)");
    expect(calls).toHaveLength(4); // ...then the Portfolio-side re-point on both boxes (#131)
  });

  it("re-points the moved milestone's Scenario overrides on BOTH boxes, after both Program halves (#131)", () => {
    const calls: string[] = [];
    const source = makeBoxDouble(baseProgram("p1", { milestones: [milestone("m1", "lane-a")] }), calls);
    const dest = makeBoxDouble(baseProgram("p2", { swimlanes: [{ id: "lane-x", order: 0, type: "lane", name: "X" }] }), calls);

    const plan = moveMilestoneBetweenPrograms(source, dest, "m1", "lane-x", ALLOWED);
    const idMap = { m1: plan!.clonedMilestone.id };
    expect(source.repointScenarioOverrides).toHaveBeenCalledWith(idMap);
    expect(dest.repointScenarioOverrides).toHaveBeenCalledWith(idMap);
    // Last two, so the insert-before-release window this primitive guarantees
    // is exactly as narrow as it was before #131 added a third dispatch pair.
    expect(calls.slice(2)).toEqual([`repointScenarioOverrides(m1->${plan!.clonedMilestone.id})`, `repointScenarioOverrides(m1->${plan!.clonedMilestone.id})`]);
  });

  it("re-points nothing on a same-Program lane reassignment — no re-id happened", () => {
    const calls: string[] = [];
    const program = baseProgram("p1", { milestones: [milestone("m1", "lane-a")] });
    const source = makeBoxDouble(program, calls);
    const dest = makeBoxDouble(program, calls);

    moveMilestoneBetweenPrograms(source, dest, "m1", "lane-b", ALLOWED);
    expect(source.repointScenarioOverrides).not.toHaveBeenCalled();
    expect(dest.repointScenarioOverrides).not.toHaveBeenCalled();
  });
});

describe("moveSwimlaneBetweenPrograms", () => {
  it("refuses the move when either side isn't editable", () => {
    const calls: string[] = [];
    const source = makeBoxDouble(baseProgram("p1", { swimlanes: [{ id: "lane-a", order: 0, type: "lane", name: "A" }] }), calls);
    const dest = makeBoxDouble(baseProgram("p2"), calls);

    expect(moveSwimlaneBetweenPrograms(source, dest, "lane-a", { sourceCanEdit: false, destCanEdit: true })).toBeNull();
    expect(moveSwimlaneBetweenPrograms(source, dest, "lane-a", { sourceCanEdit: true, destCanEdit: false })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("returns null for a same-Program call without dispatching anything", () => {
    const calls: string[] = [];
    const program = baseProgram("p1", { swimlanes: [{ id: "lane-a", order: 0, type: "lane", name: "A" }] });
    const source = makeBoxDouble(program, calls);
    const dest = makeBoxDouble(program, calls);

    expect(moveSwimlaneBetweenPrograms(source, dest, "lane-a", ALLOWED)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("dispatches the destination insert BEFORE the source release, and returns the plan", () => {
    const calls: string[] = [];
    const source = makeBoxDouble(
      baseProgram("p1", {
        swimlanes: [{ id: "lane-a", order: 0, type: "lane", name: "A" }],
        milestones: [milestone("m1", "lane-a"), milestone("m2", "lane-a", { dependsOn: [{ id: "m1", showConnector: true }] })],
      }),
      calls,
    );
    const dest = makeBoxDouble(baseProgram("p2"), calls);

    const plan = moveSwimlaneBetweenPrograms(source, dest, "lane-a", ALLOWED);
    expect(plan).not.toBeNull();
    expect(plan!.clonedMilestones).toHaveLength(2);
    expect(calls[0]).toMatch(/^receiveMovedSwimlane\(/);
    expect(calls[1]).toBe("releaseMovedSwimlane(lane-a)");
    expect(calls).toHaveLength(4); // ...then the Portfolio-side re-point on both boxes (#131)
  });

  it("re-points Scenario overrides with the whole lane's idMap, on both boxes (#131)", () => {
    const calls: string[] = [];
    const source = makeBoxDouble(
      baseProgram("p1", {
        swimlanes: [{ id: "lane-a", order: 0, type: "lane", name: "A" }],
        milestones: [milestone("m1", "lane-a"), milestone("m2", "lane-a")],
      }),
      calls,
    );
    const dest = makeBoxDouble(baseProgram("p2"), calls);

    const plan = moveSwimlaneBetweenPrograms(source, dest, "lane-a", ALLOWED);
    expect(source.repointScenarioOverrides).toHaveBeenCalledWith(plan!.idMap);
    expect(dest.repointScenarioOverrides).toHaveBeenCalledWith(plan!.idMap);
    // Every milestone the lane owned, plus the lane itself — the map is passed
    // through verbatim rather than filtered down to milestone ids.
    expect(Object.keys(plan!.idMap).sort()).toEqual(["lane-a", "m1", "m2"]);
  });
});
