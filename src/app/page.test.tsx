import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { RoadmapData } from "@/components/timeline/types";
import Home from "./page";

const STORAGE_KEY = "wayframe:document";

function baseData(): RoadmapData {
  return {
    schemaVersion: "1.0",
    programName: "Test Program",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "Everything is on track.", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [
      {
        id: "m1",
        laneId: "lane-1",
        title: "Milestone 1",
        date: "2026-01-01",
        status: "not-started",
        dependsOn: [],
        linksToTopLevelMilestone: null,
        isCriticalPath: false,
      },
    ],
  };
}

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the entry form when no roadmap is saved", async () => {
    render(<Home />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Build your roadmap" })).toBeInTheDocument();
    });
  });

  it("lands back in the saved roadmap when one already exists in localStorage", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(baseData()));
    render(<Home />);
    await waitFor(() => {
      expect(screen.getByText("Everything is on track.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Build your roadmap" })).not.toBeInTheDocument();
  });
});
