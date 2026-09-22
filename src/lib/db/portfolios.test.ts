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
    const { createPortfolioWithOwner, createShareLink, resolveShareLink, revokeShareLink } = await import(
      "./portfolios"
    );
    await createPortfolioWithOwner("p1", "user-1");
    const token = await createShareLink("p1", "viewer");

    expect(await resolveShareLink(token)).toEqual({ portfolioId: "p1", role: "viewer" });

    await revokeShareLink("p1");
    expect(await resolveShareLink(token)).toBeNull();
  });

  it("resolveShareLink returns null for an unknown token", async () => {
    const { resolveShareLink } = await import("./portfolios");
    expect(await resolveShareLink("not-a-real-token")).toBeNull();
  });

  it("createShareLink regenerates atomically — the old token stops resolving, the new one works", async () => {
    const { createPortfolioWithOwner, createShareLink, getShareLink, resolveShareLink } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    const firstToken = await createShareLink("p1", "viewer");
    expect(await resolveShareLink(firstToken)).toEqual({ portfolioId: "p1", role: "viewer" });

    const secondToken = await createShareLink("p1", "editor");
    expect(secondToken).not.toBe(firstToken);
    expect(await resolveShareLink(firstToken)).toBeNull();
    expect(await resolveShareLink(secondToken)).toEqual({ portfolioId: "p1", role: "editor" });
    expect(await getShareLink("p1")).toEqual({ token: secondToken, role: "editor" });
  });

  it("getShareLink returns null before any link exists", async () => {
    const { createPortfolioWithOwner, getShareLink } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    expect(await getShareLink("p1")).toBeNull();
  });

  it("setShareLinkRole no-ops when no link exists yet", async () => {
    const { createPortfolioWithOwner, setShareLinkRole, getShareLink } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await setShareLinkRole("p1", "editor");
    expect(await getShareLink("p1")).toBeNull();
  });

  it("setShareLinkRole changes the role without changing the token", async () => {
    const { createPortfolioWithOwner, createShareLink, setShareLinkRole, getShareLink } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    const token = await createShareLink("p1", "viewer");

    await setShareLinkRole("p1", "editor");

    expect(await getShareLink("p1")).toEqual({ token, role: "editor" });
  });

  it("revokeShareLink removes the link entirely", async () => {
    const { createPortfolioWithOwner, createShareLink, revokeShareLink, getShareLink } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await createShareLink("p1", "viewer");

    await revokeShareLink("p1");

    expect(await getShareLink("p1")).toBeNull();
  });
});

