// Pure slide-order/data-assembly logic for the Export dialog (wayframe t29) —
// deliberately DOM-free so the fixed slide order and Scenario/merge sequencing
// are unit-testable without mounting anything. The dialog component turns
// each descriptor into an off-screen `RoadmapView` capture.
import { mergeForRender, type Portfolio, type Program, type RenderableProgram } from "@/components/timeline/types";
import { mergeProgramsForAllView } from "@/lib/portfolio/merge-programs";
import { resolveScenario, resolveScenarioForRender } from "@/lib/scenario/resolve";
import type { Scenario } from "@/lib/scenario/types";
import type { ExecutiveTimelineSummary } from "@/components/executive-view/timeline-summary";

export interface ExportSelection {
  executive: boolean;
  combinedBaseline: boolean;
  individualBaseline: boolean;
  individualBaselineProgramIds: Set<string>;
  /** The one Scenario shared by both Scenario checkboxes below — a single-select, not per-checkbox. */
  scenarioId: string | null;
  scenarioCombined: boolean;
  scenarioProgram: boolean;
  scenarioProgramProgramIds: Set<string>;
}

export interface ExportSlideDescriptor {
  label: string;
  mode: "executive" | "program";
  data: RenderableProgram;
  /** Only meaningful for mode "executive" — ExecutiveView's timeline-strip prop. */
  timelineSummary?: ExecutiveTimelineSummary | null;
}

export interface BuildExportSlidesInput {
  portfolio: Portfolio;
  /** Baseline, current Program — used only for the Executive slide, which never follows a Scenario or the Program multi-selects. */
  currentRenderable: RenderableProgram;
  timelineSummary: ExecutiveTimelineSummary | null;
  /** Every Program in the Portfolio (fetched siblings, or just the current Program as a fallback) — must include whichever Programs the multi-selects reference. */
  allPrograms: Program[];
  /** The Scenario matching `selection.scenarioId`, or null if none is selected yet. */
  scenario: Scenario | null;
  selection: ExportSelection;
}

/** Resolves a Scenario's deltas against one Program, raw (no Portfolio merge) — the shape `mergeProgramsForAllView` needs, since Scenario overrides are keyed by each Program's own pre-merge ids and would otherwise be silently orphaned by the merge's id-namespacing. */
function scenarioResolvedProgram(program: Program, scenario: Scenario): Program {
  const resolved = resolveScenario(program, scenario);
  return { ...program, milestones: resolved.milestones, topLevelItems: resolved.topLevelItems };
}

/**
 * Builds the export deck's slide list in t29's fixed order — Executive →
 * Combined (Baseline) → Individual Programs (Baseline) → Combined (Scenario)
 * → Individual Programs (Scenario) — skipping any section whose checkbox is
 * unchecked, and skipping both Scenario sections entirely when `scenario` is
 * null (nothing selected in the shared dropdown yet).
 */
export function buildExportSlides(input: BuildExportSlidesInput): ExportSlideDescriptor[] {
  const { portfolio, currentRenderable, timelineSummary, allPrograms, scenario, selection } = input;
  const slides: ExportSlideDescriptor[] = [];

  if (selection.executive) {
    slides.push({ label: "Executive", mode: "executive", data: currentRenderable, timelineSummary });
  }

  if (selection.combinedBaseline) {
    const merged = mergeProgramsForAllView(portfolio.id, allPrograms);
    slides.push({ label: "Combined Programs", mode: "program", data: mergeForRender(portfolio, merged) });
  }

  if (selection.individualBaseline) {
    for (const program of allPrograms) {
      if (!selection.individualBaselineProgramIds.has(program.id)) continue;
      slides.push({ label: program.programName, mode: "program", data: mergeForRender(portfolio, program) });
    }
  }

  if (selection.scenarioCombined && scenario) {
    const resolvedPrograms = allPrograms.map((p) => scenarioResolvedProgram(p, scenario));
    const merged = mergeProgramsForAllView(portfolio.id, resolvedPrograms);
    slides.push({ label: `Combined Programs (${scenario.name})`, mode: "program", data: mergeForRender(portfolio, merged) });
  }

  if (selection.scenarioProgram && scenario) {
    for (const program of allPrograms) {
      if (!selection.scenarioProgramProgramIds.has(program.id)) continue;
      slides.push({ label: `${program.programName} (${scenario.name})`, mode: "program", data: resolveScenarioForRender(portfolio, program, scenario) });
    }
  }

  return slides;
}
