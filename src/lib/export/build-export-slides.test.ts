import { describe, expect, it } from "vitest";
import type { Milestone, Portfolio, Program } from "@/components/timeline/types";
import { mergeForRender } from "@/components/timeline/types";
import { buildExportSlides, type ExportSelection } from "./build-export-slides";
import { setMilestoneOverride } from "@/lib/scenario/apply";
import { createScenario } from "@/lib/scenario/types";

function milestone(overrides: Partial<Milestone> & Pick<Milestone, "id" | "date">): Milestone {
  return {
    laneId: "lane-1",
    title: overrides.id,
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    ...overrides,
  };
}

function program(id: string, name: string, order: number, overrides: Partial<Pick<Program, "milestones">> = {}): Program {
  return {
    id,
    portfolioId: "portfolio-1",
    order,
    programName: name,
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

const portfolio: Portfolio = { id: "portfolio-1", schemaVersion: 2 };

function noSelection(): ExportSelection {
  return {
    executive: false,
    combinedBaseline: false,
    individualBaseline: false,
    individualBaselineProgramIds: new Set(),
    scenarioId: null,
    scenarioCombined: false,
    scenarioProgram: false,
    scenarioProgramProgramIds: new Set(),
  };
}

describe("buildExportSlides", () => {
  it("returns an empty deck when nothing is checked", () => {
    const p1 = program("p1", "Program One", 0);
    const renderable = mergeForRender(portfolio, p1);
    const slides = buildExportSlides({
      portfolio,
      currentRenderable: renderable,
      timelineSummary: null,
      allPrograms: [p1],
      scenario: null,
      selection: noSelection(),
    });
    expect(slides).toEqual([]);
  });

  it("produces exactly one Executive slide when only Executive is checked", () => {
    const p1 = program("p1", "Program One", 0);
    const renderable = mergeForRender(portfolio, p1);
    const slides = buildExportSlides({
      portfolio,
      currentRenderable: renderable,
      timelineSummary: null,
      allPrograms: [p1],
      scenario: null,
      selection: { ...noSelection(), executive: true },
    });
    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({ label: "Executive", mode: "executive", data: renderable });
  });

  it("orders slides Executive -> Combined(Baseline) -> Individual(Baseline) -> Combined(Scenario) -> Individual(Scenario), skipping unchecked sections", () => {
    const p1 = program("p1", "Program One", 0);
    const p2 = program("p2", "Program Two", 1);
    const renderable = mergeForRender(portfolio, p1);
    const scenario = createScenario("s1", "Plan B");
    const selection: ExportSelection = {
      executive: true,
      combinedBaseline: true,
      individualBaseline: true,
      individualBaselineProgramIds: new Set(["p1", "p2"]),
      scenarioId: "s1",
      scenarioCombined: true,
      scenarioProgram: true,
      scenarioProgramProgramIds: new Set(["p1", "p2"]),
    };
    const slides = buildExportSlides({ portfolio, currentRenderable: renderable, timelineSummary: null, allPrograms: [p1, p2], scenario, selection });

    expect(slides.map((s) => s.mode)).toEqual(["executive", "program", "program", "program", "program", "program", "program"]);
    expect(slides.map((s) => s.label)).toEqual([
      "Executive",
      "Combined Programs",
      "Program One",
      "Program Two",
      "Combined Programs (Plan B)",
      "Program One (Plan B)",
      "Program Two (Plan B)",
    ]);
  });

  it("Individual Programs (Baseline) with a partial multi-select only includes the selected Programs, in allPrograms order", () => {
    const p1 = program("p1", "Program One", 0);
    const p2 = program("p2", "Program Two", 1);
    const p3 = program("p3", "Program Three", 2);
    const renderable = mergeForRender(portfolio, p1);
    const slides = buildExportSlides({
      portfolio,
      currentRenderable: renderable,
      timelineSummary: null,
      allPrograms: [p1, p2, p3],
      scenario: null,
      selection: { ...noSelection(), individualBaseline: true, individualBaselineProgramIds: new Set(["p1", "p3"]) },
    });
    expect(slides.map((s) => s.label)).toEqual(["Program One", "Program Three"]);
  });

  it("applies the Scenario override before the Combined merge, so an override survives id-namespacing", () => {
    const overriddenMilestone = milestone({ id: "m1", date: "2026-01-01", rev: 1, title: "Original title" });
    const p1 = program("p1", "Program One", 0, { milestones: [overriddenMilestone] });
    const p2 = program("p2", "Program Two", 1);
    const renderable = mergeForRender(portfolio, p1);
    let scenario = createScenario("s1", "Plan B");
    scenario = setMilestoneOverride(scenario, "m1", { op: "modify", patch: { title: "Overridden title" }, baseRevAtCreation: 1 });

    const slides = buildExportSlides({
      portfolio,
      currentRenderable: renderable,
      timelineSummary: null,
      allPrograms: [p1, p2],
      scenario,
      selection: { ...noSelection(), scenarioCombined: true },
    });

    expect(slides).toHaveLength(1);
    const titles = slides[0].data.milestones.map((m) => m.title);
    expect(titles).toContain("Overridden title");
    expect(titles).not.toContain("Original title");
  });

  it("does not produce Scenario slides when scenarioCombined/scenarioProgram are checked but no Scenario is selected", () => {
    const p1 = program("p1", "Program One", 0);
    const renderable = mergeForRender(portfolio, p1);
    const slides = buildExportSlides({
      portfolio,
      currentRenderable: renderable,
      timelineSummary: null,
      allPrograms: [p1],
      scenario: null,
      selection: { ...noSelection(), scenarioCombined: true, scenarioProgram: true, scenarioProgramProgramIds: new Set(["p1"]) },
    });
    expect(slides).toEqual([]);
  });
});