describe("email invites (wayframe#t37)", () => {
  it("createInvite upserts by (portfolio, email) — inviting the same address twice changes its role, not duplicates it", async () => {
    const { createPortfolioWithOwner, createInvite, listInvites } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");

    await createInvite("p1", "friend@example.com", "viewer");
    await createInvite("p1", "friend@example.com", "editor");

    const invites = await listInvites("p1");
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ email: "friend@example.com", role: "editor" });
  });

  it("createInvite normalizes email (trim + lowercase) before writing", async () => {
    const { createPortfolioWithOwner, createInvite, listInvites } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");

    await createInvite("p1", "  Friend@Example.com  ", "viewer");

    const invites = await listInvites("p1");
    expect(invites).toEqual([expect.objectContaining({ email: "friend@example.com" })]);
  });

  it("deleteInvite cancels a pending invite", async () => {
    const { createPortfolioWithOwner, createInvite, deleteInvite, listInvites } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await createInvite("p1", "friend@example.com", "viewer");

    await deleteInvite("p1", "friend@example.com");

    expect(await listInvites("p1")).toEqual([]);
  });

  it("listInvites returns only invites for the requested portfolio", async () => {
    const { createPortfolioWithOwner, createInvite, listInvites } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await createPortfolioWithOwner("p2", "user-2");
    await createInvite("p1", "a@example.com", "viewer");
    await createInvite("p2", "b@example.com", "editor");

    expect((await listInvites("p1")).map((i) => i.email)).toEqual(["a@example.com"]);
  });

  it("acceptPendingInvites resolves a pending invite into a real member row and deletes it", async () => {
    const { createPortfolioWithOwner, createInvite, acceptPendingInvites, getRole, listInvites } = await import(
      "./portfolios"
    );
    await createPortfolioWithOwner("p1", "user-1");
    await createInvite("p1", "friend@example.com", "editor");

    const portfolioIds = await acceptPendingInvites("friend-identity", "friend@example.com");

    expect(portfolioIds).toEqual(["p1"]);
    expect(await getRole("p1", "friend-identity")).toBe("editor");
    expect(await listInvites("p1")).toEqual([]);
  });

  it("acceptPendingInvites resolves invites across multiple portfolios for the same email in one call", async () => {
    const { createPortfolioWithOwner, createInvite, acceptPendingInvites, getRole } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await createPortfolioWithOwner("p2", "user-2");
    await createInvite("p1", "friend@example.com", "editor");
    await createInvite("p2", "friend@example.com", "viewer");

    const portfolioIds = await acceptPendingInvites("friend-identity", "friend@example.com");

    expect(portfolioIds.sort()).toEqual(["p1", "p2"]);
    expect(await getRole("p1", "friend-identity")).toBe("editor");
    expect(await getRole("p2", "friend-identity")).toBe("viewer");
  });

  it("acceptPendingInvites is a safe no-op when there's nothing pending", async () => {
    const { acceptPendingInvites } = await import("./portfolios");
    expect(await acceptPendingInvites("nobody-identity", "nobody@example.com")).toEqual([]);
  });

  it("acceptPendingInvites compares email case-insensitively", async () => {
    const { createPortfolioWithOwner, createInvite, acceptPendingInvites, getRole } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    await createInvite("p1", "Foo@Bar.com", "viewer");

    const portfolioIds = await acceptPendingInvites("foo-identity", "foo@bar.com");

    expect(portfolioIds).toEqual(["p1"]);
    expect(await getRole("p1", "foo-identity")).toBe("viewer");
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

describe("appendLegendCategories (wayframe#t35)", () => {
  it("appends brand-new categories to a portfolio with no content yet, returning an identity id-remap", async () => {
    const { createPortfolioWithOwner, appendLegendCategories, getPortfolioContent } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");

    const remap = await appendLegendCategories("p1", [
      { id: "cat-1", name: "Risk", color: "#f00" },
      { id: "cat-2", name: "Regulatory", color: "#00f" },
    ]);

    expect(remap).toEqual(
      new Map([
        ["cat-1", "cat-1"],
        ["cat-2", "cat-2"],
      ]),
    );
    const content = await getPortfolioContent("p1");
    expect(content?.legendCategories).toEqual([
      { id: "cat-1", name: "Risk", color: "#f00" },
      { id: "cat-2", name: "Regulatory", color: "#00f" },
    ]);
  });

  it("remaps to the existing category's id instead of duplicating when a name already exists", async () => {
    const { createPortfolioWithOwner, setPortfolioContent, appendLegendCategories, getPortfolioContent } = await import(
      "./portfolios"
    );
    await createPortfolioWithOwner("p1", "user-1");
    await setPortfolioContent("p1", { schemaVersion: 3, legendCategories: [{ id: "existing-1", name: "Risk", color: "#f00" }] });

    const remap = await appendLegendCategories("p1", [{ id: "new-1", name: "Risk", color: "#a00" }]);

    expect(remap).toEqual(new Map([["new-1", "existing-1"]]));
    const content = await getPortfolioContent("p1");
    expect(content?.legendCategories).toEqual([{ id: "existing-1", name: "Risk", color: "#f00" }]);
  });

  it("handles a mix of new and already-existing categories in one call", async () => {
    const { createPortfolioWithOwner, setPortfolioContent, appendLegendCategories, getPortfolioContent } = await import(
      "./portfolios"
    );
    await createPortfolioWithOwner("p1", "user-1");
    await setPortfolioContent("p1", { schemaVersion: 3, legendCategories: [{ id: "existing-1", name: "Risk", color: "#f00" }] });

    const remap = await appendLegendCategories("p1", [
      { id: "new-1", name: "Risk", color: "#a00" },
      { id: "new-2", name: "Regulatory", color: "#00f" },
    ]);

    expect(remap).toEqual(
      new Map([
        ["new-1", "existing-1"],
        ["new-2", "new-2"],
      ]),
    );
    const content = await getPortfolioContent("p1");
    expect(content?.legendCategories).toEqual([
      { id: "existing-1", name: "Risk", color: "#f00" },
      { id: "new-2", name: "Regulatory", color: "#00f" },
    ]);
  });

  it("is a no-op for an empty category list — content is untouched", async () => {
    const { createPortfolioWithOwner, setPortfolioContent, appendLegendCategories, getPortfolioContent } = await import(
      "./portfolios"
    );
    await createPortfolioWithOwner("p1", "user-1");
    await setPortfolioContent("p1", { schemaVersion: 3, legendCategories: [{ id: "existing-1", name: "Risk", color: "#f00" }] });

    const remap = await appendLegendCategories("p1", []);

    expect(remap.size).toBe(0);
    const content = await getPortfolioContent("p1");
    expect(content?.legendCategories).toEqual([{ id: "existing-1", name: "Risk", color: "#f00" }]);
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

describe("listMembershipsForIdentity (wayframe#123)", () => {
  it("lists every Portfolio the identity has any role on, not just owned", async () => {
    const { createPortfolioWithOwner, setMember, listMembershipsForIdentity } = await import("./portfolios");
    await createPortfolioWithOwner("owned", "user-1");
    await createPortfolioWithOwner("someone-elses", "user-2");
    await setMember("someone-elses", "user-1", "viewer");

    const memberships = await listMembershipsForIdentity("user-1");
    expect(memberships).toHaveLength(2);
    expect(memberships.find((m) => m.portfolioId === "owned")?.role).toBe("owner");
    expect(memberships.find((m) => m.portfolioId === "someone-elses")?.role).toBe("viewer");
  });

  it("includes the Portfolio row's own created_at", async () => {
    const { createPortfolioWithOwner, listMembershipsForIdentity } = await import("./portfolios");
    await createPortfolioWithOwner("p1", "user-1");
    const [membership] = await listMembershipsForIdentity("user-1");
    expect(typeof membership.portfolioCreatedAt).toBe("string");
    expect(new Date(membership.portfolioCreatedAt).toString()).not.toBe("Invalid Date");
  });

  it("returns an empty list for an identity with no memberships", async () => {
    const { listMembershipsForIdentity } = await import("./portfolios");
    expect(await listMembershipsForIdentity("stranger")).toEqual([]);
  });
});
