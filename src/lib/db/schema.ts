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
// Membership/role tables (wayframe#t16's resolution) — three roles
// (owner/editor/viewer) held per-identity on a Portfolio, checked
// server-side (see party/src/membership.ts + party/src/index.ts's
// onBeforeConnect) rather than trusted from any client-supplied value.
// `portfolio_share_links` is the public-link mechanism: it hands out
// editor/viewer to whoever holds the token via a lightweight guest
// identity, not a fourth role, so it never appears in `portfolio_members`.
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
  // `content` (wayframe#t17): the Portfolio-level shared fields
  // (schemaVersion/companyLogo/legendCategories/theme/scenarios) as one JSON
  // blob — see portfolios.ts's setPortfolioContent/getPortfolioContent. A
  // local dev DB file (`.data/wayframe-dev.db`) created before this column
  // existed needs deleting to pick it up, same "no ALTER ladder yet" caveat
  // this file's header comment already carries.
  `CREATE TABLE IF NOT EXISTS portfolios (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '{}'
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
  // `portfolio_invites` (wayframe#t37): a pending, not-yet-resolved email
  // invite — an owner-chosen role (editor/viewer) sitting keyed by email
  // rather than identity, because at invite time the recipient's real
  // (Google `sub`-based) identity isn't known yet. It's resolved into a
  // real `portfolio_members` row the moment a matching-email identity signs
  // in (see portfolios.ts's acceptPendingInvites), then the invite row is
  // deleted — a pending invite never itself grants any role anywhere, it's
  // purely a "who to promote on next matching sign-in" marker, checked by
  // nothing else. `email` must always be written already `.trim().toLowerCase()`d
  // by the write path (createInvite) — SQLite has no case-insensitive
  // collation configured here, so the read path (acceptPendingInvites)
  // compares against an already-lowercased session email rather than doing
  // any case-folding itself.
  `CREATE TABLE IF NOT EXISTS portfolio_invites (
    portfolio_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('editor','viewer')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (portfolio_id, email)
  )`,
  `CREATE INDEX IF NOT EXISTS portfolio_invites_email ON portfolio_invites (email)`,
  // `google_oauth_tokens` (wayframe#t30): one row per signed-in identity
  // (not per-Portfolio/Program — t12's schema only covers per-Program Yjs
  // data), holding the incrementally-granted Slides/Drive refresh token so
  // it's requested once and reused for every future export rather than
  // re-prompting each time. `encrypted_refresh_token` is AES-GCM ciphertext
  // (see token-crypto.ts) — never stored plain. `access_token`/
  // `access_token_expires_at` are a short-lived cache refreshed on demand
  // (google-tokens.ts's refreshAccessToken) so most export clicks don't need
  // a round trip to Google's token endpoint at all. `drive_folder_id`/
  // `drive_folder_name` are the "last-picked Drive folder, remembered per
  // identity" the ticket's gist asks for — not sensitive, so they ride along
  // in the same row rather than a second table.
  `CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    identity TEXT PRIMARY KEY,
    encrypted_refresh_token TEXT NOT NULL,
    scope TEXT NOT NULL,
    access_token TEXT,
    access_token_expires_at INTEGER,
    drive_folder_id TEXT,
    drive_folder_name TEXT,
    updated_at TEXT NOT NULL
  )`,
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
