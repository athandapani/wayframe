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
  authMock.mockResolvedValue({ user: { id: "user-1" } });
  getRoleMock.mockResolvedValue("editor");
});

afterEach(() => {
  testClient.close();
});

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/portfolios/portfolio-1/programs/program-1/reorder", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function callRoute(portfolioId: string, programId: string, body: unknown) {
  const { POST } = await import("./route");
  return POST(postRequest(body), { params: Promise.resolve({ portfolioId, programId }) });
}

const programA: Program = { ...demoRoadmap, id: "program-A", portfolioId: "portfolio-1", order: 0 };
const programB: Program = { ...demoRoadmap, id: "program-B", portfolioId: "portfolio-1", order: 1 };
const programC: Program = { ...demoRoadmap, id: "program-C", portfolioId: "portfolio-1", order: 2 };

async function seedThreePrograms() {
  const { createProgramFromData } = await import("@/lib/db/program-storage");
  await createProgramFromData(programA);
  await createProgramFromData(programB);
  await createProgramFromData(programC);
}

describe("POST /api/portfolios/[portfolioId]/programs/[programId]/reorder", () => {
  it("401s when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const res = await callRoute("portfolio-1", "program-A", { direction: "up" });

    expect(res.status).toBe(401);
  });

  it("403s a viewer (no edit access)", async () => {
    getRoleMock.mockResolvedValue("viewer");

    const res = await callRoute("portfolio-1", "program-A", { direction: "up" });

    expect(res.status).toBe(403);
  });

  it("400s on an invalid direction", async () => {
    await seedThreePrograms();

    const res = await callRoute("portfolio-1", "program-A", { direction: "sideways" });

    expect(res.status).toBe(400);
  });

  it("404s a programId that isn't among the Portfolio's Programs", async () => {
    await seedThreePrograms();

    const res = await callRoute("portfolio-1", "never-created", { direction: "up" });

    expect(res.status).toBe(404);
  });

  it("no-ops moving the first Program up (boundary)", async () => {
    await seedThreePrograms();

    const res = await callRoute("portfolio-1", "program-A", { direction: "up" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, moved: false });
  });

  it("no-ops moving the last Program down (boundary)", async () => {
    await seedThreePrograms();

    const res = await callRoute("portfolio-1", "program-C", { direction: "down" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, moved: false });
  });

  it("swaps order with the adjacent Program and persists it", async () => {
    await seedThreePrograms();
    const { getProgramSnapshot, decodeProgramSnapshot } = await import("@/lib/db/program-storage");

    const res = await callRoute("portfolio-1", "program-B", { direction: "up" });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.moved).toBe(true);
    expect(new Set(json.swapped)).toEqual(new Set(["program-A", "program-B"]));

    const snapA = decodeProgramSnapshot((await getProgramSnapshot("program-A"))!);
    const snapB = decodeProgramSnapshot((await getProgramSnapshot("program-B"))!);
    const snapC = decodeProgramSnapshot((await getProgramSnapshot("program-C"))!);

    expect(snapB?.order).toBe(0);
    expect(snapA?.order).toBe(1);
    expect(snapC?.order).toBe(2);
  });

  it("preserves a pending, not-yet-compacted edit on a Program it reorders", async () => {
    await seedThreePrograms();
    const { appendProgramUpdate, getProgramSnapshot, decodeProgramSnapshot } = await import("@/lib/db/program-storage");
    const { applyProgramPatch } = await import("@/lib/realtime/program-ydoc");
    const Y = await import("yjs");

    // Simulate a live edit to program-A that landed in `program_updates` but
    // was never folded back into `programs.snapshot` (e.g. a transient
    // compaction failure) — the exact staleness window this route must not
    // clobber when it patches `order` on program-A's sibling swap.
    const doc = new Y.Doc();
    Y.applyUpdate(doc, (await getProgramSnapshot("program-A"))!);
    const before = Y.encodeStateVector(doc);
    applyProgramPatch(doc, programA, { ...programA, programName: "Edited while pending" });
    await appendProgramUpdate("program-A", Y.encodeStateAsUpdate(doc, before));

    const res = await callRoute("portfolio-1", "program-B", { direction: "up" });
    expect(res.status).toBe(200);

    const snapA = decodeProgramSnapshot((await getProgramSnapshot("program-A"))!);
    expect(snapA?.programName).toBe("Edited while pending");
    expect(snapA?.order).toBe(1);
  });
});
