import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Portfolio, Program } from "@/components/timeline/types";

const useSessionMock = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
}));

const routerPushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ portfolioId: "portfolio-1" }),
  // The Programs picker (wayframe#144) navigates rather than filtering in
  // place, so this page now uses the router.
  useRouter: () => ({ push: routerPushMock }),
}));

// AuthControls pulls in a real sign-in/out button tied to next-auth — this
// page's own tests only care about the All-Programs content below it, same
// "mock the chrome, not the thing under test" scoping RoadmapWorkspace's
// own tests use for adjacent chrome.
vi.mock("@/components/auth/AuthControls", () => ({ AuthControls: () => null }));

// The room layer, stubbed (wayframe#126): this page now connects one live
// Yjs room per Program, and a real `useProgramRoom` would open N websockets
// to a Partykit host that doesn't exist under vitest. Every box still
// behaves exactly as it does in production — the room is the piece that
// syncs a box to a server, not the piece that makes it editable — so
// stubbing it leaves the editing behaviour these tests are about fully
// intact. The hook's own behaviour has its own tests
// (src/lib/realtime/use-program-room.test.ts).
vi.mock("@/lib/realtime/use-program-room", () => ({
  useProgramRoom: () => ({ status: "connected", showOfflineBadge: false, peers: [] }),
}));

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
  useSessionMock.mockReturnValue({ status: "authenticated", data: { user: { name: "Test User", email: "test@example.com" } } });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function rail() {
  return screen.getByRole("complementary", { name: "Programs in this Roadmap" });
}

function marker(mergedId: string): Element | null {
  return document.querySelector(`[data-testid="marker-glyph-${mergedId}"]`);
}

async function renderPage(role: "owner" | "editor" | "viewer" = "editor", { openRail = true } = {}) {
  fetchMock.mockResolvedValueOnce(allProgramsResponse(role));
  const { default: AllProgramsPage } = await import("./page");
  render(<AllProgramsPage />);
  await waitFor(() => expect(screen.getByTestId("roadmap-timeline")).toBeInTheDocument());
  // Each Program publishes its box one commit after mount; the canvas is
  // only whole once both have.
  await waitFor(() => expect(marker("program-B::m1")).not.toBeNull());
  // The rail starts collapsed since wayframe#144 — every test below that is
  // about the rail's contents opens it first, which is the one click a real
  // user makes to reach them.
  if (openRail) fireEvent.click(screen.getByRole("button", { name: "Open the Programs rail" }));
}

