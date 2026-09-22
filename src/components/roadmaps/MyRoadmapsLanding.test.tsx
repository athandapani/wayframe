import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyRoadmapsLanding } from "./MyRoadmapsLanding";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function mockFetch(handlers: Record<string, (init?: RequestInit) => Promise<Partial<Response>> | Partial<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    for (const [substr, handler] of Object.entries(handlers)) {
      if (url.includes(substr)) return handler(init);
    }
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

const roadmapsResponse = {
  roadmaps: [
    { id: "owned-1", title: "Atlas Roadmap", role: "owner", programCount: 3, memberCount: 5, updatedAt: "2026-09-20T00:00:00Z" },
    { id: "shared-1", title: "Nova Roadmap", role: "editor", programCount: 1, memberCount: 2, updatedAt: "2026-09-10T00:00:00Z" },
  ],
};

describe("MyRoadmapsLanding (wayframe#123)", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every Roadmap returned by GET /api/roadmaps, with role badges", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/api/roadmaps": () => ({ ok: true, json: async () => roadmapsResponse }) }));
    render(<MyRoadmapsLanding />);

    await waitFor(() => expect(screen.getByText("Nova Roadmap")).toBeInTheDocument());
    // The first Roadmap (Atlas, owner) is auto-selected, so its title and
    // role badge render twice (sidebar row + detail pane) — scope to the
    // sidebar list to keep these assertions unambiguous.
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByText("Atlas Roadmap")).toBeInTheDocument();
    expect(within(nav).getByText("Owner")).toBeInTheDocument();
    expect(within(nav).getByText("Editor")).toBeInTheDocument();
  });

  it("selects the first Roadmap by default and shows its detail pane", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/api/roadmaps": () => ({ ok: true, json: async () => roadmapsResponse }) }));
    render(<MyRoadmapsLanding />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Atlas Roadmap" })).toBeInTheDocument());
    expect(screen.getByText("3")).toBeInTheDocument(); // programCount
    expect(screen.getByText("5")).toBeInTheDocument(); // memberCount
  });

  it("switches the detail pane when a different Roadmap is selected", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/api/roadmaps": () => ({ ok: true, json: async () => roadmapsResponse }) }));
    render(<MyRoadmapsLanding />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Atlas Roadmap" })).toBeInTheDocument());
    fireEvent.click(screen.getByText("Nova Roadmap"));
    expect(screen.getByRole("heading", { name: "Nova Roadmap" })).toBeInTheDocument();
  });

  it("filters to owned-only / shared-only via the filter pills", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/api/roadmaps": () => ({ ok: true, json: async () => roadmapsResponse }) }));
    render(<MyRoadmapsLanding />);

    await waitFor(() => expect(screen.getByText("Nova Roadmap")).toBeInTheDocument());
    const nav = screen.getByRole("navigation");

    fireEvent.click(screen.getByRole("button", { name: "Owned" }));
    expect(within(nav).getByText("Atlas Roadmap")).toBeInTheDocument();
    expect(within(nav).queryByText("Nova Roadmap")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Shared" }));
    expect(within(nav).queryByText("Atlas Roadmap")).not.toBeInTheDocument();
    expect(within(nav).getByText("Nova Roadmap")).toBeInTheDocument();
  });

  it("shows an empty-state message and no filter results when the visitor has no Roadmaps yet", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/api/roadmaps": () => ({ ok: true, json: async () => ({ roadmaps: [] }) }) }));
    render(<MyRoadmapsLanding />);
    await waitFor(() => expect(screen.getByText("No Roadmaps yet — create one to get started.")).toBeInTheDocument());
  });

  it("+ New Roadmap POSTs to /api/roadmaps and navigates to the new Roadmap", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/roadmaps": (init) => {
          if (init?.method === "POST") return { ok: true, json: async () => ({ id: "brand-new" }) };
          return { ok: true, json: async () => roadmapsResponse };
        },
      }),
    );
    render(<MyRoadmapsLanding />);

    await waitFor(() => expect(screen.getByText("Nova Roadmap")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /New Roadmap/ }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/p/brand-new"));
  });

  it("surfaces an error instead of creating a Roadmap when POST /api/roadmaps fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/api/roadmaps": (init) => {
          if (init?.method === "POST") return { ok: false, json: async () => ({ error: "Not signed in." }) };
          return { ok: true, json: async () => roadmapsResponse };
        },
      }),
    );
    render(<MyRoadmapsLanding />);

    await waitFor(() => expect(screen.getByText("Nova Roadmap")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /New Roadmap/ }));
    await waitFor(() => expect(screen.getByText("Not signed in.")).toBeInTheDocument());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a plain error message when GET /api/roadmaps fails", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/api/roadmaps": () => ({ ok: false, json: async () => ({ error: "Couldn't load." }) }) }));
    render(<MyRoadmapsLanding />);
    await waitFor(() => expect(screen.getByText("Couldn't load.")).toBeInTheDocument());
  });
});
