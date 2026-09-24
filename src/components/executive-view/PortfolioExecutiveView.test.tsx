import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Portfolio, Program } from "@/components/timeline/types";
import { PortfolioExecutiveView } from "./PortfolioExecutiveView";

const today = new Date("2026-03-01T00:00:00Z");

function portfolio(): Portfolio {
  return { id: "portfolio-1", schemaVersion: 4 };
}

function program(overrides: Partial<Program> & Pick<Program, "id" | "programName">): Program {
  return {
    portfolioId: "portfolio-1",
    order: 0,
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Delivery" }],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

/** A delayed milestone — red at lane, Program and Roadmap tier, by t27's one worst-status-wins rule. */
function delayed(id: string, title: string) {
  return { id, laneId: "lane-1", title, date: "2026-04-01", status: "delayed" as const, dependsOn: [], linksToTopLevelMilestone: null, comment: "Vendor slipped." };
}

function onTrack(id: string, title: string) {
  return { id, laneId: "lane-1", title, date: "2026-04-01", status: "on-track" as const, dependsOn: [], linksToTopLevelMilestone: null };
}

describe("PortfolioExecutiveView (wayframe#145)", () => {
  it("breaks the summary down Program by Program, with each Program's own RAG, counts and highlights", () => {
    const alpha = program({ id: "p-alpha", programName: "Program Alpha", order: 0, milestones: [delayed("m1", "Vendor contract")] });
    const beta = program({ id: "p-beta", programName: "Program Beta", order: 1, milestones: [onTrack("m2", "Pilot live")] });
    render(<PortfolioExecutiveView portfolio={portfolio()} programs={[alpha, beta]} today={today} />);

    const alphaSection = screen.getByRole("region", { name: "Program Alpha summary" });
    expect(within(alphaSection).getByText("1 delayed · 0 at risk")).toBeInTheDocument();
    // Its own highlight, not the Roadmap's flattened list.
    expect(within(alphaSection).getByText("Vendor contract")).toBeInTheDocument();
    expect(within(alphaSection).getByText("Vendor slipped.")).toBeInTheDocument();

    const betaSection = screen.getByRole("region", { name: "Program Beta summary" });
    expect(within(betaSection).getByText("On track")).toBeInTheDocument();
    expect(within(betaSection).queryByText("Vendor contract")).not.toBeInTheDocument();
    expect(within(betaSection).getByText("Nothing at risk or delayed.")).toBeInTheDocument();
  });

  it("shows the Roadmap's own rollup above the breakdown, so the whole and the parts are on one screen", () => {
    const alpha = program({ id: "p-alpha", programName: "Program Alpha", order: 0, milestones: [delayed("m1", "Vendor contract")] });
    const beta = program({ id: "p-beta", programName: "Program Beta", order: 1, milestones: [onTrack("m2", "Pilot live")] });
    render(<PortfolioExecutiveView portfolio={portfolio()} programs={[alpha, beta]} today={today} />);
    expect(screen.getByText("Roadmap")).toBeInTheDocument();
    expect(screen.getByText("1 milestone at risk across 2 Programs")).toBeInTheDocument();
  });

  it("names each Program's lanes, so where a Program's RAG comes from is visible without leaving this view", () => {
    const alpha = program({ id: "p-alpha", programName: "Program Alpha", order: 0, milestones: [delayed("m1", "Vendor contract")] });
    const beta = program({ id: "p-beta", programName: "Program Beta", order: 1 });
    render(<PortfolioExecutiveView portfolio={portfolio()} programs={[alpha, beta]} today={today} />);
    expect(within(screen.getByRole("region", { name: "Program Alpha summary" })).getByText("Delivery")).toBeInTheDocument();
  });

  it("renders a single-Program Roadmap as the ordinary Executive view, with no breakdown section at all", () => {
    const only = program({ id: "p-only", programName: "Only Program", milestones: [delayed("m1", "Vendor contract")] });
    render(<PortfolioExecutiveView portfolio={portfolio()} programs={[only]} today={today} />);
    // ExecutiveView's own headings, not this component's.
    expect(screen.getByRole("heading", { name: "Only Program" })).toBeInTheDocument();
    expect(screen.getByText("Top risks")).toBeInTheDocument();
    expect(screen.queryByText("How each Program is doing")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Only Program summary" })).not.toBeInTheDocument();
  });

  it("says so rather than crashing when the Roadmap has no Program yet", () => {
    render(<PortfolioExecutiveView portfolio={portfolio()} programs={[]} today={today} />);
    expect(screen.getByText("This Roadmap has no Program yet.")).toBeInTheDocument();
  });
});