describe("AllProgramsPage — the Program rail (wayframe#126, #125's Variant B)", () => {
  it("lists every Program in the Roadmap, with the first card expanded as the structure editor", async () => {
    await renderPage("editor");
    expect(within(rail()).getByText("Program Alpha")).toBeInTheDocument();
    expect(within(rail()).getByText("Program Beta")).toBeInTheDocument();
    // The expanded card IS the selected tab — there are no tabs.
    expect(screen.getAllByRole("link", { name: "Open on its own" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Open on its own" })[0]).toHaveAttribute("href", "/p/portfolio-1?programId=program-A");
  });

  it("collapses one Program's band on the canvas without touching the other's, and independently of which card is expanded", async () => {
    await renderPage("editor");
    expect(marker("program-A::m1")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Program Alpha's band on the canvas" }));

    await waitFor(() => expect(marker("program-A::m1")).toBeNull());
    expect(marker("program-B::m1")).not.toBeNull();
    // Collapse didn't close the card: its lanes are still editable.
    expect(screen.getByRole("button", { name: "+ Lane" })).toBeInTheDocument();
  });

  it("renames a lane through the owning Program's own live box", async () => {
    await renderPage("editor");
    fireEvent.change(screen.getByLabelText("Name of Lane 1"), { target: { value: "Delivery" } });
    await waitFor(() => expect(screen.getByLabelText("Name of Delivery")).toBeInTheDocument());
  });

  it("gives a viewer no structure editing at all", async () => {
    await renderPage("viewer");
    // The first card is expanded by default — for a viewer it says why it's empty.
    expect(screen.getByText("You have view-only access to this Roadmap.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Lane" })).not.toBeInTheDocument();
  });
});

describe("AllProgramsPage — the docked inspector and cross-Program move (wayframe#126/#124)", () => {
  it("opens the inspector against the owning Program's OWN document, with the move control as its first line", async () => {
    await renderPage("editor");

    fireEvent.click(marker("program-A::m1")!);

    expect(await screen.findByRole("complementary", { name: "Milestone editor" })).toBeInTheDocument();
    expect(screen.getByText(/Currently in/)).toHaveTextContent("Currently in Program Alpha / Lane 1");
    // The destination list offers the sibling Program, never the one it's already in.
    const destinations = Array.from(screen.getByLabelText("Move to Program").querySelectorAll("option")).map((o) => o.textContent);
    expect(destinations).toEqual(["Stay in Program Alpha", "Program Beta"]);
  });

  it("moves a milestone into another Program: it leaves the source band and arrives in the destination under a new id", async () => {
    await renderPage("editor");
    fireEvent.click(marker("program-A::m1")!);

    fireEvent.change(await screen.findByLabelText("Move to Program"), { target: { value: "program-B" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to Program Beta" }));

    await waitFor(() => expect(marker("program-A::m1")).toBeNull());
    // #124 mints a fresh, storage-durable id in the destination Program, so
    // the arrival is asserted by count rather than by the old id.
    await waitFor(() => expect(document.querySelectorAll('[data-testid^="marker-glyph-program-B::"]')).toHaveLength(2));
    // The inspector closed rather than pointing at an id that no longer exists.
    expect(screen.queryByRole("complementary", { name: "Milestone editor" })).not.toBeInTheDocument();
  });

  it("closes the inspector without applying anything when Cancel is pressed", async () => {
    await renderPage("editor");
    fireEvent.click(marker("program-A::m1")!);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("complementary", { name: "Milestone editor" })).not.toBeInTheDocument();
    expect(marker("program-A::m1")).not.toBeNull();
  });
});

describe("AllProgramsPage — cross-Program bulk edit (wayframe#t33 fork 3, live since #126)", () => {
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
    expect(screen.getByRole("button", { name: /Select mode/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(marker("program-A::m1")!);
    fireEvent.click(marker("program-B::m1")!);

    expect(screen.getByText("2 selected across 2 Programs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Set property…" }));
    const optionLabels = Array.from(screen.getByLabelText("Set property to").querySelectorAll("option")).map((o) => o.textContent);
    expect(optionLabels).not.toContain("Lane");
    expect(optionLabels).not.toContain("Lane row");
    expect(optionLabels).toContain("Status");
  });

  it("applies through each Program's own live box — no REST round-trip, and the canvas updates in place", async () => {
    await renderPage("editor");

    fireEvent.click(screen.getByRole("button", { name: /Select mode/ }));
    fireEvent.click(marker("program-A::m1")!);
    fireEvent.click(marker("program-B::m1")!);

    // The toolbar's own Delete (the rail has per-lane ✕ buttons labelled "Delete <lane>").
    const toolbar = screen.getByText("2 selected across 2 Programs").parentElement!;
    fireEvent.click(within(toolbar).getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete (2)" }));

    // Both Programs' documents actually changed, which is what the old REST
    // path could not do while a room held the live doc (see the page's own
    // header) — and the merged canvas is rendering those documents.
    await waitFor(() => expect(marker("program-A::m1")).toBeNull());
    expect(marker("program-B::m1")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/programs/bulk-patch"))).toBe(false);
    await waitFor(() => expect(screen.queryByText(/selected across/)).not.toBeInTheDocument());
  });
});

describe("AllProgramsPage — New Program (wayframe UX-2026-09-18 §7)", () => {
  it("shows a '+ New Program' button for an editor", async () => {
    await renderPage("editor");
    expect(screen.getByRole("button", { name: "+ New Program" })).toBeInTheDocument();
  });

  it("hides '+ New Program' for a viewer", async () => {
    await renderPage("viewer");
    expect(screen.queryByRole("button", { name: "+ New Program" })).not.toBeInTheDocument();
  });

  it("POSTs a schema-complete empty document and refetches, leaving the new Program in the rail rather than navigating away", async () => {
    await renderPage("editor");

    fireEvent.click(screen.getByRole("button", { name: "+ New Program" }));
    fireEvent.change(screen.getByLabelText("New Program name"), { target: { value: "Q3 Launch" } });

    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ programId: "program-new-1" }) });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          role: "editor",
          portfolio: portfolio(),
          programs: [programA(), programB(), { ...programA(), id: "program-new-1", order: 2, programName: "Q3 Launch", swimlanes: [], milestones: [] }],
        }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(within(rail()).getByText("Q3 Launch")).toBeInTheDocument());

    const extractCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/programs/extract"));
    expect(extractCall).toBeDefined();
    const body = JSON.parse(extractCall![1].body as string);
    expect(body.document.programName).toBe("Q3 Launch");
    expect(body.document.owner).toBe("Test User");
    // Every Program field the extract route's spread doesn't otherwise supply must be real, not omitted.
    expect(body.document).toMatchObject({ bluf: { statement: "", bullets: [] }, actionItems: [], swimlanes: [], topLevelItems: [], milestones: [] });
    expect(typeof body.document.generatedAt).toBe("string");
  });

  it("shows an inline error when the extract route fails", async () => {
    await renderPage("editor");

    fireEvent.click(screen.getByRole("button", { name: "+ New Program" }));
    fireEvent.change(screen.getByLabelText("New Program name"), { target: { value: "Q3 Launch" } });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: () => Promise.resolve({ error: "No edit access to this Roadmap." }) });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.getByText("No edit access to this Roadmap.")).toBeInTheDocument());
  });
});

