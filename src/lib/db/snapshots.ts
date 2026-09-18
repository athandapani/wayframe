import { nanoid } from "nanoid";
import { getDbClient } from "./client";
import { ensureSchema } from "./schema";
import type { Slide } from "@/lib/export/deck-ir";
import type { ExportSelection } from "@/lib/export/build-export-slides";

/**
 * `ExportSelection` (build-export-slides.ts) carries two `Set<string>`
 * fields (`individualBaselineProgramIds`/`scenarioProgramProgramIds`) which
 * `JSON.stringify` silently flattens to `{}` — never persist an
 * `ExportSelection` as-is. This is the wire/storage-safe variant: the same
 * shape with those two fields as plain arrays. The API route layer is
 * responsible for converting a client's `ExportSelection` into this shape
 * before it ever reaches this module (by the time a request body is
 * JSON-parsed, the Sets are already plain arrays from the wire format).
 */
export type SerializedExportSelection = Omit<ExportSelection, "individualBaselineProgramIds" | "scenarioProgramProgramIds"> & {
  individualBaselineProgramIds: string[];
  scenarioProgramProgramIds: string[];
};

/** List-view shape — deliberately omits `slides` to keep `listSnapshots` cheap; fetch a single snapshot via `getSnapshot` for the full IR blob. */
export interface PortfolioSnapshotSummary {
  id: string;
  creatorIdentity: string;
  createdAt: string;
  selection: SerializedExportSelection;
}

export interface PortfolioSnapshot extends PortfolioSnapshotSummary {
  slides: Slide[];
}

/**
 * Creates a new, immutable Snapshot row (wayframe#t31) — append-only per
 * #t11's existing ruling, so this module deliberately has no update/delete
 * function. Returns the new row's id.
 */
export async function createSnapshot(portfolioId: string, creatorIdentity: string, selection: SerializedExportSelection, slides: Slide[]): Promise<string> {
  const client = getDbClient();
  await ensureSchema(client);
  const id = nanoid();
  await client.execute({
    sql: "INSERT INTO portfolio_snapshots (id, portfolio_id, creator_identity, created_at, selection, slides) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, portfolioId, creatorIdentity, new Date().toISOString(), JSON.stringify(selection), JSON.stringify(slides)],
  });
  return id;
}

/** Every Snapshot saved for a Portfolio, newest first, without the (potentially large) `slides` IR blob. */
export async function listSnapshots(portfolioId: string): Promise<PortfolioSnapshotSummary[]> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT id, creator_identity, created_at, selection FROM portfolio_snapshots WHERE portfolio_id = ? ORDER BY created_at DESC",
    args: [portfolioId],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    creatorIdentity: String(row.creator_identity),
    createdAt: String(row.created_at),
    selection: JSON.parse(String(row.selection)) as SerializedExportSelection,
  }));
}

/**
 * One Snapshot's full row including its `slides` IR blob. Checks
 * `portfolio_id` alongside `id` so one Portfolio's member can't fetch
 * another Portfolio's Snapshot by guessing/reusing an id. Returns `null` if
 * no row matches both.
 */
export async function getSnapshot(portfolioId: string, snapshotId: string): Promise<PortfolioSnapshot | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT id, creator_identity, created_at, selection, slides FROM portfolio_snapshots WHERE id = ? AND portfolio_id = ?",
    args: [snapshotId, portfolioId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    creatorIdentity: String(row.creator_identity),
    createdAt: String(row.created_at),
    selection: JSON.parse(String(row.selection)) as SerializedExportSelection,
    slides: JSON.parse(String(row.slides)) as Slide[],
  };
}
