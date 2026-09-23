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

const programA: Program = { ...demoRoadmap, id: "program-A", portfolioId: "portfolio-1", order: 0 };
const programB: Program = { ...demoRoadmap, id: "program-B", portfolioId: "portfolio-1", order: 1 };

async function seedTwoPrograms() {
  const { createProgramFromData } = await import("@/lib/db/program-storage");
  await createProgramFromData(programA);
  await createProgramFromData(programB);
}

async function callGet(portfolioId = "portfolio-1") {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/portfolios/${portfolioId}/versions`), { params: Promise.resolve({ portfolioId }) });
}

async function callPost(body: unknown = {}, portfolioId = "portfolio-1") {
  const { POST } = await import("./route");
  const req = new NextRequest(`http://localhost/api/portfolios/${portfolioId}/versions`, { method: "POST", body: JSON.stringify(body) });
  return POST(req, { params: Promise.resolve({ portfolioId }) });
}

describe("GET /api/portfolios/[portfolioId]/versions (wayframe#128)", () => {
  it("401s when there is no session", async () => {
    authMock.mockResolvedValue(null);
    expect((await callGet()).status).toBe(401);
  });

  it("403s an identity with no role on the Roadmap", async () => {
    getRoleMock.mockResolvedValue(null);
    expect((await callGet()).status).toBe(403);
  });

  it("lets a viewer list Versions — reading one is not an editorial act", async () => {
    getRoleMock.mockResolvedValue("viewer");
    await seedTwoPrograms();
    const { createVersion } = await import("@/lib/db/versions");
    await createVersion("portfolio-1", "someone-else", "Sam", [programA]);

    const res = await callGet();
    expect(res.status).toBe(200);
    expect((await res.json()).versions).toHaveLength(1);
  });
});

describe("POST /api/portfolios/[portfolioId]/versions (wayframe#128)", () => {
  it("401s when there is no session", async () => {
    authMock.mockResolvedValue(null);
    expect((await callPost()).status).toBe(401);
  });

  it("403s a viewer — capturing a Version is an editorial act on the shared plan", async () => {
    getRoleMock.mockResolvedValue("viewer");
    await seedTwoPrograms();
    expect((await callPost()).status).toBe(403);
  });

  it("captures every Program of the Roadmap server-side, from an empty body", async () => {
    await seedTwoPrograms();

    const res = await callPost();
    expect(res.status).toBe(200);
    const { versionId } = await res.json();

    const { getVersion } = await import("@/lib/db/versions");
    const version = await getVersion("portfolio-1", versionId);
    expect(version?.programs.map((p) => p.id)).toEqual(["program-A", "program-B"]);
    expect(version?.creatorIdentity).toBe("user-1");
    expect(version?.creatorName).toBe("Priya N.");
    expect(version?.label).toBeNull();
  });

  it("captures the Program's PENDING Yjs updates, not just its last compacted snapshot", async () => {
    await seedTwoPrograms();
    const Y = await import("yjs");
    const { appendProgramUpdate, getProgramSnapshot } = await import("@/lib/db/program-storage");
    const { applyProgramPatch } = await import("@/lib/realtime/program-ydoc");

    const doc = new Y.Doc();
    Y.applyUpdate(doc, (await getProgramSnapshot("program-A"))!);
    const before = Y.encodeStateVector(doc);
    applyProgramPatch(doc, programA, { ...programA, programName: "Renamed live" });
    await appendProgramUpdate("program-A", Y.encodeStateAsUpdate(doc, before));

    const { versionId } = await (await callPost()).json();
    const { getVersion } = await import("@/lib/db/versions");
    const version = await getVersion("portfolio-1", versionId);
    expect(version?.programs.find((p) => p.id === "program-A")?.programName).toBe("Renamed live");
  });

  it("honours a label sent at save time, and treats a blank one as unnamed", async () => {
    await seedTwoPrograms();
    const { getVersion } = await import("@/lib/db/versions");

    const named = await (await callPost({ label: "  Board review  " })).json();
    expect((await getVersion("portfolio-1", named.versionId))?.label).toBe("Board review");

    const blank = await (await callPost({ label: "   " })).json();
    expect((await getVersion("portfolio-1", blank.versionId))?.label).toBeNull();
  });

  it("400s rather than storing an empty Version when the Roadmap has no Program yet", async () => {
    const res = await callPost();
    expect(res.status).toBe(400);
    const { listVersions } = await import("@/lib/db/versions");
    expect(await listVersions("portfolio-1")).toEqual([]);
  });
});
