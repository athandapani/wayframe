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

describe("RoadmapWorkspace on a genuinely empty Program (wayframe UX-2026-09-18 §7 regression)", () => {
  it("renders without crashing when swimlanes/topLevelItems/milestones are all empty — exactly what '+ New Program' creates", () => {
    const empty: Program = { ...baseData(), swimlanes: [], topLevelItems: [], milestones: [] };
    expect(() => {
      render(<RoadmapWorkspace initialData={empty} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    }).not.toThrow();
  });
});

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
    expect(screen.getByRole("button", { name: "Program" })).toBeInTheDocument();
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
    expect(fileName).toBe("roadmap-deck.pptx");
  });

  it("'Save Export Snapshot ›' (wayframe UX-2026-09-18 §8) opens the same Export dialog with 'Save Export Snapshot' pre-selected, one click closer than the Export row", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);

    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Export Snapshot ›" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save Export Snapshot ›" }));

    const dialog = await screen.findByRole("dialog", { name: "Export to Deck" });
    expect(within(dialog).getByRole("radio", { name: "Save Export Snapshot" })).toBeChecked();
  });

  it("'Export to Deck' still defaults to 'Download .pptx' after a prior 'Save Export Snapshot ›' open — the pre-selection doesn't leak between opens", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);

    openOptionsMenu();
    fireEvent.click(screen.getByRole("button", { name: "Save Export Snapshot ›" }));
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
      expect(screen.getByRole("button", { name: "Program" })).toBeInTheDocument();
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

// wayframe#121: on any realtime-connected page, the toolbar's sync-status
// text (not the file-download "Save" pill) is the thing that actually tells
// a user whether their edit is persisted. These assert the three states
// derived from the same status/showOfflineBadge pair fork 3's badge tests
// above already exercise, and that the File "Save" pills get relabeled so
// they never read as the save action on this route.
describe("RoadmapWorkspace sync status indicator + relabeled Save (wayframe#121)", () => {
  const mockedUseProgramRoom = useProgramRoom as unknown as Mock;

  it("says nothing at all once truly connected — a permanent 'Saved' is the state a reader assumes, and it cost the strip a row", () => {
    // #144 feedback: "don't need the syncing". The indicator is for the bad
    // case; the "Updated <time>" badge beside it carries the good one.
    mockedUseProgramRoom.mockReturnValue({ status: "connected", showOfflineBadge: false, peers: [] } satisfies UseProgramRoomResult);
    render(
      <RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} realtime={baseRealtime()} />,
    );
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
    expect(screen.queryByText("Offline — changes pending")).not.toBeInTheDocument();
  });

  it("reads 'Syncing…' while connecting", () => {
    mockedUseProgramRoom.mockReturnValue({ status: "connecting", showOfflineBadge: false, peers: [] } satisfies UseProgramRoomResult);
    render(
      <RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} realtime={baseRealtime()} />,
    );
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
  });

  it("reads 'Syncing…', not 'Offline', during a drop still inside showOfflineBadge's debounce window", () => {
    mockedUseProgramRoom.mockReturnValue({ status: "disconnected", showOfflineBadge: false, peers: [] } satisfies UseProgramRoomResult);
    render(
      <RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} realtime={baseRealtime()} />,
    );
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
  });

  it("reads 'Offline — changes pending' once showOfflineBadge has debounced in", () => {
    mockedUseProgramRoom.mockReturnValue({ status: "disconnected", showOfflineBadge: true, peers: [] } satisfies UseProgramRoomResult);
    render(
      <RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} realtime={baseRealtime()} />,
    );
    expect(screen.getByText("Offline — changes pending")).toBeInTheDocument();
  });

  it("renders no sync status text when no realtime prop is given (unauthenticated local-only page)", () => {
    mockedUseProgramRoom.mockReturnValue({ status: "connected", showOfflineBadge: false, peers: [] } satisfies UseProgramRoomResult);
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("relabels the File 'Save' pill to 'Download a copy' on a realtime-connected page", async () => {
    mockedUseProgramRoom.mockReturnValue({ status: "connected", showOfflineBadge: false, peers: [] } satisfies UseProgramRoomResult);
    render(
      <RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} realtime={baseRealtime()} />,
    );
    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Download a copy" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("leaves the File 'Save' pill reading 'Save' when no realtime prop is given (the local-only '/' page)", async () => {
    mockedUseProgramRoom.mockReturnValue({ status: "connected", showOfflineBadge: false, peers: [] } satisfies UseProgramRoomResult);
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Download a copy" })).not.toBeInTheDocument();
  });
});

