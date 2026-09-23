import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotsPanel } from "./SnapshotsPanel";
import type { PortfolioSnapshotSummary } from "@/lib/db/snapshots";

const exportNativeDeckFromSlides = vi.fn<(slides: unknown[], fileName: string) => Promise<void>>(() => Promise.resolve());
vi.mock("@/lib/export/export-native-deck", () => ({
  exportNativeDeckFromSlides: (...args: [unknown[], string]) => exportNativeDeckFromSlides(...args),
}));

function fakeSummary(overrides: Partial<PortfolioSnapshotSummary> = {}): PortfolioSnapshotSummary {
  return {
    id: "snap-1",
    creatorIdentity: "user-1",
    createdAt: "2026-01-01T12:00:00Z",
    selection: {
      executive: true,
      combinedBaseline: false,
      individualBaseline: false,
      individualBaselineProgramIds: [],
      scenarioId: null,
      scenarioCombined: false,
      scenarioProgram: false,
      scenarioProgramProgramIds: [],
    },
    ...overrides,
  };
}

function mockFetch(handlers: Record<string, () => Promise<Partial<Response>> | Partial<Response>>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [substr, handler] of Object.entries(handlers)) {
      if (url.includes(substr)) return handler();
    }
    return { ok: false } as Response;
  }) as unknown as typeof fetch;
}

describe("SnapshotsPanel (t31)", () => {
  beforeEach(() => {
    exportNativeDeckFromSlides.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the fetched list with creator/date/section-summary text", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/portfolios/p1/snapshots": () => ({ ok: true, json: async () => ({ snapshots: [fakeSummary()] }) }),
      }),
    );

    render(<SnapshotsPanel portfolioId="p1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("user-1")).toBeInTheDocument());
    expect(screen.getByText("Executive")).toBeInTheDocument();
  });

  it("shows an empty-state message when the list is empty", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/portfolios/p1/snapshots": () => ({ ok: true, json: async () => ({ snapshots: [] }) }),
      }),
    );

    render(<SnapshotsPanel portfolioId="p1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("No Export Snapshots saved yet.")).toBeInTheDocument());
    // No onCreate passed here — the fast-path button must not appear unprompted.
    expect(screen.queryByRole("button", { name: "Save Export Snapshot ›" })).not.toBeInTheDocument();
  });

  it("wayframe UX-2026-09-18 §8 — the empty state's 'Save Export Snapshot ›' button calls onCreate when provided", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/portfolios/p1/snapshots": () => ({ ok: true, json: async () => ({ snapshots: [] }) }),
      }),
    );
    const onCreate = vi.fn();

    render(<SnapshotsPanel portfolioId="p1" onClose={vi.fn()} onCreate={onCreate} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save Export Snapshot ›" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save Export Snapshot ›" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("Download .pptx fetches the single snapshot then recompiles it via exportNativeDeckFromSlides", async () => {
    const fakeSlides = [[{ id: "shape-1", kind: "rect", x: 0, y: 0, w: 1, h: 1 }]];
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/portfolios/p1/snapshots/snap-1": () => ({ ok: true, json: async () => ({ snapshot: { ...fakeSummary(), slides: fakeSlides } }) }),
        "/api/portfolios/p1/snapshots": () => ({ ok: true, json: async () => ({ snapshots: [fakeSummary()] }) }),
      }),
    );

    render(<SnapshotsPanel portfolioId="p1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download .pptx" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Download .pptx" }));

    await waitFor(() => expect(exportNativeDeckFromSlides).toHaveBeenCalledTimes(1));
    const [slides] = exportNativeDeckFromSlides.mock.calls[0];
    expect(slides).toEqual(fakeSlides);
  });
});
