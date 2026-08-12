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

function slippedData(): RoadmapData {
  const data = baseData();
  return {
    ...data,
    milestones: [{ ...data.milestones[0], originalDate: "2025-12-01" }],
  };
}

function openOptionsMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Options" }));
}

describe("RoadmapWorkspace options menu (wayframe#31)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps settings-like controls out of the chrome until the menu is opened", () => {
    render(<RoadmapWorkspace initialData={slippedData()} today={new Date("2026-01-01")} persist={false} />);
    expect(screen.queryByRole("button", { name: /Ghosts:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import a schedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sidebar mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export to Deck" })).not.toBeInTheDocument();
    // Only the mode toggle and the hamburger trigger stay in the main chrome.
    expect(screen.getByRole("button", { name: "program" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options" })).toBeInTheDocument();
  });

  it("shows the settings rows once opened, and closes on Escape", async () => {
    render(<RoadmapWorkspace initialData={slippedData()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: /Ghosts:/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Import a schedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sidebar mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export to Deck" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Ghosts:/ })).not.toBeInTheDocument());
  });

  it("toggling So-what visibility from the menu hides/shows the BLUF callout", async () => {
    render(<RoadmapWorkspace initialData={baseData()} today={new Date("2026-01-01")} persist={false} />);
    expect(screen.getByText("Everything is on track.")).toBeInTheDocument();

    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "So what: Shown" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "So what: Shown" }));

    await waitFor(() => expect(screen.queryByText("Everything is on track.")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "So what" })).toBeInTheDocument();
  });
});

describe("RoadmapWorkspace font-scale wiring (wayframe#42/#50, revised)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("scales marker text via the Font size slider without growing the chart's row/pill box heights", async () => {
    const { container } = render(<RoadmapWorkspace initialData={baseData()} today={new Date("2026-01-01")} persist={false} />);
    const svg = () => container.querySelector('[data-testid="roadmap-timeline"] svg')!;
    const baseHeight = svg().getAttribute("height");
    const baseFontSize = screen.getAllByText("Milestone 1")[0].getAttribute("font-size");

    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("slider", { name: "Font size" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("slider", { name: "Font size" }), { target: { value: "1.6" } });

    // Text grows...
    await waitFor(() => expect(screen.getAllByText("Milestone 1")[0].getAttribute("font-size")).not.toBe(baseFontSize));
    // ...but the SVG's overall height — driven by row/pill/axis/top-band
    // box heights — does not. Variant B (originally shipped) scaled both
    // together; the revised decision leaves boxScale at its default so only
    // text and the collision-avoidance math move with the slider.
    expect(svg().getAttribute("height")).toBe(baseHeight);
  });
});

describe("RoadmapWorkspace ghost-rendering controls (wayframe#29/#30)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to ghosts on, style badge, and shows the slip badge for a slipped milestone", async () => {
    render(<RoadmapWorkspace initialData={slippedData()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ghosts: On" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "badge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "outline" })).toBeInTheDocument();
    expect(screen.getByTestId("ghost-badge-m1")).toBeInTheDocument();
  });

  it("turning ghosts off hides the style switcher and the slip badge", async () => {
    render(<RoadmapWorkspace initialData={slippedData()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ghosts: On" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Ghosts: On" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Ghosts: Off" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "badge" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("ghost-badge-m1")).not.toBeInTheDocument();
  });

  it("switching style to outline swaps the badge for a dashed outline at the old date", async () => {
    render(<RoadmapWorkspace initialData={slippedData()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "outline" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "outline" }));

    await waitFor(() => expect(screen.getByTestId("ghost-outline-m1")).toBeInTheDocument());
    expect(screen.queryByTestId("ghost-badge-m1")).not.toBeInTheDocument();
  });
});

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

    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Export to Deck" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Export to Deck" }));

    await waitFor(() => expect(exportToDeck).toHaveBeenCalledTimes(1));
    const [sources, fileName] = vi.mocked(exportToDeck).mock.calls[0];
    expect(sources.map((s) => s.label)).toEqual(["Program", "Executive"]);
    expect(sources[0].element).not.toBe(sources[1].element);
    expect(fileName).toBe("atlas-program-deck.pptx");
  });
});
