import type { Client } from "@libsql/client";

// Per-Program row storage (wayframe#t12's resolution) — see
// program-storage.ts for the query functions this schema backs.
//
// No separate migration-file runner exists in this repo yet (t1's
// migration ladder is for the JSON document's `schemaVersion`, a
// completely different concern from these DB-row tables). Since this
// schema is purely additive today (two tables, no evolving column set),
// idempotent `CREATE TABLE IF NOT EXISTS` run lazily via `client.migrate()`
// (libSQL's dedicated schema-statement method, distinct from `batch()`) is
// simpler than standing up a real migration framework for one ticket's
// tables — revisit if a future ticket needs an actual ALTER-driven ladder.
//
// `update_bytes` (not `update`, despite the ticket's own preview) — `UPDATE`
// is a SQL reserved keyword; naming the column literally `update` would
// need quoting at every call site, so it's spelled out instead.
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

// Memoized per-Client instance (not module-global) so tests pointing
// separate Client instances at separate temp DBs each get their own
// bootstrap, rather than sharing one process-wide "already ran" flag.
const initialized = new WeakSet<Client>();

export async function ensureSchema(client: Client): Promise<void> {
  if (initialized.has(client)) return;
  await client.migrate(SCHEMA_STATEMENTS);
  initialized.add(client);
}
