import { describe, expect, it } from "vitest";
import type { LegendCategory, Milestone, Program, Status, StyleOverride } from "./types";
import { blueprintTheme } from "./theme";
import {
  resolveDateLabelPosition,
  resolveFontScale,
  resolveHidden,
  resolveMarkerColor,
  resolveMarkerScale,
  resolveMarkerShape,
  resolvePhaseShape,
  resolvePhaseSize,
  resolveTitleLabelPosition,
} from "./style-resolution";

const theme = blueprintTheme;

function milestone(overrides: Partial<Milestone> & Pick<Milestone, "id" | "date"> = { id: "m1", date: "2026-01-01" }): Milestone {
  return {
    laneId: "lane-1",
    title: overrides.id,
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    ...overrides,
  };
}

function program(overrides: Partial<Program> = {}): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test Program",
    generatedAt: "2026-01-01T00:00:00.000Z",
    owner: "owner",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

const category: LegendCategory = { id: "cat-1", name: "Regulatory", color: "#ff00ff" };

describe("resolveMarkerShape", () => {
  it("item override wins over everything", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", styleOverride: { markerShape: "star" } });
    const p = program({ styleDefaults: { markerShape: "circle" } });
    expect(resolveMarkerShape(m, p, theme)).toBe("star");
  });
  it("Program default wins when no item override", () => {
    const m = milestone();
    const p = program({ styleDefaults: { markerShape: "circle" } });
    expect(resolveMarkerShape(m, p, theme)).toBe("circle");
  });
  it("falls back to the Theme default when neither is set", () => {
    expect(resolveMarkerShape(milestone(), program(), theme)).toBe("diamond");
  });
});

describe("resolveMarkerScale", () => {
  it("item override wins", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", styleOverride: { markerScale: 1.5 } });
    expect(resolveMarkerScale(m, program({ styleDefaults: { markerScale: 2 } }), theme)).toBe(1.5);
  });
  it("Program default wins over Theme", () => {
    expect(resolveMarkerScale(milestone(), program({ styleDefaults: { markerScale: 2 } }), theme)).toBe(2);
  });
  it("Theme default as final fallback", () => {
    expect(resolveMarkerScale(milestone(), program(), theme)).toBe(1);
  });
});

describe("resolveFontScale", () => {
  it("item override wins", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", styleOverride: { fontScale: 1.3 } });
    expect(resolveFontScale(m, program({ styleDefaults: { fontScale: 0.8 } }))).toBe(1.3);
  });
  it("Program default wins when no item override", () => {
    expect(resolveFontScale(milestone(), program({ styleDefaults: { fontScale: 0.8 } }))).toBe(0.8);
  });
  it("falls back to 1 (a pure multiplier identity, composes with the caller's own global font-scale)", () => {
    expect(resolveFontScale(milestone(), program())).toBe(1);
  });
});

describe("resolveHidden", () => {
  it("item override wins", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", styleOverride: { hidden: false } });
    expect(resolveHidden(m, program({ styleDefaults: { hidden: true } }))).toBe(false);
  });
  it("Program default wins when no item override", () => {
    expect(resolveHidden(milestone(), program({ styleDefaults: { hidden: true } }))).toBe(true);
  });
  it("falls back to false", () => {
    expect(resolveHidden(milestone(), program())).toBe(false);
  });
});

describe("resolvePhaseShape / resolvePhaseSize", () => {
  it("phaseShape: item override > Program default > Theme default", () => {
    const withOverride = { styleOverride: { phaseShape: "rectangle" } as StyleOverride };
    expect(resolvePhaseShape(withOverride, program({ styleDefaults: { phaseShape: "pill" } }), theme)).toBe("rectangle");
    expect(resolvePhaseShape({}, program({ styleDefaults: { phaseShape: "rectangle" } }), theme)).toBe("rectangle");
    expect(resolvePhaseShape({}, program(), theme)).toBe("pill");
  });
  it("phaseSize: item override > Program default > Theme default", () => {
    const withOverride = { styleOverride: { phaseSize: "tall" } as StyleOverride };
    expect(resolvePhaseSize(withOverride, program({ styleDefaults: { phaseSize: "lean" } }), theme)).toBe("tall");
    expect(resolvePhaseSize({}, program({ styleDefaults: { phaseSize: "lean" } }), theme)).toBe("lean");
    expect(resolvePhaseSize({}, program(), theme)).toBe("normal");
  });
});

