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

describe("portfolio content (wayframe#t17)", () => {
  it("getPortfolioContent defaults to an empty object before setPortfolioContent is ever called", async () => {
    const { createPortfolioWithOwner, getPortfolioContent } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    expect(await getPortfolioContent("p1")).toEqual({});
  });

  it("getPortfolioContent returns null for a portfolio id that doesn't exist", async () => {
    const { getPortfolioContent } = await import("./portfolios");
    expect(await getPortfolioContent("never-created")).toBeNull();
  });

  it("setPortfolioContent/getPortfolioContent round-trip", async () => {
    const { createPortfolioWithOwner, setPortfolioContent, getPortfolioContent } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await setPortfolioContent("p1", {
      schemaVersion: 3,
      companyLogo: { dataUrl: "data:image/png;base64,x" },
      legendCategories: [{ id: "cat-1", name: "Risk", color: "#f00" }],
    });

    expect(await getPortfolioContent("p1")).toEqual({
      schemaVersion: 3,
      companyLogo: { dataUrl: "data:image/png;base64,x" },
      legendCategories: [{ id: "cat-1", name: "Risk", color: "#f00" }],
    });
  });
});

describe("getOwnedPortfolioId (wayframe#t17)", () => {
  it("returns the owner's portfolio id", async () => {
    const { createPortfolioWithOwner, getOwnedPortfolioId } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    expect(await getOwnedPortfolioId("user-1")).toBe("p1");
  });

  it("returns null for an identity with no membership at all", async () => {
    const { getOwnedPortfolioId } = await import("./portfolios");
    expect(await getOwnedPortfolioId("stranger")).toBeNull();
  });

  it("returns null for an identity that's only an editor or viewer, not owner", async () => {
    const { createPortfolioWithOwner, setMember, getOwnedPortfolioId } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await setMember("p1", "user-2", "editor");
    await setMember("p1", "user-3", "viewer");

    expect(await getOwnedPortfolioId("user-2")).toBeNull();
    expect(await getOwnedPortfolioId("user-3")).toBeNull();
  });
});
