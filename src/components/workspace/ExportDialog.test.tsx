import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeForRender, type Portfolio, type Program } from "@/components/timeline/types";
import { defaultPortfolioTheme, resolvePortfolioTheme } from "@/components/timeline/theme";
import { ExportDialog, type ExportRenderPrefs } from "./ExportDialog";

vi.mock("@/lib/export/export-to-deck", () => ({
  exportToDeck: vi.fn(() => Promise.resolve()),
}));

function basePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return { id: "portfolio-1", schemaVersion: 2, ...overrides };
}

function baseProgram(id: string, name: string): Program {
  return {
    id,
    portfolioId: "portfolio-1",
    order: 0,
    programName: name,
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [],
  };
}

function renderPrefs(): ExportRenderPrefs {
  return {
    blufOpen: true,
    deltaAnnotationsEnabled: false,
    showCriticalPath: false,
    criticalPathStyle: "solid",
    topBandStyle: "chip",
    periodGridlineStyle: "off",
    axisTiers: { key: "year", label: "Year only", tier2: "none", tier3: "none" },
    axisYearColor: "#000000",
    labelDensity: "all",
    soWhatFillColor: null,
    soWhatFillTransparency: 0,
    fontScale: 1,
    fontFamily: undefined,
    connectorStyle: "elbow",
    connectorDash: "solid",
    connectorArrow: "standard",
    todayOverlayEnabled: false,
    pillProgressStyle: "off",
    fitToScreen: false,
    dateLabelPlacement: "below",
    legendCategoryFillEnabled: false,
    swimlaneOwnerVisible: false,
  };
}

describe("ExportDialog (t29)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false }) as unknown as Promise<Response>));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup() {
    const portfolio = basePortfolio();
    const program = baseProgram("p1", "Atlas Program");
    const theme = resolvePortfolioTheme(defaultPortfolioTheme);
    return render(
      <ExportDialog
        portfolio={portfolio}
        currentProgram={program}
        currentRenderable={mergeForRender(portfolio, program)}
        theme={theme}
        today={new Date("2026-01-01")}
        timelineSummary={null}
        zoom={{
          fullDomain: { min: 0, max: 1 },
          active: false,
          window: { min: 0, max: 1 },
          committedWindow: { min: 0, max: 1 },
          previewing: false,
          previewScale: 1,
          previewOffsetFraction: 0,
          setWindow: () => {},
          setStart: () => {},
          setEnd: () => {},
          zoomBy: () => {},
          pan: () => {},
          reset: () => {},
        }}
        renderPrefs={renderPrefs()}
        onAddScenario={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("renders all 5 sections with Export disabled until one is checked", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Export to Deck" });
    expect(screen.getByRole("checkbox", { name: "Executive slide" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Combined Programs (Baseline)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Individual Programs (Baseline)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Scenario: Combined" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Scenario: Program view" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("enables Export once a checkbox is checked", () => {
    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Executive slide" }));
    expect(screen.getByRole("button", { name: "Export" })).not.toBeDisabled();
  });

  it("reveals the Program multi-select only once Individual Programs (Baseline) is checked", () => {
    setup();
    expect(screen.queryByRole("checkbox", { name: "Atlas Program" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Individual Programs (Baseline)" }));
    expect(screen.getByRole("checkbox", { name: "Atlas Program" })).toBeInTheDocument();
  });

  it("disables the Scenario checkboxes/select when the Portfolio has no Scenarios yet", () => {
    setup();
    expect(screen.getByRole("checkbox", { name: "Scenario: Combined" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Scenario: Program view" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Scenario" })).toBeDisabled();
  });
});
