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
  return new NextRequest("http://localhost/api/portfolios/portfolio-1/programs/bulk-patch", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function callRoute(portfolioId: string, body: unknown) {
  const { POST } = await import("./route");
  return POST(postRequest(body), { params: Promise.resolve({ portfolioId }) });
}

const programA: Program = {
  ...demoRoadmap,
  id: "program-A",
  portfolioId: "portfolio-1",
  order: 0,
  milestones: demoRoadmap.milestones.map((m, i) => ({ ...m, id: `mA-${i}` })),
};
const programB: Program = {
  ...demoRoadmap,
  id: "program-B",
  portfolioId: "portfolio-1",
  order: 1,
  milestones: demoRoadmap.milestones.map((m, i) => ({ ...m, id: `mB-${i}` })),
};
// Belongs to a DIFFERENT Portfolio — used to verify a caller can't reach
// into another Portfolio's Program just by naming its real programId.
const programOther: Program = {
  ...demoRoadmap,
  id: "program-other",
  portfolioId: "portfolio-2",
  order: 0,
  milestones: demoRoadmap.milestones.map((m, i) => ({ ...m, id: `mO-${i}` })),
};

async function seedPrograms() {
  const { createProgramFromData } = await import("@/lib/db/program-storage");
  await createProgramFromData(programA);
  await createProgramFromData(programB);
  await createProgramFromData(programOther);
}

describe("POST /api/portfolios/[portfolioId]/programs/bulk-patch", () => {
  it("401s when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const res = await callRoute("portfolio-1", { opsByProgram: {} });

    expect(res.status).toBe(401);
  });

  it("403s a viewer (no edit access)", async () => {
    getRoleMock.mockResolvedValue("viewer");

    const res = await callRoute("portfolio-1", { opsByProgram: {} });

    expect(res.status).toBe(403);
  });

  it("400s on a malformed body", async () => {
    const res = await callRoute("portfolio-1", { opsByProgram: "nope" });

    expect(res.status).toBe(400);
  });

  it("applies a status patch across two Programs in one request", async () => {
    await seedPrograms();
    const { getProgramSnapshot, decodeProgramSnapshot } = await import("@/lib/db/program-storage");

    const res = await callRoute("portfolio-1", {
      opsByProgram: {
        "program-A": { bulkPatchOps: [{ op: { field: "status", value: "at-risk" }, ids: ["mA-0"] }], deleteIds: [], acceptBaselineOps: [] },
        "program-B": { bulkPatchOps: [{ op: { field: "status", value: "at-risk" }, ids: ["mB-0"] }], deleteIds: [], acceptBaselineOps: [] },
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const snapA = decodeProgramSnapshot((await getProgramSnapshot("program-A"))!);
    const snapB = decodeProgramSnapshot((await getProgramSnapshot("program-B"))!);
    expect(snapA?.milestones.find((m) => m.id === "mA-0")?.status).toBe("at-risk");
    expect(snapB?.milestones.find((m) => m.id === "mB-0")?.status).toBe("at-risk");
  });

  it("skips a field that only applies to some of the selected items, without erroring", async () => {
    await seedPrograms();
    const { getProgramSnapshot, decodeProgramSnapshot } = await import("@/lib/db/program-storage");

    // laneRow only applies to a duration-pill Milestone (endDate set) — mA-0
    // from demoRoadmap has no endDate, so this op should silently no-op on
    // it rather than throwing.
    const res = await callRoute("portfolio-1", {
      opsByProgram: {
        "program-A": { bulkPatchOps: [{ op: { field: "laneRow", value: 2 }, ids: ["mA-0"] }], deleteIds: [], acceptBaselineOps: [] },
      },
    });

    expect(res.status).toBe(200);
    const snapA = decodeProgramSnapshot((await getProgramSnapshot("program-A"))!);
    expect(snapA?.milestones.find((m) => m.id === "mA-0")?.laneRow).toBeUndefined();
  });

  it("deletes across Programs", async () => {
    await seedPrograms();
    const { getProgramSnapshot, decodeProgramSnapshot } = await import("@/lib/db/program-storage");

    const res = await callRoute("portfolio-1", {
      opsByProgram: {
        "program-A": { bulkPatchOps: [], deleteIds: ["mA-0"], acceptBaselineOps: [] },
      },
    });

    expect(res.status).toBe(200);
    const snapA = decodeProgramSnapshot((await getProgramSnapshot("program-A"))!);
    expect(snapA?.milestones.some((m) => m.id === "mA-0")).toBe(false);
  });

  it("accepts a baseline across Programs", async () => {
    await seedPrograms();
    const { getProgramSnapshot, decodeProgramSnapshot, appendProgramUpdate } = await import("@/lib/db/program-storage");
    const { applyProgramPatch } = await import("@/lib/realtime/program-ydoc");
    const Y = await import("yjs");

    // Give mA-0 a baseline to accept.
    const doc = new Y.Doc();
    Y.applyUpdate(doc, (await getProgramSnapshot("program-A"))!);
    const before = Y.encodeStateVector(doc);
    const withBaseline = { ...programA, milestones: programA.milestones.map((m) => (m.id === "mA-0" ? { ...m, originalDate: "2020-01-01" } : m)) };
    applyProgramPatch(doc, programA, withBaseline);
    await appendProgramUpdate("program-A", Y.encodeStateAsUpdate(doc, before));

    const res = await callRoute("portfolio-1", {
      opsByProgram: {
        "program-A": { bulkPatchOps: [], deleteIds: [], acceptBaselineOps: [{ scope: "one", targetId: "mA-0", reason: "test" }] },
      },
    });

    expect(res.status).toBe(200);
    const snapA = decodeProgramSnapshot((await getProgramSnapshot("program-A"))!);
    expect(snapA?.milestones.find((m) => m.id === "mA-0")?.originalDate).toBeUndefined();
  });

  it("skips a programId that doesn't belong to this Portfolio", async () => {
    await seedPrograms();
    const { getProgramSnapshot, decodeProgramSnapshot } = await import("@/lib/db/program-storage");

    const res = await callRoute("portfolio-1", {
      opsByProgram: {
        "program-other": { bulkPatchOps: [{ op: { field: "status", value: "at-risk" }, ids: ["mO-0"] }], deleteIds: [], acceptBaselineOps: [] },
      },
    });

    expect(res.status).toBe(200);
    const snapOther = decodeProgramSnapshot((await getProgramSnapshot("program-other"))!);
    expect(snapOther?.milestones.find((m) => m.id === "mO-0")?.status).not.toBe("at-risk");
  });
});
