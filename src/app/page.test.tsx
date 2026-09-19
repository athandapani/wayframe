import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Portfolio, PortfolioDocument, Program } from "@/components/timeline/types";
import { SessionProviderWrapper } from "@/components/auth/SessionProviderWrapper";
import Home from "./page";

const STORAGE_KEY = "wayframe:document";

// Mocked so a later describe block can drive an authenticated session
// without a real network round-trip; defaults every existing test below to
// the same "unauthenticated" state the real (un-mocked) SessionProvider
// already produced in jsdom with no session cookie, so their behavior is
// unchanged. `SessionProviderWrapper` itself becomes a passthrough — its
// only job was making `SessionProvider` available, which is now mocked out.
const useSessionMock = vi.fn(() => ({ data: null, status: "unauthenticated" as const }));
vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

function basePortfolio(): Portfolio {
  return { id: "portfolio-1", schemaVersion: 2 };
}

function baseData(): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test Program",
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

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
  });

  it("shows the entry form when no roadmap is saved", async () => {
    render(
      <SessionProviderWrapper>
        <Home />
      </SessionProviderWrapper>,
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Build your roadmap" })).toBeInTheDocument();
    });
  });

  it("lands back in the saved roadmap when one already exists in localStorage", async () => {
    const document: PortfolioDocument = { portfolio: basePortfolio(), programs: [baseData()] };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    render(
      <SessionProviderWrapper>
        <Home />
      </SessionProviderWrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText("Everything is on track.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Build your roadmap" })).not.toBeInTheDocument();
  });
});

describe("Home — link to a signed-in user's hosted Portfolio (found 2026-09-19: useMigrateLocalPortfolioOnSignIn migrated a local document into a hosted Portfolio, but nothing ever surfaced a link to it)", () => {
  function mockFetch(handlers: Record<string, () => Promise<Partial<Response>> | Partial<Response>>) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [substr, handler] of Object.entries(handlers)) {
        if (url.includes(substr)) return handler();
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    window.localStorage.clear();
    // Suppresses the local->hosted migration POST (irrelevant to this
    // describe block) so the fetch mock only needs to answer
    // /api/portfolios/mine.
    window.localStorage.setItem("wayframe:portfolio-migrated", "portfolio-owned-1");
  });

  it("shows no link when signed out", async () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Build your roadmap" })).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Open my hosted Portfolio/ })).not.toBeInTheDocument();
  });

  it("shows no link when signed in but the visitor owns no Portfolio yet", async () => {
    useSessionMock.mockReturnValue({ data: { user: { email: "a@b.com" } }, status: "authenticated" });
    vi.stubGlobal("fetch", mockFetch({ "/api/portfolios/mine": () => ({ ok: true, json: async () => ({ portfolioId: null }) }) }));
    render(<Home />);
    await waitFor(() => expect(screen.getByText("a@b.com")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Open my hosted Portfolio/ })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("links straight to /p/{portfolioId} once ownedPortfolioId resolves, for a signed-in owner", async () => {
    useSessionMock.mockReturnValue({ data: { user: { email: "a@b.com" } }, status: "authenticated" });
    vi.stubGlobal("fetch", mockFetch({ "/api/portfolios/mine": () => ({ ok: true, json: async () => ({ portfolioId: "portfolio-owned-1" }) }) }));
    render(<Home />);
    const link = await screen.findByRole("link", { name: /Open my hosted Portfolio/ });
    expect(link).toHaveAttribute("href", "/p/portfolio-owned-1");
    vi.unstubAllGlobals();
  });
});
