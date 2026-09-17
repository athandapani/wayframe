import * as Y from "yjs";
import { getDbClient } from "./client";
import { ensureSchema } from "./schema";
import { isProgramDocSeeded, readProgramFromDoc, seedProgramDoc } from "@/lib/realtime/program-ydoc";
import type { Program } from "@/components/timeline/types";

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
 * Loads the current merged state for one Program into a scratch `Y.Doc` —
 * the existing `programs.snapshot` (if any) with every still-pending
 * `program_updates` row applied on top, in insertion order. Factored out of
 * `compactProgram` (below) so the Program-reorder route (wayframe#t32) can
 * reuse the exact same "load the live merged doc" logic before patching it
 * via `applyProgramPatch` (program-ydoc.ts) — the same merged-doc shape a
 * connected `useProgramRoom` client would see, so a REST-triggered reorder
 * and a live editing session never disagree about a Program's current
 * content.
 *
 * Returns `null` only when there is truly nothing recorded for this id yet
 * — no `programs` row AND no pending `program_updates` rows (never seeded
 * via `createProgramFromData`, and the realtime room has never appended
 * anything for it either). The reorder route treats `null` as "Program not
 * found" — in practice every real caller only ever learns a Program's id
 * after `createProgramFromData` has already run, so this is equivalent to
 * "no programs row" for them; the slightly looser check (vs. "no programs
 * row" alone) exists so `compactProgram` keeps working exactly as before
 * for a program compacted for the first time from nothing but pending
 * updates and no `programs` row yet.
 */
export async function loadMergedProgramDoc(
  id: string,
): Promise<{ doc: Y.Doc; previousRev: number; pendingUpdateIds: number[] } | null> {
  const client = getDbClient();
  await ensureSchema(client);

  const [existing, pending] = await Promise.all([
    client.execute({ sql: "SELECT snapshot, rev FROM programs WHERE id = ?", args: [id] }),
    client.execute({ sql: "SELECT id, update_bytes FROM program_updates WHERE program_id = ? ORDER BY id ASC", args: [id] }),
  ]);

  const existingRow = existing.rows[0];
  if (!existingRow && pending.rows.length === 0) return null;

  const doc = new Y.Doc();
  const previousRev = existingRow ? Number(existingRow.rev) : 0;
  if (existingRow) Y.applyUpdate(doc, toBytes(existingRow.snapshot));
  for (const row of pending.rows) Y.applyUpdate(doc, toBytes(row.update_bytes));

  return { doc, previousRev, pendingUpdateIds: pending.rows.map((row) => row.id as number) };
}

/**
 * Folds every pending `program_updates` row for this program into its
 * `programs.snapshot` (via `loadMergedProgramDoc`), upserts the row
 * (bumping `rev`), and deletes the now-merged update rows. `portfolioId` is
 * required on every call (not looked up) since `program_updates` doesn't
 * carry it — only `programs` does, and a program being compacted for the
 * first time has no `programs` row yet to look it up from.
 *
 * No-ops if there's nothing pending, so calling this speculatively/on a
 * schedule is always cheap when a program hasn't changed.
 */
export async function compactProgram(id: string, portfolioId: string): Promise<void> {
  const merged = await loadMergedProgramDoc(id);
  if (!merged || merged.pendingUpdateIds.length === 0) return;

  const client = getDbClient();
  await ensureSchema(client);
  const mergedSnapshot = Y.encodeStateAsUpdate(merged.doc);

  await client.batch(
    [
      {
        sql: `INSERT INTO programs (id, portfolio_id, snapshot, rev, updated_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, rev = excluded.rev, updated_at = excluded.updated_at`,
        args: [id, portfolioId, mergedSnapshot, merged.previousRev + 1, new Date().toISOString()],
      },
      {
        sql: `DELETE FROM program_updates WHERE id IN (${merged.pendingUpdateIds.map(() => "?").join(",")})`,
        args: merged.pendingUpdateIds,
      },
    ],
    "write",
  );
}

/**
 * wayframe#t17's local-artifact migration primitive: seeds a brand-new
 * `programs` row directly from a whole Program object, with no prior
 * content, no concurrent editor, and no undo history to clobber — the same
 * "legitimate bulk seed, not a swap" reasoning t35's gist already uses for
 * AI-extraction's own new-Program case. Goes through `seedProgramDoc`
 * (src/lib/realtime/program-ydoc.ts) — the real field-level Program-JSON-
 * to-Y.Map bridge t38 built for the live realtime room — rather than the
 * old whole-object-blob encoding this function used before, so a Program
 * created here is *already* in the exact shape `useProgramRoom`'s
 * `isProgramDocSeeded` check expects: it seeds correctly on the room's very
 * first connection instead of racing/duplicating a from-REST reseed. Caller
 * must set `program.portfolioId` correctly first; it's persisted as given,
 * not overridden here.
 */
export async function createProgramFromData(program: Program): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  const doc = new Y.Doc();
  seedProgramDoc(doc, program);
  const snapshot = Y.encodeStateAsUpdate(doc);
  await client.execute({
    sql: "INSERT INTO programs (id, portfolio_id, snapshot, rev, updated_at) VALUES (?, ?, ?, 1, ?)",
    args: [program.id, program.portfolioId, snapshot, new Date().toISOString()],
  });
}

/**
 * Decodes a Program snapshot blob back into a plain Program object via
 * `readProgramFromDoc` (program-ydoc.ts) — builds a scratch `Y.Doc`,
 * applies the snapshot update, and reads it back out. Returns null rather
 * than throwing on unreadable input (an empty/garbage byte array, or a
 * structurally-valid Yjs update that was simply never seeded via
 * `seedProgramDoc` — `isProgramDocSeeded` is what actually distinguishes
 * "nothing here yet" from real content, since a garbage-but-parseable
 * update wouldn't otherwise throw), matching this function's original
 * documented contract.
 */
export function decodeProgramSnapshot(snapshot: Uint8Array): Program | null {
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, snapshot);
    if (!isProgramDocSeeded(doc)) return null;
    return readProgramFromDoc(doc);
  } catch {
    // A structurally-invalid update (e.g. an empty/garbage byte array)
    // throws inside yjs's own decoder rather than returning a sentinel —
    // treat that the same as "no program data here yet" rather than
    // propagating a decode error to callers.
    return null;
  }
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
