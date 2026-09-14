import { createClient, type Client } from "@libsql/client/web";

// party/'s own minimal Turso client (wayframe#t12) — duplicated from
// src/lib/db/client.ts/schema.ts/program-storage.ts rather than imported,
// per t4's own comment on the room class (ProgramRoom, t14): this Worker is a separate
// deployable from the Next.js app (different runtime — Cloudflare Workers
// has no Node `fs`, so it needs libSQL's fetch-based `/web` client, not the
// Node client `src/lib/db/client.ts` uses for its local-file dev fallback).
// Same Turso database, reached over HTTP either way.
//
// `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` need to exist as Worker
// vars/secrets before `wrangler deploy` — see wrangler.jsonc's comment.
// There's no local-file fallback here (the `/web` client is HTTP-only, no
// embedded-replica/file mode) — local `wrangler dev` testing needs either a
// real Turso branch or `turso dev`'s local HTTP emulator pointed at via the
// same two vars.
export interface PartyEnv {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN?: string;
  // Room-access token signing secret (wayframe#t16) — must equal the
  // Next.js app's AUTH_SECRET exactly, or every token verification fails
  // closed. `wrangler secret put AUTH_SECRET` before deploying.
  AUTH_SECRET?: string;
}

let client: Client | undefined;

function getPartyDbClient(env: PartyEnv): Client {
  if (client) return client;
  client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  return client;
}

// Same schema as src/lib/db/schema.ts — kept in sync by hand since these
// are two separate packages. See that file's doc for why lazy
// `CREATE TABLE IF NOT EXISTS` rather than a migration-file runner.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS programs (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL,
    snapshot BLOB NOT NULL,
    rev INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS programs_portfolio_id ON programs (portfolio_id)`,
  `CREATE TABLE IF NOT EXISTS program_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id TEXT NOT NULL,
    update_bytes BLOB NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS program_updates_program_id ON program_updates (program_id)`,
  // Membership/role tables (wayframe#t16) — see src/lib/db/schema.ts for
  // the doc comment; kept in sync by hand like the rest of this file.
  `CREATE TABLE IF NOT EXISTS portfolios (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS portfolio_members (
    portfolio_id TEXT NOT NULL,
    identity TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (portfolio_id, identity)
  )`,
  `CREATE INDEX IF NOT EXISTS portfolio_members_portfolio_id ON portfolio_members (portfolio_id)`,
  `CREATE TABLE IF NOT EXISTS portfolio_share_links (
    token TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('editor','viewer')),
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS portfolio_share_links_portfolio_id ON portfolio_share_links (portfolio_id)`,
];

let schemaReady: Promise<void> | undefined;

async function ensureSchema(db: Client): Promise<void> {
  if (!schemaReady) schemaReady = db.migrate(SCHEMA_STATEMENTS).then(() => undefined);
  return schemaReady;
}

function toBytes(value: unknown): Uint8Array {
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") return new Uint8Array(value as ArrayBuffer);
  throw new Error("Expected a BLOB column value");
}

/** Mirrors src/lib/db/program-storage.ts's getProgramSnapshot — one room per Program (t14) only ever needs its own single row to seed its doc on room start. Returns undefined when the Program has no row yet (a brand-new Program). */
export async function loadProgramSnapshot(env: PartyEnv, programId: string): Promise<Uint8Array | undefined> {
  const db = getPartyDbClient(env);
  await ensureSchema(db);
  const result = await db.execute({ sql: "SELECT snapshot FROM programs WHERE id = ?", args: [programId] });
  const row = result.rows[0];
  return row ? toBytes(row.snapshot) : undefined;
}

/** Mirrors src/lib/db/program-storage.ts's appendProgramUpdate — the hot path a Program subdoc's own `update` event calls on every edit. Never touches `programs`; compaction (the Next.js app's job, not this Worker's) is what folds these into a snapshot. */
export async function appendProgramUpdate(env: PartyEnv, programId: string, update: Uint8Array): Promise<void> {
  const db = getPartyDbClient(env);
  await ensureSchema(db);
  await db.execute({
    sql: "INSERT INTO program_updates (program_id, update_bytes, created_at) VALUES (?, ?, ?)",
    args: [programId, update, new Date().toISOString()],
  });
}
