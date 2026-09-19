import { describe, expect, it } from "vitest";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";
import { computeDomain } from "@/components/timeline/RoadmapTimeline";
import { defaultTheme } from "@/components/timeline/theme";
import type { GeometricShape, TextShape, ConnectorShape } from "./deck-ir";
import { validateShape } from "./deck-ir";
import { buildExecutiveSlideIR, buildSlideIR } from "./renderable-to-slide";

function baseInput(overrides: Partial<Parameters<typeof buildSlideIR>[0]> = {}) {
  return {
    renderable: sampleRoadmap,
    theme: defaultTheme,
    domain: computeDomain(sampleRoadmap),
    legendCategoryFillEnabled: false,
    ...overrides,
  };
}

describe("buildSlideIR", () => {
  it("every emitted shape passes validateShape", () => {
    const slide = buildSlideIR(baseInput());
    expect(slide.length).toBeGreaterThan(0);
    for (const shape of slide) expect(() => validateShape(shape)).not.toThrow();
  });

  it("emits a lane background rect + name text for each visible lane", () => {
    const slide = buildSlideIR(baseInput());
    const laneNames = slide.filter((s): s is TextShape => s.kind === "text").map((t) => t.runs[0]?.text);
    expect(laneNames).toEqual(expect.arrayContaining(["Lane A", "Lane B"]));
    const laneBgRects = slide.filter((s) => s.id.startsWith("lane-bg-"));
    expect(laneBgRects).toHaveLength(2);
  });

  it("a hidden lane emits no lane background or its milestones", () => {
    const hiddenRoadmap = {
      ...sampleRoadmap,
      swimlanes: sampleRoadmap.swimlanes.map((sl) => (sl.id === "lane-b" ? { ...sl, hidden: true } : sl)),
    };
    const slide = buildSlideIR(baseInput({ renderable: hiddenRoadmap }));
    const laneBgRects = slide.filter((s) => s.id.startsWith("lane-bg-"));
    expect(laneBgRects).toHaveLength(1);
    const milestoneMarkers = slide.filter((s) => s.id.startsWith("milestone-"));
    // m2 lives in lane-b (now hidden); only m1 (lane-a) should remain.
    expect(milestoneMarkers).toHaveLength(1);
  });

  it("a point milestone's marker shape/scale reflects a styleOverride", () => {
    const overridden = {
      ...sampleRoadmap,
      milestones: sampleRoadmap.milestones.map((m) => (m.id === "m1" ? { ...m, styleOverride: { markerShape: "star" as const, markerScale: 2 } } : m)),
    };
    const slide = buildSlideIR(baseInput({ renderable: overridden }));
    const starShapes = slide.filter((s): s is GeometricShape => s.kind === "star");
    expect(starShapes).toHaveLength(1);
    // Default marker radius (0.11in) * scale 2 * 2 (diameter) — bigger than an unscaled diamond's 0.22in width.
    expect(starShapes[0].w).toBeGreaterThan(0.3);
  });

  it("an item with styleOverride.hidden is omitted entirely", () => {
    const hidden = {
      ...sampleRoadmap,
      milestones: sampleRoadmap.milestones.map((m) => (m.id === "m1" ? { ...m, styleOverride: { hidden: true } } : m)),
    };
    const slide = buildSlideIR(baseInput({ renderable: hidden }));
    const m1Labels = slide.filter((s) => s.kind === "text" && (s as TextShape).runs[0]?.text === "First milestone");
    expect(m1Labels).toHaveLength(0);
  });

  it("omits a dependsOn connector whose showConnector is false", () => {
    const noConnector = {
      ...sampleRoadmap,
      milestones: sampleRoadmap.milestones.map((m) => (m.id === "m2" ? { ...m, dependsOn: [{ id: "m1", showConnector: false }] } : m)),
    };
    const slide = buildSlideIR(baseInput({ renderable: noConnector }));
    expect(slide.filter((s) => s.kind === "connector")).toHaveLength(0);
  });

  it("emits a straight connector when showConnector is true (the sample fixture's m1->m2 edge)", () => {
    const slide = buildSlideIR(baseInput());
    const connectors = slide.filter((s): s is ConnectorShape => s.kind === "connector");
    expect(connectors).toHaveLength(1);
    expect(connectors[0].style).toBe("straight");
  });

  it("two overlapping duration-pill milestones with explicit laneRows land at different sub-row y's", () => {
    const pillRoadmap = {
      ...sampleRoadmap,
      milestones: [
        { id: "p1", laneId: "lane-a", title: "Pill 1", date: "2026-01-01", endDate: "2026-02-01", status: "on-track" as const, dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false, laneRow: 1 },
        { id: "p2", laneId: "lane-a", title: "Pill 2", date: "2026-01-01", endDate: "2026-02-01", status: "on-track" as const, dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false, laneRow: 2 },
      ],
    };
    const slide = buildSlideIR(baseInput({ renderable: pillRoadmap }));
    const pills = slide.filter((s): s is GeometricShape => s.kind === "rect" && s.id.startsWith("pill-") && !s.id.startsWith("pill-label-"));
    expect(pills).toHaveLength(2);
    expect(pills[0].y).not.toBeCloseTo(pills[1].y, 3);
  });

  it("strips HTML tags from the BLUF statement", () => {
    const htmlBluf = { ...sampleRoadmap, bluf: { statement: "<p>Bold <b>plan</b> &amp; timeline</p>", bullets: [] } };
    const slide = buildSlideIR(baseInput({ renderable: htmlBluf }));
    const bluf = slide.find((s) => s.id.startsWith("bluf-")) as TextShape | undefined;
    expect(bluf).toBeDefined();
    expect(bluf!.runs[0].text).toBe("Bold plan & timeline");
  });

  it("a hidden TopLevelItem phase/milestone is omitted from the slide (regression: styleOverride.hidden was never checked for the PROGRAM band)", () => {
    const hidden = {
      ...sampleRoadmap,
      topLevelItems: sampleRoadmap.topLevelItems.map((t) => (t.id === "top-1" || t.id === "top-2" ? { ...t, styleOverride: { hidden: true } } : t)),
    };
    const slide = buildSlideIR(baseInput({ renderable: hidden }));
    expect(slide.some((s) => s.id.startsWith("phase-"))).toBe(false);
    expect(slide.some((s) => s.id.startsWith("top-milestone-"))).toBe(false);
  });

  it("a TopLevelItem phase's styleOverride.color wins outright over its status color (wayframe UX-2026-09-18 §2)", () => {
    const colored = {
      ...sampleRoadmap,
      topLevelItems: sampleRoadmap.topLevelItems.map((t) => (t.id === "top-1" ? { ...t, styleOverride: { color: "#ff00ff" } } : t)),
    };
    const slide = buildSlideIR(baseInput({ renderable: colored }));
    const phase = slide.find((s) => s.id.startsWith("phase-")) as GeometricShape | undefined;
    expect(phase).toBeDefined();
    expect(phase!.fill).toBe("#ff00ff");
  });

  it("a TopLevelItem milestone's styleOverride.color wins outright over its status color (wayframe UX-2026-09-18 §2)", () => {
    const colored = {
      ...sampleRoadmap,
      topLevelItems: sampleRoadmap.topLevelItems.map((t) => (t.id === "top-2" ? { ...t, styleOverride: { color: "#00ffcc" } } : t)),
    };
    const slide = buildSlideIR(baseInput({ renderable: colored }));
    const marker = slide.find((s) => s.id.startsWith("top-milestone-")) as GeometricShape | undefined;
    expect(marker).toBeDefined();
    expect(marker!.fill).toBe("#00ffcc");
  });
});

describe("buildExecutiveSlideIR", () => {
  it("emits a title, narrative, and one chip per key date — every shape validates", () => {
    const slide = buildExecutiveSlideIR({
      renderable: sampleRoadmap,
      theme: defaultTheme,
      summary: {
        generatedAt: "2026-08-01T00:00:00.000Z",
        narrative: "On track overall.",
        keyDates: [{ id: "m1", label: "First", fullLabel: "First milestone", date: "2026-01-10", rag: "green", onCriticalPath: true }],
      },
    });
    for (const shape of slide) expect(() => validateShape(shape)).not.toThrow();
    expect(slide.some((s) => s.id.startsWith("exec-narrative-"))).toBe(true);
    expect(slide.filter((s) => s.id.startsWith("chip-") && !s.id.startsWith("chip-label-"))).toHaveLength(1);
  });

  it("handles a null summary gracefully", () => {
    const slide = buildExecutiveSlideIR({ renderable: sampleRoadmap, theme: defaultTheme, summary: null });
    for (const shape of slide) expect(() => validateShape(shape)).not.toThrow();
  });
});
