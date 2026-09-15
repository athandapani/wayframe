import { getDbClient } from "./client";
import { ensureSchema } from "./schema";
import { CURRENT_SCHEMA_VERSION } from "@/lib/document-file/schema";
import type { LegendCategory, Portfolio } from "@/components/timeline/types";

// Membership/role storage per wayframe#t16's resolution: three roles
// (owner/editor/viewer) held per-identity on a Portfolio, checked
// server-side at the Partykit room (party/src/membership.ts mirrors the
// read side of this against its own duplicated Turso client) rather than
// trusted from anything a client sends. A public share link is not a
// fourth role — `portfolio_share_links` just hands editor/viewer to
// whoever holds the token via a lightweight guest identity minted at
// connect time, so it never appears in `portfolio_members`.
//
// wayframe#t37 adds the other invite mechanism, email: a
// `portfolio_invites` row is a pending, owner-chosen role sitting keyed by
// email (not identity, since the recipient's real identity isn't known
// until they actually sign in) — resolved into a real `portfolio_members`
// row and deleted the moment a matching-email identity is observed
// (acceptPendingInvites), never itself checked as a role anywhere before
// that. t37 also tightens the share-link invariant from "a link exists"
// to "at most one link ever exists per Portfolio" — createShareLink is now
// an atomic delete-then-insert, so regenerating a link is a real replace
// (the old token stops resolving immediately) rather than minting a
// second live row alongside it.
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

/** The Portfolio's current public link (token + granted role), or null if none exists yet. */
export async function getShareLink(portfolioId: string): Promise<{ token: string; role: ShareRole } | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT token, role FROM portfolio_share_links WHERE portfolio_id = ?",
    args: [portfolioId],
  });
  const row = result.rows[0];
  return row ? { token: String(row.token), role: row.role as ShareRole } : null;
}

/**
 * Creates the Portfolio's public link if none exists, or regenerates it (a
 * fresh token, invalidating the previous one — the old token stops
 * resolving immediately) if one already does. Implemented as an atomic
 * delete-then-insert (same `client.batch(..., "write")` pattern
 * createPortfolioWithOwner uses) so there's never a moment with more than
 * one live row for this Portfolio, and a regenerate can't race into two
 * live tokens.
 */
export async function createShareLink(portfolioId: string, role: ShareRole): Promise<string> {
  const client = getDbClient();
  await ensureSchema(client);
  const token = crypto.randomUUID();
  await client.batch(
    [
      { sql: "DELETE FROM portfolio_share_links WHERE portfolio_id = ?", args: [portfolioId] },
      {
        sql: "INSERT INTO portfolio_share_links (token, portfolio_id, role, created_at) VALUES (?, ?, ?, ?)",
        args: [token, portfolioId, role, new Date().toISOString()],
      },
    ],
    "write",
  );
  return token;
}

/** Changes the role an existing link grants, without changing its token. No-ops if no link exists yet for this Portfolio (caller should call createShareLink first in that case). */
export async function setShareLinkRole(portfolioId: string, role: ShareRole): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({
    sql: "UPDATE portfolio_share_links SET role = ? WHERE portfolio_id = ?",
    args: [role, portfolioId],
  });
}

/** Revokes the Portfolio's public link entirely — no link exists until createShareLink is called again. */
export async function revokeShareLink(portfolioId: string): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({ sql: "DELETE FROM portfolio_share_links WHERE portfolio_id = ?", args: [portfolioId] });
}

/** Resolves a token to its Portfolio + granted role, or null. Still used by party/'s own duplicated read-side lookup and by the new `view` route. */
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

/** The Portfolio-level shared fields (wayframe#t17) — everything Portfolio carries except `id`, which is the row's own primary key. */
export type PortfolioContent = Omit<Portfolio, "id">;

/** Overwrites a Portfolio row's content blob wholesale — same whole-object-write posture as t12's Program snapshot, appropriate here since there's no concurrent-write path onto this column yet (only the t17 migration trigger writes it today). */
export async function setPortfolioContent(portfolioId: string, content: PortfolioContent): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({
    sql: "UPDATE portfolios SET content = ? WHERE id = ?",
    args: [JSON.stringify(content), portfolioId],
  });
}

export async function getPortfolioContent(portfolioId: string): Promise<PortfolioContent | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({ sql: "SELECT content FROM portfolios WHERE id = ?", args: [portfolioId] });
  const row = result.rows[0];
  return row ? (JSON.parse(String(row.content)) as PortfolioContent) : null;
}

/**
 * Additively merges newly-invented categories into a Portfolio's legend
 * (wayframe#t35) — an existing category (matched by `name`) is kept as-is,
 * never overwritten, so this never stomps a category another Program
 * already references. Returns a map from each input category's id to the
 * id it should actually be referenced by (its own id if newly added, or
 * the existing category's id if one with that name already existed) — the
 * caller uses this to remap any `categoryId` the new content assigned
 * before this merge ran. No-ops (and skips the write entirely) if every
 * input category already exists by name.
 */
