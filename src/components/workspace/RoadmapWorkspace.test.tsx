import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoadmapData } from "@/components/timeline/types";
import { RoadmapWorkspace } from "./RoadmapWorkspace";
import { exportToDeck } from "@/lib/export/export-to-deck";

vi.mock("@/lib/export/export-to-deck", () => ({
  exportToDeck: vi.fn(() => Promise.resolve()),
}));

function baseData(): RoadmapData {
  return {
    schemaVersion: "1.0",
    programName: "Atlas Program",
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

describe("RoadmapWorkspace export to deck", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(exportToDeck).mockClear();
  });

  it("does not duplicate view content in the DOM while idle", () => {
    render(<RoadmapWorkspace initialData={baseData()} today={new Date("2026-01-01")} persist={false} />);
    expect(screen.getAllByText("Everything is on track.")).toHaveLength(1);
  });

  it("captures both views and writes a deck named after the program on export", async () => {
    render(<RoadmapWorkspace initialData={baseData()} today={new Date("2026-01-01")} persist={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Export to Deck" }));

    await waitFor(() => expect(exportToDeck).toHaveBeenCalledTimes(1));
    const [sources, fileName] = vi.mocked(exportToDeck).mock.calls[0];
    expect(sources.map((s) => s.label)).toEqual(["Program", "Executive"]);
    expect(sources[0].element).not.toBe(sources[1].element);
    expect(fileName).toBe("atlas-program-deck.pptx");
  });
});
