import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Portfolio, Program } from "@/components/timeline/types";

const useSessionMock = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ portfolioId: "portfolio-1" }),
}));

// AuthControls pulls in a real sign-in/out button tied to next-auth — this
// page's own tests only care about the All-Programs content below it, same
// "mock the chrome, not the thing under test" scoping RoadmapWorkspace's
// own tests use for adjacent chrome.
vi.mock("@/components/auth/AuthControls", () => ({ AuthControls: () => null }));

function portfolio(): Portfolio {
  return { id: "portfolio-1", schemaVersion: 2 };
}

/** Two sibling Programs, each with a milestone sharing the SAME local id ("m1") — deliberately, to prove the merged canvas's namespaced ids keep a cross-Program selection unambiguous (see merge-programs.ts's own `namespaceId`/`splitNamespacedId`). */
function programA(): Program {
  return {
    id: "program-A",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Program Alpha",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner A",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [{ id: "m1", laneId: "lane-1", title: "Alpha Kickoff", date: "2026-01-05", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null }],
  };
}

function programB(): Program {
  return {
    id: "program-B",
    portfolioId: "portfolio-1",
    order: 1,
    programName: "Program Beta",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner B",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [{ id: "m1", laneId: "lane-1", title: "Beta Kickoff", date: "2026-02-05", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null }],
  };
}

function allProgramsResponse(role: "owner" | "editor" | "viewer") {
  return { ok: true, json: () => Promise.resolve({ role, portfolio: portfolio(), programs: [programA(), programB()] }) };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useSessionMock.mockReturnValue({ status: "authenticated" });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderPage(role: "owner" | "editor" | "viewer" = "editor") {
  fetchMock.mockResolvedValueOnce(allProgramsResponse(role));
  const { default: AllProgramsPage } = await import("./page");
  render(<AllProgramsPage />);
  await waitFor(() => expect(screen.getByTestId("roadmap-timeline")).toBeInTheDocument());
}

describe("AllProgramsPage — cross-Program bulk edit (wayframe#t33 fork 3)", () => {
  it("shows the Select-mode toggle for an editor", async () => {
    await renderPage("editor");
    expect(screen.getByRole("button", { name: /Select mode/ })).toBeInTheDocument();
  });

  it("shows the Select-mode toggle for an owner", async () => {
    await renderPage("owner");
    expect(screen.getByRole("button", { name: /Select mode/ })).toBeInTheDocument();
  });

  it("hides the Select-mode toggle for a viewer", async () => {
    await renderPage("viewer");
    expect(screen.queryByRole("button", { name: /Select mode/ })).not.toBeInTheDocument();
  });

  it("selecting a Milestone from each of two Programs produces a namespaced selection, and excludes laneId/laneRow from the field dropdown", async () => {
    await renderPage("editor");

    fireEvent.click(screen.getByRole("button", { name: /Select mode/ }));
    const toggle = screen.getByRole("button", { name: /Select mode/ });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(document.querySelector('[data-testid="marker-glyph-program-A::m1"]')!);
    fireEvent.click(document.querySelector('[data-testid="marker-glyph-program-B::m1"]')!);

    expect(screen.getByText("2 selected across 2 Programs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Set property…" }));
    const fieldSelect = screen.getByLabelText("Set property to");
    const optionLabels = Array.from(fieldSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionLabels).not.toContain("Lane");
    expect(optionLabels).not.toContain("Lane row");
    expect(optionLabels).toContain("Status");
  });

  it("apply POSTs the correctly-grouped-by-programId body and refetches on success", async () => {
    await renderPage("editor");

    fireEvent.click(screen.getByRole("button", { name: /Select mode/ }));
    fireEvent.click(document.querySelector('[data-testid="marker-glyph-program-A::m1"]')!);
    fireEvent.click(document.querySelector('[data-testid="marker-glyph-program-B::m1"]')!);

    fireEvent.click(screen.getByRole("button", { name: "Set property…" }));
    fireEvent.change(screen.getByLabelText("Set property to"), { target: { value: "status" } });
    fireEvent.change(screen.getByLabelText("Set status to"), { target: { value: "at-risk" } });

    // The DiffBanner preview is now showing — apply it.
    const applyButton = await screen.findByRole("button", { name: /^Apply/ });

    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });
    fetchMock.mockResolvedValueOnce(allProgramsResponse("editor"));

    fireEvent.click(applyButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3)); // initial GET + bulk-patch POST + refetch GET

    const bulkPatchCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/programs/bulk-patch"));
    expect(bulkPatchCall).toBeDefined();
    const [, init] = bulkPatchCall!;
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body.opsByProgram).sort()).toEqual(["program-A", "program-B"]);
    expect(body.opsByProgram["program-A"]).toEqual({ bulkPatchOps: [{ op: { field: "status", value: "at-risk" }, ids: ["m1"] }], deleteIds: [], acceptBaselineOps: [] });
    expect(body.opsByProgram["program-B"]).toEqual({ bulkPatchOps: [{ op: { field: "status", value: "at-risk" }, ids: ["m1"] }], deleteIds: [], acceptBaselineOps: [] });

    // Selection is cleared and the toolbar disappears once nothing is selected.
    await waitFor(() => expect(screen.queryByText(/selected across/)).not.toBeInTheDocument());
  });
});