export async function appendLegendCategories(portfolioId: string, categories: LegendCategory[]): Promise<Map<string, string>> {
  const content = await getPortfolioContent(portfolioId);
  const existing = content?.legendCategories ?? [];
  const byName = new Map(existing.map((c) => [c.name, c]));
  const idRemap = new Map<string, string>();
  const merged = [...existing];
  for (const cat of categories) {
    const match = byName.get(cat.name);
    if (match) {
      idRemap.set(cat.id, match.id);
    } else {
      merged.push(cat);
      byName.set(cat.name, cat);
      idRemap.set(cat.id, cat.id);
    }
  }
  if (merged.length !== existing.length) {
    await setPortfolioContent(portfolioId, { ...content, schemaVersion: content?.schemaVersion ?? CURRENT_SCHEMA_VERSION, legendCategories: merged });
  }
  return idRemap;
}

/**
 * wayframe#t17's migration-idempotency check: does `identity` already own a
 * Portfolio? The local-artifact migration trigger calls this before writing
 * anything so a second sign-in (a second browser, or the same browser after
 * `wayframe:portfolio-migrated` somehow got cleared) re-uses the existing
 * Portfolio instead of creating a duplicate. Deliberately scoped to the
 * `owner` role only — an identity that's merely an editor/viewer on someone
 * else's shared Portfolio has nothing local of their own to have migrated.
 */
export async function getOwnedPortfolioId(identity: string): Promise<string | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT portfolio_id FROM portfolio_members WHERE identity = ? AND role = 'owner' LIMIT 1",
    args: [identity],
  });
  const row = result.rows[0];
  return row ? String(row.portfolio_id) : null;
}

// Email-invite storage (wayframe#t37) — see this file's header comment and
// schema.ts's portfolio_invites table comment for the "pending until a
// matching-email sign-in resolves it" design.
export interface PendingInvite {
  email: string;
  role: ShareRole;
  createdAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Creates or re-roles a pending invite for `email` on `portfolioId` (upsert by (portfolio_id, lowercased email) — invite the same address twice and the second call just changes its role, doesn't duplicate). Normalizes email via `.trim().toLowerCase()` before writing. */
export async function createInvite(portfolioId: string, email: string, role: ShareRole): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({
    sql: `INSERT INTO portfolio_invites (portfolio_id, email, role, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(portfolio_id, email) DO UPDATE SET role = excluded.role`,
    args: [portfolioId, normalizeEmail(email), role, new Date().toISOString()],
  });
}

export async function listInvites(portfolioId: string): Promise<PendingInvite[]> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT email, role, created_at FROM portfolio_invites WHERE portfolio_id = ?",
    args: [portfolioId],
  });
  return result.rows.map((row) => ({
    email: String(row.email),
    role: row.role as ShareRole,
    createdAt: String(row.created_at),
  }));
}

/** Cancels one pending invite. `email` should already be normalized by the caller (the route layer) the same way createInvite normalizes it, since this deletes by exact match. */
export async function deleteInvite(portfolioId: string, email: string): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({
    sql: "DELETE FROM portfolio_invites WHERE portfolio_id = ? AND email = ?",
    args: [portfolioId, email],
  });
}

/**
 * Resolves every pending invite across ALL Portfolios matching `email`
 * (normalized the same way) into a real `portfolio_members` row for
 * `identity` at that invite's role, then deletes the resolved invite rows.
 * Called once per authenticated sign-in (see the new accept-invites route)
 * — safe to call repeatedly; a second call after all invites are already
 * resolved is just a no-op (empty result). Returns the portfolio ids that
 * were just granted, so the client can react (e.g. offer to open one).
 * Uses an upsert (setMember) rather than a plain insert so an identity
 * that already independently holds a role on that Portfolio (e.g. was
 * already invited once, already accepted, gets invited again at a
 * different role) gets the invite's role rather than erroring.
 */
export async function acceptPendingInvites(identity: string, email: string): Promise<string[]> {
  const client = getDbClient();
  await ensureSchema(client);
  const normalized = normalizeEmail(email);
  const result = await client.execute({
    sql: "SELECT portfolio_id, role FROM portfolio_invites WHERE email = ?",
    args: [normalized],
  });
  const portfolioIds: string[] = [];
  for (const row of result.rows) {
    const portfolioId = String(row.portfolio_id);
    const role = row.role as ShareRole;
    await setMember(portfolioId, identity, role);
    portfolioIds.push(portfolioId);
  }
  await client.execute({ sql: "DELETE FROM portfolio_invites WHERE email = ?", args: [normalized] });
  return portfolioIds;
}
