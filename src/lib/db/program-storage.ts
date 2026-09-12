import * as Y from "yjs";
import { getDbClient } from "./client";
import { ensureSchema } from "./schema";

// Read/write topology per wayframe#t12's resolution: one row per Program
// (a Yjs-snapshot blob keyed by program id) in `programs`, never a
// whole-Portfolio blob or normalized tables. `appendProgramUpdate` is the
// realtime server's continuous write target — it only ever inserts into
// `program_updates`, never touches `programs` — so it shares no hot row
// with `listProgramSnapshotsForPortfolio`'s cheap All-Programs read path,
// which only ever reads `programs`. `compactProgram` is what
// periodically folds the accumulated updates log back into the snapshot
// row; nothing here calls it on a schedule — see party/src/index.ts for
// where compaction actually gets triggered.

export interface ProgramSnapshotRow {
  id: string;
  snapshot: Uint8Array;
  rev: number;
  updatedAt: string;
}

/**
 * Normalizes a BLOB column's value to a Uint8Array. Deliberately avoids
 * `instanceof ArrayBuffer`/`instanceof Uint8Array` — under vitest's jsdom
 * environment, the libSQL driver's `ArrayBuffer` and the test realm's
 * global `ArrayBuffer` are different constructors, so `instanceof` silently
 * returns false across that boundary even for a genuine ArrayBuffer.
 * `ArrayBuffer.isView` and `Object.prototype.toString` both check an
 * internal slot/tag rather than the prototype chain, so they're realm-safe.
 */
function toBytes(value: unknown): Uint8Array {
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") return new Uint8Array(value as ArrayBuffer);
  throw new Error("Expected a BLOB column value");
}

/** The Program's current persisted snapshot, or null if it has never been compacted (e.g. brand new, still only in `program_updates`). */
export async function getProgramSnapshot(id: string): Promise<Uint8Array | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({ sql: "SELECT snapshot FROM programs WHERE id = ?", args: [id] });
  const row = result.rows[0];
  return row ? toBytes(row.snapshot) : null;
}

/** Appends one raw Yjs update to the program's update log — the realtime server's hot, continuous write path. Never reads or writes `programs`. */
export async function appendProgramUpdate(programId: string, update: Uint8Array): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({
    sql: "INSERT INTO program_updates (program_id, update_bytes, created_at) VALUES (?, ?, ?)",
    args: [programId, update, new Date().toISOString()],
  });
}

/**
 * Folds every pending `program_updates` row for this program into its
 * `programs.snapshot` (merging via a scratch Y.Doc — apply the existing
 * snapshot first if there is one, then each pending update, in insertion
 * order, then re-encode the merged state), upserts the row (bumping `rev`),
 * and deletes the now-merged update rows. `portfolioId` is required on
 * every call (not looked up) since `program_updates` doesn't carry it —
 * only `programs` does, and a program being compacted for the first time
 * has no `programs` row yet to look it up from.
 *
 * No-ops if there's nothing pending, so calling this speculatively/on a
 * schedule is always cheap when a program hasn't changed.
 */
export async function compactProgram(id: string, portfolioId: string): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);

  const [existing, pending] = await Promise.all([
    client.execute({ sql: "SELECT snapshot, rev FROM programs WHERE id = ?", args: [id] }),
    client.execute({ sql: "SELECT id, update_bytes FROM program_updates WHERE program_id = ? ORDER BY id ASC", args: [id] }),
  ]);

  if (pending.rows.length === 0) return;

  const doc = new Y.Doc();
  const existingRow = existing.rows[0];
  const previousRev = existingRow ? Number(existingRow.rev) : 0;
  if (existingRow) Y.applyUpdate(doc, toBytes(existingRow.snapshot));
  for (const row of pending.rows) Y.applyUpdate(doc, toBytes(row.update_bytes));
  const mergedSnapshot = Y.encodeStateAsUpdate(doc);
  const updateIds = pending.rows.map((row) => row.id as number);

  await client.batch(
    [
      {
        sql: `INSERT INTO programs (id, portfolio_id, snapshot, rev, updated_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, rev = excluded.rev, updated_at = excluded.updated_at`,
        args: [id, portfolioId, mergedSnapshot, previousRev + 1, new Date().toISOString()],
      },
      {
        sql: `DELETE FROM program_updates WHERE id IN (${updateIds.map(() => "?").join(",")})`,
        args: updateIds,
      },
    ],
    "write",
  );
}

/** The cheap All-Programs read path (wayframe#t12) — a single indexed query against `programs` only, never `program_updates`. */
export async function listProgramSnapshotsForPortfolio(portfolioId: string): Promise<ProgramSnapshotRow[]> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT id, snapshot, rev, updated_at FROM programs WHERE portfolio_id = ?",
    args: [portfolioId],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    snapshot: toBytes(row.snapshot),
    rev: Number(row.rev),
    updatedAt: String(row.updated_at),
  }));
}
