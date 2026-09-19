import { useEffect } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Portfolio, Program } from "@/components/timeline/types";
import { RoadmapWorkspace } from "./RoadmapWorkspace";
import { exportNativeDeckFromSlides } from "@/lib/export/export-native-deck";
import type { Slide, TextShape } from "@/lib/export/deck-ir";
import { saveDocumentFile } from "@/lib/document-file/document-file";
import { useProgramRoom, type UseProgramRoomResult } from "@/lib/realtime/use-program-room";
import type { UseCorrectionBoxResult } from "@/components/correction-box/use-correction-box";

vi.mock("@/lib/export/export-native-deck", () => ({
  exportNativeDeckFromSlides: vi.fn(() => Promise.resolve()),
}));

/** Every slide's very first shape is its title `text` (buildSlideIR/buildExecutiveSlideIR both push it first) — pulling the label back out of the IR is how these tests confirm slide order/identity now that the pptx path sends native shapes instead of {label, element} DOM sources. */
function titleOf(slide: Slide): string {
  return (slide[0] as TextShape).runs[0].text;
}

vi.mock("@/lib/document-file/document-file", async () => {
  const actual = await vi.importActual<typeof import("@/lib/document-file/document-file")>("@/lib/document-file/document-file");
  return { ...actual, saveDocumentFile: vi.fn() };
});

// wayframe t38, fork 3: the offline badge / conflict banner regression tests
// below need `useProgramRoom` to report a specific `showOfflineBadge`/drive
// `box.addConflicts` without standing up a real y-partyserver connection
// (that's already covered end-to-end by use-program-room.test.ts). Mocking
// the whole hook module — rather than `connectProgramRoom`/a fake provider
// like that file does — keeps these tests scoped to "does RoadmapWorkspace
// render what the hook reports," not "does the hook correctly detect
// conflicts" (already covered elsewhere). The mock still receives the real
// `box` RoadmapWorkspace built via its own `useCorrectionBox`, so calling
// `box.addConflicts` from inside it exercises the real reducer, same as
// production.
vi.mock("@/lib/realtime/use-program-room", async () => {
  const actual = await vi.importActual<typeof import("@/lib/realtime/use-program-room")>("@/lib/realtime/use-program-room");
  return { ...actual, useProgramRoom: vi.fn(actual.useProgramRoom) };
});

function basePortfolio(): Portfolio {
  return { id: "portfolio-1", schemaVersion: 2 };
}

function baseData(): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
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
      },
    ],
  };
}

function slippedData(): Program {
  const data = baseData();
  return {
    ...data,
    milestones: [{ ...data.milestones[0], originalDate: "2025-12-01" }],
  };
}

function openOptionsMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Options" }));
}

