import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VersionHistoryDock, describeCounts } from "./VersionHistoryDock";
import type { PortfolioVersion, PortfolioVersionSummary } from "@/lib/db/versions";

function fakeSummary(overrides: Partial<PortfolioVersionSummary> = {}): PortfolioVersionSummary {
  return {
    id: "v1",
    creatorIdentity: "user-1",
    creatorName: "Priya N.",
    createdAt: "2026-09-18T14:14:00Z",
    label: null,
    programCount: 3,
    milestoneCount: 40,
    ...overrides,
  };
}

function fakeVersion(overrides: Partial<PortfolioVersion> = {}): PortfolioVersion {
  return { ...fakeSummary(), programs: [], ...overrides };
}

function mockFetch(handlers: { match: string; method?: string; respond: () => Partial<Response> }[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    for (const handler of handlers) {
      if (url.includes(handler.match) && (handler.method ?? "GET") === method) return handler.respond();
    }
    return { ok: false, json: async () => ({ error: `unhandled ${method} ${url}` }) } as Response;
  }) as unknown as typeof fetch;
}

const listUrl = "/api/portfolios/p1/versions";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("describeCounts (wayframe#128)", () => {
  it("states absolute counts for the oldest Version, which has nothing to compare against", () => {
    expect(describeCounts(fakeSummary({ programCount: 3, milestoneCount: 40 }), undefined)).toBe("3 Programs · 40 milestones");
  });

  it("states signed deltas against the Version saved before it", () => {
    const previous = fakeSummary({ programCount: 3, milestoneCount: 38 });
    expect(describeCounts(fakeSummary({ programCount: 3, milestoneCount: 40 }), previous)).toBe("+2 milestones");
    expect(describeCounts(fakeSummary({ programCount: 4, milestoneCount: 37 }), previous)).toBe("+1 Program · −1 milestone");
  });

  it("never claims 'no change' from counts alone — counts can't see a moved date", () => {
    const previous = fakeSummary({ programCount: 3, milestoneCount: 40 });
    expect(describeCounts(fakeSummary({ programCount: 3, milestoneCount: 40 }), previous)).toBe("40 milestones · no change in counts");
  });
});