describe("AllProgramsPage — Version History (wayframe#128, #127's Variant B)", () => {
  const savedAt = "2026-09-18T14:14:00Z";

  function versionSummary() {
    return { id: "ver-1", creatorIdentity: "user-1", creatorName: "Priya N.", createdAt: savedAt, label: null, programCount: 2, milestoneCount: 2 };
  }

  /** The same two Programs as the live document, except Alpha's milestone was a different one back then — the one fact that makes the canvas swap visible. */
  function versionPrograms(): Program[] {
    const a = programA();
    return [{ ...a, milestones: [{ ...a.milestones[0], id: "m-old", title: "Alpha Charter" }] }, programB()];
  }

  /** Routes every request the dock makes; anything else keeps the page's own "not handled" shape. */
  function serveVersions(overrides: { save?: () => unknown } = {}) {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/versions") && init?.method === "POST") {
        return Promise.resolve(overrides.save?.() ?? { ok: true, json: () => Promise.resolve({ versionId: "ver-2" }) });
      }
      if (u.endsWith("/versions")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ versions: [versionSummary()] }) });
      if (u.endsWith("/versions/ver-1")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: { ...versionSummary(), programs: versionPrograms() } }) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: `unhandled ${u}` }) });
    });
  }

  function dock() {
    return screen.queryByRole("complementary", { name: "Version history" });
  }

  async function openHistory(role: "owner" | "editor" | "viewer" = "editor") {
    await renderPage(role);
    serveVersions();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    // The row's own summary line, rather than its saved-at heading — the
    // heading renders in the runner's local timezone.
    await waitFor(() => expect(screen.getByText("2 Programs · 2 milestones")).toBeInTheDocument());
  }

  it("keeps the dock closed by default — it costs the canvas nothing until asked for", async () => {
    await renderPage("editor");
    expect(dock()).toBeNull();
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
  });

  it("selecting a Version swaps the canvas in place, leaving the list on screen", async () => {
    await openHistory("editor");
    expect(marker("program-A::m1")).not.toBeNull();

    fireEvent.click(screen.getByText("2 Programs · 2 milestones"));

    await waitFor(() => expect(marker("program-A::m-old")).not.toBeNull());
    expect(marker("program-A::m1")).toBeNull();
    // Beta was unchanged in that Version, and is still drawn beside Alpha.
    expect(marker("program-B::m1")).not.toBeNull();
    // The list is still there — comparing is the point.
    expect(dock()).not.toBeNull();
    expect(screen.getByText(/Read-only — Version of/)).toBeInTheDocument();
  });

  it("withholds editing while a Version is on screen, on the canvas and in the rail", async () => {
    await openHistory("editor");
    fireEvent.click(screen.getByText("2 Programs · 2 milestones"));
    await waitFor(() => expect(marker("program-A::m-old")).not.toBeNull());

    expect(screen.queryByRole("button", { name: /^Select mode/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Lane" })).not.toBeInTheDocument();
    expect(screen.getByText("Reading a saved Version — the live document is untouched.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ New Program" })).not.toBeInTheDocument();

    // A click on a marker opens nothing: the callback isn't wired at all.
    fireEvent.click(marker("program-A::m-old")!);
    expect(screen.queryByRole("complementary", { name: "Milestone editor" })).not.toBeInTheDocument();
  });

  it("band collapse still works while reading a Version — it's viewer-local, not document content", async () => {
    await openHistory("editor");
    fireEvent.click(screen.getByText("2 Programs · 2 milestones"));
    await waitFor(() => expect(marker("program-A::m-old")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Collapse Program Alpha's band on the canvas" }));

    await waitFor(() => expect(marker("program-A::m-old")).toBeNull());
    expect(marker("program-B::m1")).not.toBeNull();
  });

  it("the pinned Live row, and closing the dock, both return to the live document", async () => {
    await openHistory("editor");
    fireEvent.click(screen.getByText("2 Programs · 2 milestones"));
    await waitFor(() => expect(marker("program-A::m-old")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Live document/ }));
    await waitFor(() => expect(marker("program-A::m1")).not.toBeNull());
    expect(dock()).not.toBeNull();

    fireEvent.click(screen.getByText("2 Programs · 2 milestones"));
    await waitFor(() => expect(marker("program-A::m-old")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Close version history" }));
    await waitFor(() => expect(marker("program-A::m1")).not.toBeNull());
    expect(dock()).toBeNull();
  });

  it("saving posts no document of its own and returns to live even from a read-only view", async () => {
    await openHistory("editor");
    fireEvent.click(screen.getByText("2 Programs · 2 milestones"));
    await waitFor(() => expect(marker("program-A::m-old")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Save a version" }));

    await waitFor(() => expect(marker("program-A::m1")).not.toBeNull());
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(String(post![0])).toContain("/versions");
    // Nothing client-sent decides a Version's content — the server reads the Programs itself.
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({});
  });

  it("the dock and the inspector share one slot: opening the inspector closes the dock", async () => {
    await openHistory("editor");
    expect(dock()).not.toBeNull();

    fireEvent.click(marker("program-A::m1")!);

    await waitFor(() => expect(screen.getByRole("complementary", { name: "Milestone editor" })).toBeInTheDocument());
    expect(dock()).toBeNull();
  });

  it("lets a viewer read a Version but never save one", async () => {
    await openHistory("viewer");
    expect(screen.queryByRole("button", { name: "Save a version" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("2 Programs · 2 milestones"));
    await waitFor(() => expect(marker("program-A::m-old")).not.toBeNull());
  });
});

describe("AllProgramsPage — the collapsible rail and the Programs picker (wayframe#144/#150)", () => {
  it("starts with the rail collapsed, giving the canvas the width until it's asked for", async () => {
    await renderPage("editor", { openRail: false });
    // The strip is still there and still says how many Programs there are —
    // it just isn't charging 320px for the card list.
    expect(within(rail()).queryByText("Program Alpha")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the Programs rail" })).toBeInTheDocument();
  });

  it("opens and closes the rail from an obvious control in either state", async () => {
    await renderPage("editor", { openRail: false });
    fireEvent.click(screen.getByRole("button", { name: "Open the Programs rail" }));
    expect(within(rail()).getByText("Program Alpha")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close the Programs rail" }));
    expect(within(rail()).queryByText("Program Alpha")).not.toBeInTheDocument();
  });

  it("offers every Program plus All Programs in one picker, with All Programs selected here", async () => {
    await renderPage("editor", { openRail: false });
    const picker = screen.getByLabelText("Program");
    expect(picker).toHaveValue("all");
    expect(within(picker).getByRole("option", { name: "All Programs" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "Program Alpha" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "Program Beta" })).toBeInTheDocument();
  });

  it("navigates to the chosen Program instead of showing a link that goes somewhere else (#150)", async () => {
    await renderPage("editor", { openRail: false });
    routerPushMock.mockClear();
    fireEvent.change(screen.getByLabelText("Program"), { target: { value: "program-B" } });
    expect(routerPushMock).toHaveBeenCalledWith("/p/portfolio-1?programId=program-B");
    // And the link that claimed to go "Back to Roadmap" — while going to one
    // Program — is gone.
    expect(screen.queryByRole("link", { name: /Back to Roadmap/ })).not.toBeInTheDocument();
  });

  it("keeps the cross-Program rollup off the editing canvas, showing it in the Executive reading instead (#144)", async () => {
    await renderPage("editor", { openRail: false });
    expect(screen.queryByText("Roadmap")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Executive" }));
    expect(await screen.findByText("Roadmap")).toBeInTheDocument();
    // The editing canvas is not on screen in the Executive reading.
    expect(screen.queryByTestId("roadmap-timeline")).not.toBeInTheDocument();
  });
});