describe("resolveTitleLabelPosition / resolveDateLabelPosition", () => {
  it("item-override-only ladder: returns the override when set", () => {
    const item = { styleOverride: { titleLabelPosition: "top", dateLabelPosition: "right" } as StyleOverride };
    expect(resolveTitleLabelPosition(item)).toBe("top");
    expect(resolveDateLabelPosition(item)).toBe("right");
  });
  it("returns undefined (meaning: leave existing tiered layout alone) when unset — no Program/Theme rung", () => {
    expect(resolveTitleLabelPosition({})).toBeUndefined();
    expect(resolveDateLabelPosition({})).toBeUndefined();
  });
});

/**
 * Regression suite: resolveMarkerColor must be byte-identical to the old
 * 2-rung `resolveMarkerPaint` (formerly RoadmapTimeline.tsx:305-315)
 * whenever no styleOverride/styleDefaults color is set. Expected values
 * below are transcribed directly from that function's own logic.
 */
describe("resolveMarkerColor — regression parity with the old resolveMarkerPaint", () => {
  const statuses: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];

  function oldResolveMarkerPaint(m: Milestone, cat?: LegendCategory) {
    const notStarted = m.status === "not-started";
    if (cat) {
      return { fill: notStarted ? theme.ground : cat.color, stroke: theme.statusColor[m.status], strokeWidth: 1.75 };
    }
    return {
      fill: notStarted ? theme.ground : theme.statusColor[m.status],
      stroke: notStarted ? theme.statusColor[m.status] : theme.markerHalo,
      strokeWidth: notStarted ? 1.75 : 1.5,
    };
  }

  for (const status of statuses) {
    it(`matches for status=${status}, no category`, () => {
      const m = milestone({ id: "m1", date: "2026-01-01", status });
      expect(resolveMarkerColor(m, theme, program())).toEqual(oldResolveMarkerPaint(m));
    });
    it(`matches for status=${status}, with category`, () => {
      const m = milestone({ id: "m1", date: "2026-01-01", status });
      expect(resolveMarkerColor(m, theme, program(), category)).toEqual(oldResolveMarkerPaint(m, category));
    });
  }
});

describe("resolveMarkerColor — new ladder rungs", () => {
  it("a raw item color override wins outright, full stop, with a plain halo stroke (no hollow-fill reinterpretation, even when not-started)", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", status: "not-started", styleOverride: { color: "#123456" } });
    expect(resolveMarkerColor(m, theme, program(), category)).toEqual({ fill: "#123456", stroke: theme.markerHalo, strokeWidth: 1.5 });
  });
  it("item override wins even over category", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", status: "on-track", styleOverride: { color: "#abcdef" } });
    expect(resolveMarkerColor(m, theme, program(), category).fill).toBe("#abcdef");
  });
  it("Program styleDefaults.color is a real rung, used when no item override and no category (or legend-fill is off)", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", status: "on-track" });
    const p = program({ styleDefaults: { color: "#00ff00" } });
    expect(resolveMarkerColor(m, theme, p)).toEqual({ fill: "#00ff00", stroke: theme.statusColor["on-track"], strokeWidth: 1.75 });
  });
  it("Program styleDefaults.color still applies the not-started hollow-fill treatment", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", status: "not-started" });
    const p = program({ styleDefaults: { color: "#00ff00" } });
    expect(resolveMarkerColor(m, theme, p)).toEqual({ fill: theme.ground, stroke: theme.statusColor["not-started"], strokeWidth: 1.75 });
  });
  it("category still wins over Program styleDefaults.color when both are present (identity-scoped color prefers the more specific category tag)", () => {
    const m = milestone({ id: "m1", date: "2026-01-01", status: "on-track" });
    const p = program({ styleDefaults: { color: "#00ff00" } });
    expect(resolveMarkerColor(m, theme, p, category).fill).toBe(category.color);
  });
});
