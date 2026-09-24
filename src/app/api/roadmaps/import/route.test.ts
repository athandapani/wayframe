import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoRoadmap } from "@/data/demo-roadmap";
import type { PortfolioDocument, Program } from "@/components/timeline/types";

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

function program(id: string, name: string, order: number): Program {
  return { ...(demoRoadmap as Program), id, portfolioId: "from-the-file", order, programName: name };
}

function documentWith(programs: Program[]): PortfolioDocument {
  return {
    portfolio: { id: "from-the-file", schemaVersion: 4, legendCategories: [{ id: "cat-1", name: "Platform", color: "#2e7af5" }] },
    programs,
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/roadmaps/import", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/roadmaps/import (wayframe#140)", () => {
  it("refuses an unauthenticated import", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(post(documentWith([program("p1", "One", 0)])) as never);
    expect(res.status).toBe(401);
  });

  it("creates one Roadmap holding EVERY Program in the file — the whole point of the ticket", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    const res = await POST(post(documentWith([program("p1", "In Progress", 0), program("p2", "Deferred", 1), program("p3", "Completed", 2)])) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.programCount).toBe(3);

    const rows = await testClient.execute({ sql: "SELECT id FROM programs WHERE portfolio_id = ?", args: [body.id] });
    expect(rows.rows).toHaveLength(3);
  });

  it("imports for an identity that ALREADY owns a Roadmap — the gate that makes migrate-local unusable here", async () => {
    const { createPortfolioWithOwner } = await import("@/lib/db/portfolios");
    await createPortfolioWithOwner("already-owned", "user-1");
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const { POST } = await import("./route");
    const res = await POST(post(documentWith([program("p1", "One", 0)])) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).not.toBe("already-owned");
  });

  it("mints fresh Program ids so a file re-imported twice can't collide on the PRIMARY KEY", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    const doc = documentWith([program("p1", "One", 0), program("p2", "Two", 1)]);

    const first = await POST(post(doc) as never);
    const second = await POST(post(doc) as never);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const all = await testClient.execute("SELECT id FROM programs");
    expect(all.rows).toHaveLength(4);
    expect(new Set(all.rows.map((r) => r.id)).size).toBe(4);
    expect(all.rows.map((r) => r.id)).not.toContain("p1");
  });

  it("re-points every Program's portfolioId at the new Roadmap, not the file's own id", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    const res = await POST(post(documentWith([program("p1", "One", 0)])) as never);
    const body = await res.json();

    const { loadLiveProgramsForPortfolio } = await import("@/lib/db/program-storage");
    const stored = await loadLiveProgramsForPortfolio(body.id);
    expect(stored[0].portfolioId).toBe(body.id);
  });

  it("renumbers `order` to the file's array order, so duplicate or gapped orders can't scramble the bands", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    const res = await POST(post(documentWith([program("p1", "First", 7), program("p2", "Second", 7), program("p3", "Third", 7)])) as never);
    const body = await res.json();

    const { loadLiveProgramsForPortfolio } = await import("@/lib/db/program-storage");
    const stored = await loadLiveProgramsForPortfolio(body.id);
    expect(stored.map((p) => [p.programName, p.order]).sort((a, b) => (a[1] as number) - (b[1] as number))).toEqual([
      ["First", 0],
      ["Second", 1],
      ["Third", 2],
    ]);
  });

  it("carries Portfolio-level content (legend categories) across, not just the Programs", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    const res = await POST(post(documentWith([program("p1", "One", 0)])) as never);
    const body = await res.json();

    const { getPortfolioContent } = await import("@/lib/db/portfolios");
    const content = await getPortfolioContent(body.id);
    expect(content?.legendCategories).toEqual([{ id: "cat-1", name: "Platform", color: "#2e7af5" }]);
  });

  it("rejects a file that isn't a Wayframe roadmap, with the readable issue list", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    const res = await POST(post({ nope: true }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("writes no Roadmap at all when the document is invalid", async () => {
    // Schema created up front: the invalid path returns before it ever
    // touches the DB (so `ensureSchema` never runs), and a "no such table"
    // error would pass for an empty table without actually proving it.
    const { ensureSchema } = await import("@/lib/db/schema");
    await ensureSchema(testClient);
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    await POST(post({ nope: true }) as never);
    const rows = await testClient.execute("SELECT id FROM portfolios");
    expect(rows.rows).toHaveLength(0);
  });
});
