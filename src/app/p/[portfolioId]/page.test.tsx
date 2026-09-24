import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioLandingPage from "./page";

const useSessionMock = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
}));

let searchParamsMock = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ portfolioId: "portfolio-1" }),
  // The Programs picker in the top strip (wayframe#144) navigates rather
  // than filtering in place, so this page now uses the router.
  useRouter: () => ({ push: vi.fn() }),
  // The page reads `programId`/`share` reactively from here since #144, so a
  // Program switch (a client-side push to this same route) actually reloads
  // the Program.
  useSearchParams: () => searchParamsMock,
}));

// This page's own tests only care about the empty-Portfolio behavior below
// — same "mock the chrome, not the thing under test" scoping the sibling
// /all page's tests already use for AuthControls.
vi.mock("@/components/auth/AuthControls", () => ({ AuthControls: () => null }));

function portfolio() {
  return { id: "portfolio-1", schemaVersion: 2 };
}

function program() {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Program 1",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [],
  };
}

/**
 * wayframe#123: a "+ New Roadmap" Portfolio has no Program yet, so
 * /view 404s with { error, role } until one is created. Covers only the
 * new EmptyPortfolioEntry behavior this ticket added — the page's other
 * states (guest/share-link flow, accept-invites) are pre-existing and
 * untouched here.
 */
describe("PortfolioLandingPage — empty Portfolio (wayframe#123)", () => {
  beforeEach(() => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "a@b.com" } }, status: "authenticated" });
  });

  it("offers EntryForm inline to an owner instead of a plain error, and loads the workspace once a Program is created", async () => {
    let viewCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/accept-invites")) return { ok: true, json: async () => ({}) } as Response;
        if (url.includes("/programs/extract")) {
          return { ok: true, json: async () => ({ programId: "program-1" }) } as Response;
        }
        if (url.includes("/view")) {
          viewCallCount += 1;
          if (viewCallCount === 1) {
            return { ok: false, json: async () => ({ error: "This Roadmap has no Program yet.", role: "owner" }) } as Response;
          }
          return { ok: true, json: async () => ({ role: "owner", portfolio: portfolio(), program: program() }) } as Response;
        }
        void init;
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );

    render(<PortfolioLandingPage />);

    const blankButton = await screen.findByRole("button", { name: /Start from a blank template/ });
    fireEvent.click(blankButton);

    await waitFor(() => expect(screen.queryByRole("button", { name: /Start from a blank template/ })).not.toBeInTheDocument());
    vi.unstubAllGlobals();
  });

  it("shows the plain error message (no EntryForm) to a viewer, who has nothing to create", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/accept-invites")) return { ok: true, json: async () => ({}) } as Response;
        if (url.includes("/view")) {
          return { ok: false, json: async () => ({ error: "This Roadmap has no Program yet.", role: "viewer" }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );

    render(<PortfolioLandingPage />);

    await waitFor(() => expect(screen.getByText("This Roadmap has no Program yet.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Start from a blank template/ })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("surfaces a create error inline rather than silently failing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/accept-invites")) return { ok: true, json: async () => ({}) } as Response;
        if (url.includes("/programs/extract")) {
          return { ok: false, json: async () => ({ error: "No edit access to this Roadmap." }) } as Response;
        }
        if (url.includes("/view")) {
          return { ok: false, json: async () => ({ error: "This Roadmap has no Program yet.", role: "owner" }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );

    render(<PortfolioLandingPage />);
    const blankButton = await screen.findByRole("button", { name: /Start from a blank template/ });
    fireEvent.click(blankButton);

    await waitFor(() => expect(screen.getByText("No edit access to this Roadmap.")).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});

describe("PortfolioLandingPage — which Program it loads (wayframe#144)", () => {
  beforeEach(() => {
    useSessionMock.mockReturnValue({ data: { user: { id: "user-1", email: "a@b.com" } }, status: "authenticated" });
    searchParamsMock = new URLSearchParams();
  });

  function stubView() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/accept-invites")) return { ok: true, json: async () => ({}) } as Response;
      return {
        ok: true,
        json: async () => ({
          role: "owner",
          portfolio: portfolio(),
          program: program(),
          programs: [
            { id: "program-1", programName: "Program 1" },
            { id: "program-2", programName: "Program 2" },
          ],
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("asks /view for the Program named in the URL, so the picker's switch actually changes what's on screen", async () => {
    // The regression: this page used to read the query string ONCE in a
    // mount effect, and the picker switches Program with a client-side push
    // to this same route — the URL changed, nothing remounted, and the page
    // kept showing the Program it first loaded.
    searchParamsMock = new URLSearchParams("programId=program-2");
    const fetchMock = stubView();
    render(<PortfolioLandingPage />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/view"))).toBe(true));
    const viewUrl = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/view"))!;
    expect(viewUrl).toContain("programId=program-2");
  });

  it("asks for no Program in particular when the URL names none, keeping /view's own first-Program default", async () => {
    const fetchMock = stubView();
    render(<PortfolioLandingPage />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/view"))).toBe(true));
    const viewUrl = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/view"))!;
    expect(viewUrl).not.toContain("programId=");
  });
});