// The options-menu accordion collapses everything but
// Appearance by default — tests that need a row from another section expand
// it first, the same click a real user would make.
function openSection(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("RoadmapWorkspace options menu (wayframe#31)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps settings-like controls out of the chrome until the menu is opened", () => {
    render(<RoadmapWorkspace initialData={slippedData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    expect(screen.queryByRole("button", { name: /Delta annotations:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import a schedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sidebar mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export to Deck" })).not.toBeInTheDocument();
    // Only the mode toggle and the hamburger trigger stay in the main chrome.
    expect(screen.getByRole("button", { name: "program" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options" })).toBeInTheDocument();
  });

  it("shows the settings rows once opened, and closes on Escape", async () => {
    render(<RoadmapWorkspace initialData={slippedData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    expect(screen.getByRole("button", { name: "Export to Deck" })).toBeInTheDocument();

    openSection("Chart symbols");
    await waitFor(() => expect(screen.getByRole("button", { name: /Delta annotations:/ })).toBeInTheDocument());

    openSection("Data");
    await waitFor(() => expect(screen.getByRole("button", { name: "Import a schedule" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Sidebar mode" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Delta annotations:/ })).not.toBeInTheDocument());
  });

  it("toggling So-what visibility from the menu hides/shows the BLUF callout", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
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
    const { container } = render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
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

describe("RoadmapWorkspace delta-annotation controls (t23, wayframe#96)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to delta annotations on, and shows the slip ghost for a slipped milestone", async () => {
    render(<RoadmapWorkspace initialData={slippedData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    openSection("Chart symbols");
    await waitFor(() => expect(screen.getByRole("button", { name: "Delta annotations: On" })).toBeInTheDocument());
    expect(screen.getByTestId("delta-ghost-slip-date-m1")).toBeInTheDocument();
  });

  it("turning delta annotations off hides the slip ghost", async () => {
    render(<RoadmapWorkspace initialData={slippedData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    openSection("Chart symbols");
    await waitFor(() => expect(screen.getByRole("button", { name: "Delta annotations: On" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delta annotations: On" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Delta annotations: Off" })).toBeInTheDocument());
    expect(screen.queryByTestId("delta-ghost-slip-date-m1")).not.toBeInTheDocument();
  });
});

describe("RoadmapWorkspace export to deck (t29)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(exportNativeDeckFromSlides).mockClear();
    // Local/unauthenticated mode has no real hosted Portfolio row for the
    // Export dialog's sibling-Programs fetch to read — it should degrade
    // gracefully to just the current Program rather than error.
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false }) as unknown as Promise<Response>));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not duplicate view content in the DOM while idle", () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    expect(screen.getAllByText("Everything is on track.")).toHaveLength(1);
  });

  it("opens a dialog with Export disabled until a section is checked, exports the checked sections in the fixed order, and names the deck after the program for a single-Program-scoped export", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);

    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Export to Deck" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Export to Deck" }));

    const dialog = await screen.findByRole("dialog", { name: "Export to Deck" });
    const exportButton = within(dialog).getByRole("button", { name: "Export" });
    expect(exportButton).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Executive slide" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Individual Programs (Baseline)" }));
    expect(exportButton).not.toBeDisabled();

    fireEvent.click(exportButton);

    await waitFor(() => expect(exportNativeDeckFromSlides).toHaveBeenCalledTimes(1));
    const [slides, fileName] = vi.mocked(exportNativeDeckFromSlides).mock.calls[0];
    // Fixed order: Executive, then Individual Programs (Baseline) — here just
    // the one Program the local-mode fallback knows about.
    expect(slides.map(titleOf)).toEqual(["Executive", "Atlas Program"]);
    // Exactly one Program-scoped section (Individual) resolving to exactly
    // one Program slide keeps the old single-Program-name convention.
    expect(fileName).toBe("atlas-program-deck.pptx");
  });

  it("falls back to a generic filename once the export spans more than one Program-scoped section", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);

    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Export to Deck" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Export to Deck" }));

    const dialog = await screen.findByRole("dialog", { name: "Export to Deck" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Combined Programs (Baseline)" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Individual Programs (Baseline)" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Export" }));

    await waitFor(() => expect(exportNativeDeckFromSlides).toHaveBeenCalledTimes(1));
    const [, fileName] = vi.mocked(exportNativeDeckFromSlides).mock.calls[0];
    expect(fileName).toBe("portfolio-roadmap-deck.pptx");
  });

  it("'Save Snapshot ›' (wayframe UX-2026-09-18 §8) opens the same Export dialog with 'Save Snapshot' pre-selected, one click closer than the Export row", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);

    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Snapshot ›" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save Snapshot ›" }));

    const dialog = await screen.findByRole("dialog", { name: "Export to Deck" });
    expect(within(dialog).getByRole("radio", { name: "Save Snapshot" })).toBeChecked();
  });

  it("'Export to Deck' still defaults to 'Download .pptx' after a prior 'Save Snapshot ›' open — the pre-selection doesn't leak between opens", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);

    openOptionsMenu();
    fireEvent.click(screen.getByRole("button", { name: "Save Snapshot ›" }));
    fireEvent.click((await screen.findByRole("dialog", { name: "Export to Deck" })).querySelector('[aria-label="Close"]')!);

    // The Options menu itself never closed (this app's OptionsMenu only
    // dismisses on outside-pointerdown/Escape, and closing the export
    // dialog triggers neither) — its "Export to Deck" button is still
    // right there underneath where the dialog just was.
    fireEvent.click(screen.getByRole("button", { name: "Export to Deck" }));
    const dialog = await screen.findByRole("dialog", { name: "Export to Deck" });
    expect(within(dialog).getByRole("radio", { name: "Download .pptx" })).toBeChecked();
  });
});

describe("RoadmapWorkspace company logo upload (t40)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("rejects an oversized logo with an inline error and leaves companyLogo unset", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();

    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const oversizedLogo = new File([new Uint8Array(3 * 1024 * 1024)], "logo.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [oversizedLogo] } });

    await waitFor(() => expect(screen.getByText(/too large/i)).toBeInTheDocument());
    // Button still reads "Upload", not "Replace" — the oversized file never became companyLogo.
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  it("accepts a logo under the size cap", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();

    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const smallLogo = new File([new Uint8Array(1024)], "logo.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [smallLogo] } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument());
    expect(screen.queryByText(/too large/i)).not.toBeInTheDocument();
  });
});

