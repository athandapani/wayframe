import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoadmapTimeline } from "./RoadmapTimeline";
import { BlufCallout } from "./BlufCallout";
import { sampleRoadmap } from "./__fixtures__/sample-roadmap";
import { deriveShortLabel } from "./short-label";

describe("RoadmapTimeline", () => {
  it("renders swimlanes, separators, and milestones", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByTestId("roadmap-timeline")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByText("Lane A")).toBeInTheDocument();
    expect(screen.getByText("Lane B")).toBeInTheDocument();
    expect(screen.getByText("Phase One")).toBeInTheDocument();
    expect(screen.getByText("Kickoff")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("shows a derived short label for each milestone and the full title in a hover tooltip", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByText(deriveShortLabel("First milestone"))).toBeInTheDocument();
    expect(screen.getByText("First milestone")).toBeInTheDocument();
    expect(screen.getByText("Second milestone")).toBeInTheDocument();
  });

  it("renders the today reference line when today falls within the domain", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("omits the today reference line when today falls outside the domain", () => {
    render(<RoadmapTimeline data={sampleRoadmap} today={new Date("2030-01-01T00:00:00Z")} />);
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });
});

describe("deriveShortLabel", () => {
  it("takes initials of significant words", () => {
    expect(deriveShortLabel("Chassis design freeze")).toBe("CDF");
  });

  it("skips stopwords", () => {
    expect(deriveShortLabel("Launch readiness review for GA")).toBe("LRRG");
  });

  it("caps at the requested length", () => {
    expect(deriveShortLabel("One two three four five", 3)).toBe("OTT");
  });
});

describe("BlufCallout", () => {
  it("renders the bluf statement and bullets, and can be dismissed and reopened", () => {
    render(<BlufCallout bluf={sampleRoadmap.bluf} />);
    expect(screen.getByText(sampleRoadmap.bluf.statement)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(sampleRoadmap.bluf.statement)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("So what?"));
    expect(screen.getByText(sampleRoadmap.bluf.statement)).toBeInTheDocument();
  });
});
