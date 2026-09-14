import { getDbClient } from "./client";
import { ensureSchema } from "./schema";

// Membership/role storage per wayframe#t16's resolution: three roles
// (owner/editor/viewer) held per-identity on a Portfolio, checked
// server-side at the Partykit room (party/src/membership.ts mirrors the
// read side of this against its own duplicated Turso client) rather than
// trusted from anything a client sends. A public share link is not a
// fourth role — `portfolio_share_links` just hands editor/viewer to
// whoever holds the token via a lightweight guest identity minted at
// connect time, so it never appears in `portfolio_members`.
export type Role = "owner" | "editor" | "viewer";
export type ShareRole = "editor" | "viewer";

/** Creates a brand-new Portfolio row and grants `ownerId` the owner role, atomically. This is the primitive wayframe#t17's "signed-in identity becomes owner of a new Portfolio" migration trigger is expected to call — not yet wired to any route here. */
export async function createPortfolioWithOwner(portfolioId: string, ownerId: string): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  const now = new Date().toISOString();
  await client.batch(
    [
      { sql: "INSERT INTO portfolios (id, created_at) VALUES (?, ?)", args: [portfolioId, now] },
      {
        sql: "INSERT INTO portfolio_members (portfolio_id, identity, role, created_at) VALUES (?, ?, 'owner', ?)",
        args: [portfolioId, ownerId, now],
      },
    ],
    "write",
  );
}

/** Invites or re-roles an identity on a Portfolio. Upsert, not additive — calling this again with a different role changes it. */
export async function setMember(portfolioId: string, identity: string, role: Role): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({
    sql: `INSERT INTO portfolio_members (portfolio_id, identity, role, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(portfolio_id, identity) DO UPDATE SET role = excluded.role`,
    args: [portfolioId, identity, role, new Date().toISOString()],
  });
}

export async function removeMember(portfolioId: string, identity: string): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({
    sql: "DELETE FROM portfolio_members WHERE portfolio_id = ? AND identity = ?",
    args: [portfolioId, identity],
  });
}

export async function listMembers(portfolioId: string): Promise<{ identity: string; role: Role }[]> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT identity, role FROM portfolio_members WHERE portfolio_id = ?",
    args: [portfolioId],
  });
  return result.rows.map((row) => ({ identity: String(row.identity), role: row.role as Role }));
}

/** The role `identity` holds directly on `portfolioId`, or null if they're not a member at all. Ignores share links — those grant access to a specific guest identity, not to any real signed-in identity. */
export async function getRole(portfolioId: string, identity: string): Promise<Role | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT role FROM portfolio_members WHERE portfolio_id = ? AND identity = ?",
    args: [portfolioId, identity],
  });
  const row = result.rows[0];
  return row ? (row.role as Role) : null;
}

/** Resolves a role by Program id rather than Portfolio id — the shape the Partykit room (keyed by program id) actually needs. Denies access (returns null) if the Program has no row yet, same fail-closed posture as an unknown identity. */
export async function getRoleForProgram(programId: string, identity: string): Promise<Role | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const programRow = await client.execute({
    sql: "SELECT portfolio_id FROM programs WHERE id = ?",
    args: [programId],
  });
  const portfolioId = programRow.rows[0]?.portfolio_id;
  if (!portfolioId) return null;
  return getRole(String(portfolioId), identity);
}

/** Mints a new public share link for a Portfolio, granting `role` to whoever holds the returned token. */
export async function createShareLink(portfolioId: string, role: ShareRole): Promise<string> {
  const client = getDbClient();
  await ensureSchema(client);
  const token = crypto.randomUUID();
  await client.execute({
    sql: "INSERT INTO portfolio_share_links (token, portfolio_id, role, created_at) VALUES (?, ?, ?, ?)",
    args: [token, portfolioId, role, new Date().toISOString()],
  });
  return token;
}

export async function resolveShareLink(token: string): Promise<{ portfolioId: string; role: ShareRole } | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT portfolio_id, role FROM portfolio_share_links WHERE token = ?",
    args: [token],
  });
  const row = result.rows[0];
  return row ? { portfolioId: String(row.portfolio_id), role: row.role as ShareRole } : null;
}

export async function deleteShareLink(token: string): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({ sql: "DELETE FROM portfolio_share_links WHERE token = ?", args: [token] });
}
