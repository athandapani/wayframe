import { createClient, type Client } from "@libsql/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoRoadmap } from "@/data/demo-roadmap";
import type { Program } from "@/components/timeline/types";

let testClient: Client;

const authMock = vi.fn();
vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));

const getRoleMock = vi.fn();
const getPortfolioContentMock = vi.fn();
const resolveShareLinkMock = vi.fn();
vi.mock("@/lib/db/portfolios", () => ({
  getRole: getRoleMock,
  getPortfolioContent: getPortfolioContentMock,
  resolveShareLink: resolveShareLinkMock,
}));

vi.mock("@/lib/db/client", () => ({ getDbClient: () => testClient }));

beforeEach(() => {
  testClient = createClient({ url: ":memory:" });
  authMock.mockReset();
  getRoleMock.mockReset();
  getPortfolioContentMock.mockReset();
  resolveShareLinkMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "user-1" } });
  getRoleMock.mockResolvedValue("editor");
  getPortfolioContentMock.mockResolvedValue({ id: "portfolio-1", schemaVersion: 2 });
});

afterEach(() => {
  testClient.close();
});

function getRequest(portfolioId: string, query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/portfolios/${portfolioId}/view${query}`);
}

async function callRoute(portfolioId: string, query = "") {
  const { GET } = await import("./route");
  return GET(getRequest(portfolioId, query), { params: Promise.resolve({ portfolioId }) });
}

const programA: Program = { ...demoRoadmap, id: "program-A", portfolioId: "portfolio-1", order: 0, programName: "Program A" };
const programB: Program = { ...demoRoadmap, id: "program-B", portfolioId: "portfolio-1", order: 1, programName: "Program B" };

async function seedTwoPrograms() {
  const { createProgramFromData } = await import("@/lib/db/program-storage");
  await createProgramFromData(programA);
  await createProgramFromData(programB);
}

describe("GET /api/portfolios/[portfolioId]/view — ?programId= (wayframe UX-2026-09-18 §7)", () => {
  it("defaults to the first Program when no ?programId= is given, unchanged from before this ticket", async () => {
    await seedTwoPrograms();

    const res = await callRoute("portfolio-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.program.id).toBe("program-A");
  });

  it("loads the requested Program when ?programId= names one of this Portfolio's Programs", async () => {
    await seedTwoPrograms();

    const res = await callRoute("portfolio-1", "?programId=program-B");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.program.id).toBe("program-B");
    expect(body.program.programName).toBe("Program B");
  });

  it("404s a ?programId= that doesn't belong to this Portfolio", async () => {
    await seedTwoPrograms();

    const res = await callRoute("portfolio-1", "?programId=not-a-real-program");

    expect(res.status).toBe(404);
  });
});
