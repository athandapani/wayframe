import { createClient, type Client } from "@libsql/client/web";

// party/'s own minimal Turso client (wayframe#t12) — duplicated from
// src/lib/db/client.ts/schema.ts/program-storage.ts rather than imported,
// per t4's own comment on PortfolioRoom: this Worker is a separate
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

export interface ProgramSnapshotRow {
  id: string;
  snapshot: Uint8Array;
}

/** Mirrors src/lib/db/program-storage.ts's listProgramSnapshotsForPortfolio — this Worker only needs id+snapshot to seed each Program subdoc on room start. */
export async function loadProgramSnapshotsForPortfolio(env: PartyEnv, portfolioId: string): Promise<ProgramSnapshotRow[]> {
  const db = getPartyDbClient(env);
  await ensureSchema(db);
  const result = await db.execute({ sql: "SELECT id, snapshot FROM programs WHERE portfolio_id = ?", args: [portfolioId] });
  return result.rows.map((row) => ({ id: String(row.id), snapshot: toBytes(row.snapshot) }));
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
