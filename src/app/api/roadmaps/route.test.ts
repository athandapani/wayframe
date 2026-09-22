import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoRoadmap } from "@/data/demo-roadmap";
import type { Program } from "@/components/timeline/types";

let testClient: Client;

const authMock = vi.fn();
vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db/client", () => ({ getDbClient: () => testClient }));

beforeEach(() => {
  testClient = createClient({ url: ":memory:" });
  authMock.mockReset();
});

afterEach(() => {
  testClient.close();
});

describe("GET /api/roadmaps (wayframe#123)", () => {
  it("returns an empty list, not an error, when signed out", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ roadmaps: [] });
  });

  it("lists every Portfolio the identity has a role on, owner-first then most-recently-updated, with a derived title", async () => {
    const { createPortfolioWithOwner, setMember } = await import("@/lib/db/portfolios");
    const { createProgramFromData } = await import("@/lib/db/program-storage");

    await createPortfolioWithOwner("owned-old", "user-1");
    await createPortfolioWithOwner("owned-new", "user-1");
    await createPortfolioWithOwner("shared-1", "user-2");
    await setMember("shared-1", "user-1", "editor");
    // A freshly-created Roadmap with no Program yet still shows up.
    await createPortfolioWithOwner("owned-empty", "user-1");

    const oldProgram: Program = { ...demoRoadmap, id: "p-old", portfolioId: "owned-old", order: 0, programName: "Old Program" };
    const newProgram: Program = { ...demoRoadmap, id: "p-new", portfolioId: "owned-new", order: 0, programName: "New Program" };
    await createProgramFromData(oldProgram);
    await createProgramFromData(newProgram);
    await testClient.execute({
      sql: "UPDATE programs SET updated_at = ? WHERE id = ?",
      args: ["2030-01-01T00:00:00.000Z", "p-new"],
    });
    await testClient.execute({
      sql: "UPDATE programs SET updated_at = ? WHERE id = ?",
      args: ["2020-01-01T00:00:00.000Z", "p-old"],
    });

    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();

    // owned-empty has no Program yet, so its "updated" falls back to the
    // Portfolio row's own created_at — "just now" (test run time), ahead of
    // owned-old's forced 2020 timestamp.
    expect(body.roadmaps.map((r: { id: string }) => r.id)).toEqual(["owned-new", "owned-empty", "owned-old", "shared-1"]);
    expect(body.roadmaps[0].title).toBe("New Program");
    expect(body.roadmaps[0].role).toBe("owner");
    expect(body.roadmaps[1].title).toBe("Untitled Roadmap");
    expect(body.roadmaps[1].programCount).toBe(0);
    expect(body.roadmaps[3].role).toBe("editor");
  });

  it("never lists a Portfolio the identity has no role on", async () => {
    const { createPortfolioWithOwner } = await import("@/lib/db/portfolios");
    await createPortfolioWithOwner("someone-elses", "user-2");

    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.roadmaps).toEqual([]);
  });
});

describe("POST /api/roadmaps (wayframe#123 — \"+ New Roadmap\")", () => {
  it("requires sign-in", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("creates an empty hosted Portfolio owned by the caller", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.id).toBe("string");

    const { getRole } = await import("@/lib/db/portfolios");
    expect(await getRole(body.id, "user-1")).toBe("owner");

    const { listProgramSnapshotsForPortfolio } = await import("@/lib/db/program-storage");
    expect(await listProgramSnapshotsForPortfolio(body.id)).toEqual([]);
  });
});
