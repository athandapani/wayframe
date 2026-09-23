import { createClient, type Client } from "@libsql/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoRoadmap } from "@/data/demo-roadmap";
import type { Program } from "@/components/timeline/types";

let testClient: Client;

const authMock = vi.fn();
vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));

const getRoleMock = vi.fn();
vi.mock("@/lib/db/portfolios", () => ({ getRole: getRoleMock }));

vi.mock("@/lib/db/client", () => ({ getDbClient: () => testClient }));

beforeEach(() => {
  testClient = createClient({ url: ":memory:" });
  authMock.mockReset();
  getRoleMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "user-1", name: "Priya N." } });
  getRoleMock.mockResolvedValue("editor");
});

afterEach(() => {
  testClient.close();
});

const program: Program = { ...demoRoadmap, id: "program-A", portfolioId: "portfolio-1", order: 0 };

async function seedVersion(portfolioId = "portfolio-1", label: string | null = null) {
  const { createVersion } = await import("@/lib/db/versions");
  return createVersion(portfolioId, "user-1", "Priya N.", [program], label);
}

async function callGet(versionId: string, portfolioId = "portfolio-1") {
  const { GET } = await import("./route");
  const url = `http://localhost/api/portfolios/${portfolioId}/versions/${versionId}`;
  return GET(new NextRequest(url), { params: Promise.resolve({ portfolioId, versionId }) });
}

async function callPatch(versionId: string, body: unknown, portfolioId = "portfolio-1") {
  const { PATCH } = await import("./route");
  const url = `http://localhost/api/portfolios/${portfolioId}/versions/${versionId}`;
  return PATCH(new NextRequest(url, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ portfolioId, versionId }) });
}

describe("GET /api/portfolios/[portfolioId]/versions/[versionId] (wayframe#128)", () => {
  it("401s when there is no session", async () => {
    const id = await seedVersion();
    authMock.mockResolvedValue(null);
    expect((await callGet(id)).status).toBe(401);
  });

  it("403s an identity with no role on the Roadmap", async () => {
    const id = await seedVersion();
    getRoleMock.mockResolvedValue(null);
    expect((await callGet(id)).status).toBe(403);
  });

  it("returns the full Program documents to any member, viewer included", async () => {
    const id = await seedVersion();
    getRoleMock.mockResolvedValue("viewer");

    const res = await callGet(id);
    expect(res.status).toBe(200);
    expect((await res.json()).version.programs).toEqual([program]);
  });

  it("404s a Version that belongs to a different Roadmap, even for a member of this one", async () => {
    const id = await seedVersion("someone-elses-roadmap");
    expect((await callGet(id)).status).toBe(404);
  });
});

describe("PATCH /api/portfolios/[portfolioId]/versions/[versionId] (wayframe#128)", () => {
  it("403s a viewer", async () => {
    const id = await seedVersion();
    getRoleMock.mockResolvedValue("viewer");
    expect((await callPatch(id, { label: "Nope" })).status).toBe(403);
  });

  it("400s a body with no label field at all", async () => {
    const id = await seedVersion();
    expect((await callPatch(id, { name: "wrong key" })).status).toBe(400);
  });

  it("renames the label and leaves the captured content untouched", async () => {
    const id = await seedVersion();

    expect((await callPatch(id, { label: "  Board review  " })).status).toBe(200);
    const { getVersion } = await import("@/lib/db/versions");
    const version = await getVersion("portfolio-1", id);
    expect(version?.label).toBe("Board review");
    expect(version?.programs).toEqual([program]);
  });

  it("treats a blank name as clearing the label, so the row falls back to its saved-at time", async () => {
    const id = await seedVersion("portfolio-1", "Named already");
    expect((await callPatch(id, { label: "   " })).status).toBe(200);
    const { getVersion } = await import("@/lib/db/versions");
    expect((await getVersion("portfolio-1", id))?.label).toBeNull();
  });

  it("404s rather than silently reporting success for an unknown id or another Roadmap's Version", async () => {
    const elsewhere = await seedVersion("someone-elses-roadmap");
    expect((await callPatch("no-such-id", { label: "x" })).status).toBe(404);
    expect((await callPatch(elsewhere, { label: "x" })).status).toBe(404);
  });
});
