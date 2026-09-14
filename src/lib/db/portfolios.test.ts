import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testClient: Client;

vi.mock("./client", () => ({
  getDbClient: () => testClient,
}));

beforeEach(() => {
  testClient = createClient({ url: ":memory:" });
});

afterEach(() => {
  testClient.close();
});

describe("portfolios membership", () => {
  it("createPortfolioWithOwner grants the owner role", async () => {
    const { createPortfolioWithOwner, getRole } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    expect(await getRole("p1", "user-1")).toBe("owner");
    expect(await getRole("p1", "someone-else")).toBeNull();
  });

  it("setMember upserts a role rather than duplicating rows", async () => {
    const { createPortfolioWithOwner, setMember, getRole, listMembers } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await setMember("p1", "user-2", "viewer");
    expect(await getRole("p1", "user-2")).toBe("viewer");

    await setMember("p1", "user-2", "editor");
    expect(await getRole("p1", "user-2")).toBe("editor");
    expect(await listMembers("p1")).toHaveLength(2);
  });

  it("removeMember drops the row", async () => {
    const { createPortfolioWithOwner, setMember, removeMember, getRole } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await setMember("p1", "user-2", "viewer");
    await removeMember("p1", "user-2");
    expect(await getRole("p1", "user-2")).toBeNull();
  });

  it("getRoleForProgram resolves via the program's portfolio_id", async () => {
    const { createPortfolioWithOwner, getRoleForProgram } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await testClient.execute({
      sql: "INSERT INTO programs (id, portfolio_id, snapshot, rev, updated_at) VALUES (?, ?, ?, 1, ?)",
      args: ["prog-1", "p1", new Uint8Array(), new Date().toISOString()],
    });

    expect(await getRoleForProgram("prog-1", "user-1")).toBe("owner");
    expect(await getRoleForProgram("prog-1", "stranger")).toBeNull();
  });

  it("getRoleForProgram denies access when the Program has no row yet", async () => {
    const { getRoleForProgram } = await import("./portfolios");
    expect(await getRoleForProgram("never-created", "user-1")).toBeNull();
  });

  it("share links resolve to their granted role and can be revoked", async () => {
    const { createPortfolioWithOwner, createShareLink, resolveShareLink, deleteShareLink } = await import(
      "./portfolios"
    );
    await createPortfolioWithOwner("p1", "user-1");
    const token = await createShareLink("p1", "viewer");

    expect(await resolveShareLink(token)).toEqual({ portfolioId: "p1", role: "viewer" });

    await deleteShareLink(token);
    expect(await resolveShareLink(token)).toBeNull();
  });

  it("resolveShareLink returns null for an unknown token", async () => {
    const { resolveShareLink } = await import("./portfolios");
    expect(await resolveShareLink("not-a-real-token")).toBeNull();
  });
});
