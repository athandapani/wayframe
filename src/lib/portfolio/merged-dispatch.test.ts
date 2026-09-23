import { describe, expect, it, vi } from "vitest";
import type { Program } from "@/components/timeline/types";
import type { UseCorrectionBoxResult } from "@/components/correction-box/use-correction-box";
import { buildMergedCanvasHandlers, routeMergedId } from "./merged-dispatch";
import { namespaceId, programBandId } from "./merge-programs";

function baseProgram(id: string, overrides: Partial<Program> = {}): Program {
  return {
    id,
    portfolioId: "portfolio-1",
    order: 0,
    programName: id,
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "o",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

/** Minimal `UseCorrectionBoxResult` double — only the members this module actually reaches for are real; the rest of the interface is stubbed away by the cast, same idiom as cross-program-move.test.ts's own double. */
function makeBoxDouble(data: Program) {
  return {
    data,
    setMilestoneDate: vi.fn(),
    setMilestoneDateRange: vi.fn(),
    setSwimlaneGroupCollapsed: vi.fn(),
  } as unknown as UseCorrectionBoxResult & {
    setMilestoneDate: ReturnType<typeof vi.fn>;
    setMilestoneDateRange: ReturnType<typeof vi.fn>;
    setSwimlaneGroupCollapsed: ReturnType<typeof vi.fn>;
  };
}

function registry(boxes: Record<string, ReturnType<typeof makeBoxDouble>>) {
  return (programId: string) => boxes[programId];
}

describe("routeMergedId", () => {
  it("splits a merged id back to its Program's own box and local id", () => {
    const p1 = makeBoxDouble(baseProgram("p1"));
    const routed = routeMergedId(namespaceId("p1", "m1"), registry({ p1 }));
    expect(routed).toMatchObject({ programId: "p1", localId: "m1" });
    expect(routed?.box).toBe(p1);
  });

  it("returns null rather than throwing for an id whose Program has no connected box", () => {
    expect(routeMergedId(namespaceId("gone", "m1"), registry({}))).toBeNull();
  });

  it("returns null for an id that was never namespaced at all", () => {
    expect(routeMergedId("m1", registry({ p1: makeBoxDouble(baseProgram("p1")) }))).toBeNull();
  });
});

describe("buildMergedCanvasHandlers", () => {
  it("routes a date drag to the owning Program's box with its local id", () => {
    const p1 = makeBoxDouble(baseProgram("p1"));
    const handlers = buildMergedCanvasHandlers(registry({ p1 }), vi.fn());
    handlers.onMilestoneDateChange(namespaceId("p1", "m1"), "2026-03-01");
    expect(p1.setMilestoneDate).toHaveBeenCalledWith("m1", "2026-03-01");
  });

  it("toggles a REAL group's collapse through its Program's box, flipping the document's own current value", () => {
    const p1 = makeBoxDouble(baseProgram("p1", { swimlaneGroups: [{ id: "g1", order: 0, name: "G", collapsed: true }] }));
    const onToggleProgramBand = vi.fn();
    const handlers = buildMergedCanvasHandlers(registry({ p1 }), onToggleProgramBand);

    handlers.onToggleGroupCollapsed(namespaceId("p1", "g1"));

    expect(p1.setSwimlaneGroupCollapsed).toHaveBeenCalledWith("g1", false);
    expect(onToggleProgramBand).not.toHaveBeenCalled();
  });

  it("hands a Program BAND's collapse back to the caller — it is synthetic, with no field in any Program's doc to write", () => {
    const p1 = makeBoxDouble(baseProgram("p1"));
    const onToggleProgramBand = vi.fn();
    const handlers = buildMergedCanvasHandlers(registry({ p1 }), onToggleProgramBand);

    handlers.onToggleGroupCollapsed(programBandId("p1"));

    expect(onToggleProgramBand).toHaveBeenCalledWith("p1");
    expect(p1.setSwimlaneGroupCollapsed).not.toHaveBeenCalled();
  });

  it("no-ops on an id from a Program with no connected box", () => {
    const handlers = buildMergedCanvasHandlers(registry({}), vi.fn());
    expect(() => handlers.onMilestoneDateChange(namespaceId("gone", "m1"), "2026-03-01")).not.toThrow();
  });
});