describe("VersionHistoryDock (wayframe#128)", () => {
  it("pins 'Live document' as the first row, selected while no Version is being read", async () => {
    vi.stubGlobal("fetch", mockFetch([{ match: listUrl, respond: () => ({ ok: true, json: async () => ({ versions: [fakeSummary()] }) }) }]));

    render(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId={null} onViewVersion={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Priya N.", { exact: false })).toBeInTheDocument());
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Live document");
    expect(screen.getByRole("button", { name: /Live document/ })).toHaveAttribute("aria-current", "true");
  });

  it("selecting a row fetches that Version's full documents and reports them up", async () => {
    const version = fakeVersion({ programs: [{ id: "prog-1" }] as unknown as PortfolioVersion["programs"] });
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { match: `${listUrl}/v1`, respond: () => ({ ok: true, json: async () => ({ version }) }) },
        { match: listUrl, respond: () => ({ ok: true, json: async () => ({ versions: [fakeSummary()] }) }) },
      ]),
    );
    const onViewVersion = vi.fn();

    render(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId={null} onViewVersion={onViewVersion} onClose={vi.fn()} />);

    // Clicked via the row's change-summary line rather than its saved-at
    // heading: the heading renders in the runner's local timezone, which would
    // make this assertion machine-dependent.
    await waitFor(() => expect(screen.getByText("3 Programs · 40 milestones")).toBeInTheDocument());
    fireEvent.click(screen.getByText("3 Programs · 40 milestones"));

    await waitFor(() => expect(onViewVersion).toHaveBeenCalledWith(version));
  });

  it("the pinned Live row reports null — entering and leaving read-only are the same click", async () => {
    vi.stubGlobal("fetch", mockFetch([{ match: listUrl, respond: () => ({ ok: true, json: async () => ({ versions: [fakeSummary()] }) }) }]));
    const onViewVersion = vi.fn();

    render(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId="v1" onViewVersion={onViewVersion} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Live document/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Live document/ }));
    expect(onViewVersion).toHaveBeenCalledWith(null);
  });

  it("saving posts with no document body, returns to live, and drops the new row into its rename field", async () => {
    const fetchMock = mockFetch([
      { match: listUrl, method: "POST", respond: () => ({ ok: true, json: async () => ({ versionId: "v2" }) }) },
      { match: listUrl, respond: () => ({ ok: true, json: async () => ({ versions: [fakeSummary({ id: "v2" })] }) }) },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const onViewVersion = vi.fn();

    render(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId="v1" onViewVersion={onViewVersion} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Save a version" }));

    // A save always captures the LIVE document, even while reading an old
    // Version — so it also returns you there.
    await waitFor(() => expect(onViewVersion).toHaveBeenCalledWith(null));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Name this version" })).toBeInTheDocument());

    const post = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    // The server reads the Programs for itself — nothing client-sent decides a Version's content.
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({});
  });

  it("renaming PATCHes the label only, and shows the new name straight away", async () => {
    const fetchMock = mockFetch([
      { match: `${listUrl}/v1`, method: "PATCH", respond: () => ({ ok: true, json: async () => ({ ok: true }) }) },
      { match: listUrl, respond: () => ({ ok: true, json: async () => ({ versions: [fakeSummary()] }) }) },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId="v1" onViewVersion={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Name this version" });
    fireEvent.change(input, { target: { value: "  Board review  " } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByText("Board review")).toBeInTheDocument());
    const patch = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PATCH");
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ label: "Board review" });
  });

  it("offers no save or rename to a viewer, who can still read every Version", async () => {
    vi.stubGlobal("fetch", mockFetch([{ match: listUrl, respond: () => ({ ok: true, json: async () => ({ versions: [fakeSummary()] }) }) }]));

    render(<VersionHistoryDock portfolioId="p1" canEdit={false} viewingVersionId="v1" onViewVersion={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("3 Programs · 40 milestones")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save a version" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
  });

  it("↑/↓ steps through the rows, because comparing is the point of keeping the list on screen", async () => {
    const v1 = fakeVersion({ id: "v1" });
    const v2 = fakeVersion({ id: "v2", createdAt: "2026-09-19T09:00:00Z" });
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { match: `${listUrl}/v2`, respond: () => ({ ok: true, json: async () => ({ version: v2 }) }) },
        { match: `${listUrl}/v1`, respond: () => ({ ok: true, json: async () => ({ version: v1 }) }) },
        { match: listUrl, respond: () => ({ ok: true, json: async () => ({ versions: [fakeSummary({ id: "v2" }), fakeSummary({ id: "v1" })] }) }) },
      ]),
    );
    const onViewVersion = vi.fn();

    const { rerender } = render(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId={null} onViewVersion={onViewVersion} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));

    // Row 0 is Live, so ArrowDown from live lands on the newest Version…
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() => expect(onViewVersion).toHaveBeenLastCalledWith(v2));

    // …and again steps one further back in time.
    rerender(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId="v2" onViewVersion={onViewVersion} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() => expect(onViewVersion).toHaveBeenLastCalledWith(v1));

    // ArrowUp walks back toward Live and stops there rather than wrapping.
    rerender(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId="v1" onViewVersion={onViewVersion} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "ArrowUp" });
    await waitFor(() => expect(onViewVersion).toHaveBeenLastCalledWith(v2));
  });

  it("surfaces a failed list read instead of rendering as empty", async () => {
    vi.stubGlobal("fetch", mockFetch([{ match: listUrl, respond: () => ({ ok: false, json: async () => ({ error: "No access to this Roadmap." }) }) }]));

    render(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId={null} onViewVersion={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("No access to this Roadmap.")).toBeInTheDocument());
  });

  it("says so when nothing has been saved yet", async () => {
    vi.stubGlobal("fetch", mockFetch([{ match: listUrl, respond: () => ({ ok: true, json: async () => ({ versions: [] }) }) }]));

    render(<VersionHistoryDock portfolioId="p1" canEdit viewingVersionId={null} onViewVersion={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("No Versions saved yet.")).toBeInTheDocument());
  });
});
