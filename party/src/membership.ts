import { createClient, type Client } from "@libsql/client/web";
import type { PartyEnv } from "./db";

// Read side of src/lib/db/portfolios.ts's membership model, duplicated
// against party's own `/web` Turso client for the same package-boundary
// reason party/src/db.ts already documents. This is where wayframe#t16's
// "enforced server-side at the Partykit room" clause actually lives — see
// index.ts's onBeforeConnect, the only caller.
export type Role = "owner" | "editor" | "viewer";
export type ShareRole = "editor" | "viewer";

let client: Client | undefined;

function getClient(env: PartyEnv): Client {
  if (client) return client;
  client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  return client;
}

/** The role `identity` holds on the Portfolio that owns `programId`, or null if either the Program has no row yet or the identity isn't a member — both fail closed to "no access," never an assumed default. */
export async function resolveProgramRole(env: PartyEnv, programId: string, identity: string): Promise<Role | null> {
  const db = getClient(env);
  const programRow = await db.execute({ sql: "SELECT portfolio_id FROM programs WHERE id = ?", args: [programId] });
  const portfolioId = programRow.rows[0]?.portfolio_id;
  if (!portfolioId) return null;

  const memberRow = await db.execute({
    sql: "SELECT role FROM portfolio_members WHERE portfolio_id = ? AND identity = ?",
    args: [String(portfolioId), identity],
  });
  const role = memberRow.rows[0]?.role;
  return role ? (role as Role) : null;
}

/** Resolves a public share-link token to the role it grants, but only if that link's Portfolio is actually the one that owns `programId` — a link minted for one Portfolio must never grant access to a different one. */
export async function resolveShareLinkRole(env: PartyEnv, programId: string, shareToken: string): Promise<ShareRole | null> {
  const db = getClient(env);
  const [programRow, linkRow] = await Promise.all([
    db.execute({ sql: "SELECT portfolio_id FROM programs WHERE id = ?", args: [programId] }),
    db.execute({ sql: "SELECT portfolio_id, role FROM portfolio_share_links WHERE token = ?", args: [shareToken] }),
  ]);

  const programPortfolioId = programRow.rows[0]?.portfolio_id;
  const link = linkRow.rows[0];
  if (!programPortfolioId || !link) return null;
  if (String(link.portfolio_id) !== String(programPortfolioId)) return null;
  return link.role as ShareRole;
}
