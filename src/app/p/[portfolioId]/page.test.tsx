import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioLandingPage from "./page";

const useSessionMock = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ portfolioId: "portfolio-1" }),
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