describe("RoadmapWorkspace → Version history pointer (wayframe#128)", () => {
  // Own handle on the mocked hook (the block above leaves it with a
  // mockImplementation set) so these two renders don't try to open a real
  // room connection.
  const mockedUseProgramRoom = useProgramRoom as unknown as Mock;

  beforeEach(() => {
    mockedUseProgramRoom.mockReset();
    mockedUseProgramRoom.mockReturnValue({ status: "connected", showOfflineBadge: false, peers: [] } satisfies UseProgramRoomResult);
  });

  it("offers a way to reach Version history on a hosted Roadmap — the dock itself lives on the All-Programs surface", () => {
    render(
      <RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} realtime={baseRealtime()} />,
    );
    openOptionsMenu();
    expect(screen.getByRole("link", { name: "Open on All Programs ›" })).toHaveAttribute("href", "/p/portfolio-1/all");
  });

  it("offers no such link with no live room — the local-only '/' page and the demo route have no All-Programs view to open", () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openOptionsMenu();
    expect(screen.queryByRole("link", { name: "Open on All Programs ›" })).not.toBeInTheDocument();
  });
});

describe("File - Open with a multi-Program file (wayframe#140)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  /** A real export file — `parseDocumentFile` runs for real here (only `saveDocumentFile` is mocked at the top of this file). */
  function roadmapFile(programNames: string[]): File {
    const document = {
      portfolio: { id: "from-the-file", schemaVersion: 4 },
      programs: programNames.map((programName, order) => ({ ...baseData(), id: `p${order}`, portfolioId: "from-the-file", order, programName })),
    };
    return new File([JSON.stringify(document)], "trial.json", { type: "application/json" });
  }

  // The Open input lives in the Options menu's File row (above the
  // accordion, so no section to expand) — same click a real user makes.
  function openFile(file: File) {
    openOptionsMenu();
    const input = document.querySelector('input[type="file"][accept=".json,application/json"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  it("says so when a file held more Programs than this page can show, instead of opening one and dropping the rest in silence", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openFile(roadmapFile(["In Progress", "Deferred", "Completed", "Merger"]));

    // Names the one that DID open, so "which of my four am I looking at" is
    // answerable — the count alone wouldn't be enough.
    await waitFor(() => expect(screen.getByText(/That file holds 4 Programs — only “In Progress” was opened\./)).toBeInTheDocument());
    // ...and points at the surface that can hold all four.
    expect(screen.getByRole("link", { name: "My Roadmaps" })).toBeInTheDocument();
  });

  it("opens a single-Program file with no notice at all", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openFile(roadmapFile(["Only One"]));

    await waitFor(() => expect(screen.getByText("Only One")).toBeInTheDocument());
    expect(screen.queryByText(/only .* was opened/)).not.toBeInTheDocument();
  });

  it("dismisses the notice", async () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    openFile(roadmapFile(["One", "Two"]));

    await waitFor(() => expect(screen.getByText(/That file holds 2 Programs/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Programs notice" }));
    expect(screen.queryByText(/That file holds 2 Programs/)).not.toBeInTheDocument();
  });
});

describe("the top strip is one row, not four islands (wayframe#149)", () => {
  it("puts the mode toggle, the right-hand cluster and the account chip in the same strip, so growth reflows instead of overlapping", () => {
    render(
      <RoadmapWorkspace
        initialData={baseData()}
        initialPortfolio={basePortfolio()}
        today={new Date("2026-01-01")}
        persist={false}
        accountSlot={<span>signed-in@example.com</span>}
      />,
    );
    const strip = screen.getByTestId("top-strip");
    // Every piece that used to position itself independently in this strip:
    // the Executive/Program toggle (its own `fixed left-1/2`), the Options
    // cluster (`fixed right-4`), and the account chip (`fixed right-2`).
    expect(within(strip).getByRole("button", { name: "Program" })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "Executive" })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "Options" })).toBeInTheDocument();
    expect(within(strip).getByText("signed-in@example.com")).toBeInTheDocument();
    // And nothing inside it positions itself: a `fixed` child is exactly the
    // bug — it would leave the row's layout and overlap its neighbours again.
    expect(strip.querySelectorAll('[class*="fixed"]')).toHaveLength(0);
  });

  it("renders the strip with no account chip at all when the caller has none to give", () => {
    render(<RoadmapWorkspace initialData={baseData()} initialPortfolio={basePortfolio()} today={new Date("2026-01-01")} persist={false} />);
    const strip = screen.getByTestId("top-strip");
    expect(within(strip).getByRole("button", { name: "Options" })).toBeInTheDocument();
  });
});
