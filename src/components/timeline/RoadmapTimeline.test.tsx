import { useState } from "react";
import { defaultTheme } from "./theme";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoadmapTimeline } from "./RoadmapTimeline";
import { BlufCallout } from "./BlufCallout";
import { sampleRoadmap } from "./__fixtures__/sample-roadmap";
import { deriveShortLabel } from "./short-label";
import type { RoadmapData } from "./types";

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

describe("ghost-rendering a slipped milestone (wayframe#29/#30)", () => {
  const slippedRoadmap: RoadmapData = {
    ...sampleRoadmap,
    milestones: sampleRoadmap.milestones.map((m) => (m.id === "m2" ? { ...m, originalDate: "2026-01-25" } : m)),
  };

  it("renders nothing extra when ghostMode is off, even for a slipped milestone", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="off" />);
    expect(screen.queryByTestId("ghost-badge-m2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ghost-outline-m2")).not.toBeInTheDocument();
  });

  it("renders nothing extra for a milestone that hasn't slipped, even with ghosts on", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="badge" />);
    expect(screen.queryByTestId("ghost-badge-m1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ghost-outline-m1")).not.toBeInTheDocument();
  });

  it("style badge: shows a +/-Nd slip badge next to the current marker, no mark at the old date", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="badge" />);
    expect(screen.getByTestId("ghost-badge-m2")).toBeInTheDocument();
    expect(screen.getByText("+21d")).toBeInTheDocument();
    expect(screen.queryByTestId("ghost-outline-m2")).not.toBeInTheDocument();
  });

  it("style outline: shows a dashed outline at the old date, no badge", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="outline" />);
    expect(screen.getByTestId("ghost-outline-m2")).toBeInTheDocument();
    expect(screen.queryByTestId("ghost-badge-m2")).not.toBeInTheDocument();
    expect(screen.queryByText("+21d")).not.toBeInTheDocument();
  });

  it("shows the old→new date detail in the hover tooltip", () => {
    render(<RoadmapTimeline data={slippedRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostMode="badge" />);
    expect(screen.getByText((_, el) => el?.textContent === "Jan 25 → Feb 15")).toBeInTheDocument();
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

function ControlledBlufCallout({ bluf }: { bluf: { statement: string; bullets: string[] } }) {
  const [open, setOpen] = useState(true);
  return <BlufCallout bluf={bluf} open={open} onOpenChange={setOpen} theme={defaultTheme} />;
}

describe("BlufCallout", () => {
  it("renders the bluf statement and bullets, and can be dismissed and reopened", () => {
    render(<ControlledBlufCallout bluf={sampleRoadmap.bluf} />);
    expect(screen.getByText(sampleRoadmap.bluf.statement)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(sampleRoadmap.bluf.statement)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("So what?"));
    expect(screen.getByText(sampleRoadmap.bluf.statement)).toBeInTheDocument();
  });
});
