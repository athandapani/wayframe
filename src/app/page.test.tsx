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
type MockSession = { data: { user: { email?: string; name?: string } } | null; status: "authenticated" | "unauthenticated" };
const useSessionMock = vi.fn<() => MockSession>(() => ({ data: null, status: "unauthenticated" }));
vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// MyRoadmapsLanding (rendered for an authenticated visitor, wayframe#123)
// calls useRouter — not otherwise mounted in this file's plain `render()`.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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

describe("Home — a signed-in visitor lands on My Roadmaps (wayframe#123, superseding the old hard-coded 'Open my hosted Portfolio' link found 2026-09-19)", () => {
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
  });

  it("still shows the entry form, not My Roadmaps, when signed out", async () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Build your roadmap" })).toBeInTheDocument());
  });

  it("shows the signed-in visitor's Roadmaps instead of the entry form once /api/roadmaps resolves", async () => {
    useSessionMock.mockReturnValue({ data: { user: { email: "a@b.com" } }, status: "authenticated" });
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/roadmaps": () => ({
          ok: true,
          json: async () => ({
            roadmaps: [
              {
                id: "portfolio-owned-1",
                title: "My Roadmap",
                role: "owner",
                programCount: 1,
                memberCount: 1,
                updatedAt: "2026-01-01T00:00:00Z",
              },
            ],
          }),
        }),
      }),
    );
    render(<Home />);
    // "My Roadmap" is the only Roadmap returned, so it's auto-selected —
    // its title renders both in the sidebar row and the detail pane's
    // heading; assert via the (unambiguous) heading.
    await waitFor(() => expect(screen.getByRole("heading", { name: "My Roadmap" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Build your roadmap" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
