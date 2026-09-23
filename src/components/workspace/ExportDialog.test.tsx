import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeForRender, type Portfolio, type Program } from "@/components/timeline/types";
import { defaultPortfolioTheme, resolvePortfolioTheme } from "@/components/timeline/theme";
import { ExportDialog, type ExportRenderPrefs } from "./ExportDialog";

const exportNativeDeckFromSlides = vi.fn<(slides: unknown[], fileName: string) => Promise<void>>(() => Promise.resolve());
vi.mock("@/lib/export/export-native-deck", () => ({
  exportNativeDeckFromSlides: (...args: [unknown[], string]) => exportNativeDeckFromSlides(...args),
}));

const openPlaceholderPopup = vi.fn<() => Window | null>();
const runConsentInPopup = vi.fn<(popup: Window) => Promise<boolean>>();
vi.mock("@/lib/auth/slides-consent-popup", () => ({
  openPlaceholderPopup: () => openPlaceholderPopup(),
  runConsentInPopup: (popup: Window) => runConsentInPopup(popup),
}));

const openDrivePicker = vi.fn<(accessToken: string) => Promise<{ folderId: string; folderName: string } | null>>();
vi.mock("@/lib/google/drive-picker", () => ({
  openDrivePicker: (accessToken: string) => openDrivePicker(accessToken),
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
  return { legendCategoryFillEnabled: false };
}

/** A fake `fetch` that answers by URL substring — every route this dialog can call gets a default "not ok" response unless a specific handler is registered, so an un-mocked call fails loudly in a test rather than hanging. */
function mockFetch(handlers: Record<string, () => Promise<Partial<Response>> | Partial<Response>>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [substr, handler] of Object.entries(handlers)) {
      if (url.includes(substr)) return handler();
    }
    return { ok: false } as Response;
  }) as unknown as typeof fetch;
}

