import { describe, expect, it } from "vitest";
import { parsePortfolioExportFile, portfolioExportFileName } from "./portfolio-export";
import { demoPortfolio, demoRoadmap } from "@/data/demo-roadmap";
import type { PortfolioDocument } from "@/components/timeline/types";

describe("parsePortfolioExportFile", () => {
  it("round-trips a multi-Program Portfolio without loss", () => {
    const secondProgram = { ...demoRoadmap, id: "prog-2", programName: "Second Program" };
    const multiProgram: PortfolioDocument = { portfolio: demoPortfolio, programs: [demoRoadmap, secondProgram] };

    const result = parsePortfolioExportFile(JSON.stringify(multiProgram));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.programs).toHaveLength(2);
      expect(result.document.programs.map((p) => p.id)).toEqual([demoRoadmap.id, "prog-2"]);
    }
  });

  it("rejects non-JSON with a readable message", () => {
    const result = parsePortfolioExportFile("this is not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/valid JSON/);
  });

  it("rejects JSON that isn't a Portfolio document", () => {
    const result = parsePortfolioExportFile(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
  });
});

describe("portfolioExportFileName", () => {
  it("slugifies the portfolio name", () => {
    expect(portfolioExportFileName("Atlas Robotics — All Programs")).toBe("atlas-robotics-all-programs.wayframeportfolio.json");
  });

  it("falls back when no name is given", () => {
    expect(portfolioExportFileName()).toBe("portfolio.wayframeportfolio.json");
    expect(portfolioExportFileName("   ")).toBe("portfolio.wayframeportfolio.json");
  });
});