describe("RoadmapWorkspace 'start a new roadmap' (wayframe#63)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(saveDocumentFile).mockClear();
  });

  it("omits the New pill entirely when onStartNew isn't provided (the /dev/demo-roadmap QA route)", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
  });

  it("skips the confirm step and calls onStartNew directly when nothing's been edited (historyLength === 0)", async () => {
    const onStartNew = vi.fn();
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} onStartNew={onStartNew} />);
    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(onStartNew).toHaveBeenCalledTimes(1);
    expect(saveDocumentFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save & Start New" })).not.toBeInTheDocument();
  });

  it("expands into 'Save & Start New' / 'Cancel' in place of Save/Open/New once the document's been edited", async () => {
    const onStartNew = vi.fn();
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} onStartNew={onStartNew} />);

    // A plain manual edit (setLaneColor) is enough to push undo history —
    // mirrors how the other suites here trigger edits via the Options menu.
    openOptionsMenu();
    openSection("Layout");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add / edit lanes" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Add / edit lanes" }));
    await waitFor(() => expect(screen.getByLabelText("Colour for Lane 1")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Colour for Lane 1"), { target: { value: "#123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // The Options menu never actually closed (SwimlaneManager's own overlay
    // click and the color/Close interactions above are all fireEvent calls
    // with no real pointerdown reaching OptionsMenu's document-level
    // outside-click listener in jsdom) — no second openOptionsMenu() call.
    await waitFor(() => expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(onStartNew).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save & Start New" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("'Save & Start New' saves the document before routing back to the entry form", async () => {
    const onStartNew = vi.fn();
    const data = baseData();
    render(<RoadmapWorkspace initialData={data} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} onStartNew={onStartNew} />);

    openOptionsMenu();
    openSection("Layout");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add / edit lanes" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Add / edit lanes" }));
    await waitFor(() => expect(screen.getByLabelText("Colour for Lane 1")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Colour for Lane 1"), { target: { value: "#123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // The Options menu never actually closed (SwimlaneManager's own overlay
    // click and the color/Close interactions above are all fireEvent calls
    // with no real pointerdown reaching OptionsMenu's document-level
    // outside-click listener in jsdom) — no second openOptionsMenu() call.
    await waitFor(() => expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save & Start New" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save & Start New" }));

    expect(saveDocumentFile).toHaveBeenCalledTimes(1);
    expect(onStartNew).toHaveBeenCalledTimes(1);
  });
});

// wayframe t38, fork 2: useProgramRoom is now called unconditionally inside
// RoadmapWorkspace (React hook-order rules), gated internally by
// `enabled: realtime != null`. The one thing every *existing* caller (root
// `/`, `/dev/demo-roadmap`) depends on is that omitting `realtime` leaves
// behavior completely unaffected — no connection attempt, no new required
// props, no console noise. This is the most important regression check for
// this fork's change to RoadmapWorkspace's props.
describe("RoadmapWorkspace without a realtime prop (wayframe t38 regression)", () => {
  it("renders exactly as before, with no connection attempt and no console errors", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
      expect(screen.getByRole("button", { name: "program" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Options" })).toBeInTheDocument();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("shows no presence UI when no realtime prop is given", () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    // PresenceAvatars renders nothing for an empty peers list (see its own
    // component) — with no realtime prop, useProgramRoom's peers stay empty
    // forever, so the "Online:" presence chrome never appears.
    expect(screen.queryByText("Online:")).not.toBeInTheDocument();
  });
});

function baseRealtime() {
  return { programId: "program-1", access: { shareToken: "share-token" }, identity: { name: "Ada", identityKey: "ada@example.com" } };
}

// wayframe t38, fork 3: the offline badge and conflict banner are new UI
// this fork adds, consuming `room.showOfflineBadge`/`box.conflicts` (both
// already real, per fork 1/2). These assert the two actually render inside
// the full RoadmapWorkspace tree — see the `vi.mock("@/lib/realtime/use-program-room"...)`
// above for why the whole hook is mocked rather than driven through a fake
// provider (already covered end-to-end in use-program-room.test.ts).
describe("RoadmapWorkspace live-room offline badge / conflict banner (wayframe t38, fork 3)", () => {
  // The last describe block in this file, and each test below sets its own
  // mockReturnValue/mockImplementation before rendering — no shared reset
  // needed between them, and nothing after this block depends on the
  // module's default (actual) passthrough behavior.
  const mockedUseProgramRoom = useProgramRoom as unknown as Mock;

  it("renders the offline badge once room.showOfflineBadge is true", () => {
    mockedUseProgramRoom.mockReturnValue({ status: "disconnected", showOfflineBadge: true, peers: [] } satisfies UseProgramRoomResult);
    render(
      <RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} realtime={baseRealtime()} />,
    );
    expect(screen.getByText(/Offline — changes will sync/)).toBeInTheDocument();
  });

  it("renders no offline badge when room.showOfflineBadge is false", () => {
    mockedUseProgramRoom.mockReturnValue({ status: "connected", showOfflineBadge: false, peers: [] } satisfies UseProgramRoomResult);
    render(
      <RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} realtime={baseRealtime()} />,
    );
    expect(screen.queryByText(/Offline — changes will sync/)).not.toBeInTheDocument();
  });

  it("renders a persistent conflict banner once box.conflicts is populated, driven through the real useCorrectionBox reducer", async () => {
    // The mock still receives RoadmapWorkspace's real `box` (from its own
    // `useCorrectionBox` call) — calling `box.addConflicts` from inside this
    // fake hook implementation exercises the real dismiss/conflicts reducer
    // path, not a hand-rolled double.
    mockedUseProgramRoom.mockImplementation((options: { box: UseCorrectionBoxResult }) => {
      useEffect(() => {
        options.box.addConflicts([
          { type: "orphaned", itemKind: "milestone", targetId: "m1", message: "This milestone was deleted by another collaborator while you were offline." },
        ]);
      }, [options.box]);
      return { status: "connected", showOfflineBadge: false, peers: [] } satisfies UseProgramRoomResult;
    });
    render(
      <RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} realtime={baseRealtime()} />,
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("This milestone was deleted by another collaborator while you were offline.")).toBeInTheDocument();
  });
});