describe("ExportDialog (t29/t30)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch({}));
    openPlaceholderPopup.mockReset();
    runConsentInPopup.mockReset();
    openDrivePicker.mockReset();
    exportNativeDeckFromSlides.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup(overrides: { initialDestination?: "pptx" | "slides" | "snapshot" } = {}) {
    const portfolio = basePortfolio();
    const program = baseProgram("p1", "Atlas Program");
    const theme = resolvePortfolioTheme(defaultPortfolioTheme);
    const onClose = vi.fn();
    const utils = render(
      <ExportDialog
        portfolio={portfolio}
        currentProgram={program}
        currentRenderable={mergeForRender(portfolio, program)}
        theme={theme}
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
        onClose={onClose}
        initialDestination={overrides.initialDestination}
      />,
    );
    return { ...utils, onClose };
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

  it("defaults to Download .pptx and calls the native pptx exporter, then closes", async () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Executive slide" }));
    expect(screen.getByRole("radio", { name: "Download .pptx" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(exportNativeDeckFromSlides).toHaveBeenCalledTimes(1));
    const [slides] = exportNativeDeckFromSlides.mock.calls[0] as [unknown[], string];
    expect(Array.isArray(slides)).toBe(true);
    expect(onClose).toHaveBeenCalled();
    expect(openPlaceholderPopup).not.toHaveBeenCalled();
  });

  it("initialDestination='snapshot' (wayframe UX-2026-09-18 §8's 'Save Export Snapshot ›' button) opens straight onto the Save Export Snapshot radio, pre-selected", () => {
    setup({ initialDestination: "snapshot" });
    expect(screen.getByRole("radio", { name: "Save Export Snapshot" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Download .pptx" })).not.toBeChecked();
  });

  it("initialDestination omitted still defaults to Download .pptx, unchanged (the Export row's own path)", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Download .pptx" })).toBeChecked();
  });

  it("Send to Google Slides — valid token, remembered folder — posts the IR and shows a success link without closing", async () => {
    const fakePopup = { close: vi.fn() } as unknown as Window;
    openPlaceholderPopup.mockReturnValue(fakePopup);
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/google/drive-folder": () => ({ ok: true, json: async () => ({ folder: { folderId: "f1", folderName: "Exports" } }) }),
        "/api/google/slides-token-status": () => ({ ok: true, json: async () => ({ ok: true }) }),
        "/api/google/slides-export": () => ({ ok: true, json: async () => ({ presentationUrl: "https://docs.google.com/presentation/d/abc/edit" }) }),
      }),
    );

    const { onClose } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Executive slide" }));
    fireEvent.click(screen.getByRole("radio", { name: "Send to Google Slides" }));
    await waitFor(() => expect(screen.getByText(/Change destination/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Send to Slides" }));

    await waitFor(() => expect(screen.getByRole("link", { name: /Open the new Google Slides deck/ })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Open the new Google Slides deck/ })).toHaveAttribute("href", "https://docs.google.com/presentation/d/abc/edit");
    expect(openDrivePicker).not.toHaveBeenCalled();
    expect(fakePopup.close).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Send to Google Slides — no valid token — re-consents via the popup and automatically resumes the export", async () => {
    const fakePopup = { close: vi.fn() } as unknown as Window;
    openPlaceholderPopup.mockReturnValue(fakePopup);
    runConsentInPopup.mockResolvedValue(true);
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/google/drive-folder": () => ({ ok: true, json: async () => ({ folder: { folderId: "f1", folderName: "Exports" } }) }),
        "/api/google/slides-token-status": () => ({ ok: true, json: async () => ({ ok: false }) }),
        "/api/google/slides-export": () => ({ ok: true, json: async () => ({ presentationUrl: "https://docs.google.com/presentation/d/xyz/edit" }) }),
      }),
    );

    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Executive slide" }));
    fireEvent.click(screen.getByRole("radio", { name: "Send to Google Slides" }));
    await waitFor(() => expect(screen.getByText(/Change destination/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Send to Slides" }));

    await waitFor(() => expect(runConsentInPopup).toHaveBeenCalledWith(fakePopup));
    await waitFor(() => expect(screen.getByRole("link", { name: /Open the new Google Slides deck/ })).toBeInTheDocument());
  });

  it("Send to Google Slides — user cancels the re-consent popup — shows an error, not a silent hang", async () => {
    openPlaceholderPopup.mockReturnValue({ close: vi.fn() } as unknown as Window);
    runConsentInPopup.mockResolvedValue(false);
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/google/drive-folder": () => ({ ok: true, json: async () => ({ folder: null }) }),
        "/api/google/slides-token-status": () => ({ ok: true, json: async () => ({ ok: false }) }),
      }),
    );

    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Executive slide" }));
    fireEvent.click(screen.getByRole("radio", { name: "Send to Google Slides" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to Slides" }));

    await waitFor(() => expect(screen.getByText(/cancelled/i)).toBeInTheDocument());
  });

  it("Send to Google Slides — no remembered folder — opens the Drive Picker before exporting", async () => {
    openPlaceholderPopup.mockReturnValue({ close: vi.fn() } as unknown as Window);
    openDrivePicker.mockResolvedValue({ folderId: "picked-1", folderName: "Picked Folder" });
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/google/drive-folder": () => ({ ok: true, json: async () => ({ folder: null }) }),
        "/api/google/slides-token-status": () => ({ ok: true, json: async () => ({ ok: true }) }),
        "/api/google/access-token": () => ({ ok: true, json: async () => ({ accessToken: "tok" }) }),
        "/api/google/slides-export": () => ({ ok: true, json: async () => ({ presentationUrl: "https://docs.google.com/presentation/d/new/edit" }) }),
      }),
    );

    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Executive slide" }));
    fireEvent.click(screen.getByRole("radio", { name: "Send to Google Slides" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to Slides" }));

    await waitFor(() => expect(openDrivePicker).toHaveBeenCalledWith("tok"));
    await waitFor(() => expect(screen.getByRole("link", { name: /Open the new Google Slides deck/ })).toBeInTheDocument());
  });

  it("Save Export Snapshot — posts serialized selection (arrays, not Sets) and the built IR, then shows a success message", async () => {
    let postedBody: { selection: { individualBaselineProgramIds: unknown; scenarioProgramProgramIds: unknown }; slides: unknown[] } | null = null;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/snapshots") && init?.body) {
        postedBody = JSON.parse(String(init.body));
        return { ok: true, json: async () => ({ snapshotId: "snap-1" }) } as Response;
      }
      return { ok: false } as Response;
    });

    const { onClose } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Executive slide" }));
    fireEvent.click(screen.getByRole("radio", { name: "Save Export Snapshot" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Export Snapshot" }));

    await waitFor(() => expect(screen.getByText("Export Snapshot saved.")).toBeInTheDocument());
    expect(postedBody).not.toBeNull();
    expect(Array.isArray(postedBody!.selection.individualBaselineProgramIds)).toBe(true);
    expect(Array.isArray(postedBody!.selection.scenarioProgramProgramIds)).toBe(true);
    expect(Array.isArray(postedBody!.slides)).toBe(true);
    expect(postedBody!.slides.length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Save Export Snapshot — non-ok response shows the error text instead of a silent failure", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/snapshots": () => ({ ok: false, json: async () => ({ error: "No edit access to this Portfolio." }) }),
      }),
    );

    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Executive slide" }));
    fireEvent.click(screen.getByRole("radio", { name: "Save Export Snapshot" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Export Snapshot" }));

    await waitFor(() => expect(screen.getByText("No edit access to this Portfolio.")).toBeInTheDocument());
  });
});
