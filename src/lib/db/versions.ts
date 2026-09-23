import { nanoid } from "nanoid";
import { getDbClient } from "./client";
import { ensureSchema } from "./schema";
import type { Program } from "@/components/timeline/types";

// Version History storage (wayframe#128, resolved by #119 + #127).
//
// A Version is a manual, whole-Roadmap capture of every Program's document
// state at one moment — the concept #119 deliberately named "Version" rather
// than "Snapshot", because an (Export) Snapshot freezes a Deck IR *rendering*
// for archival/re-download while a Version freezes the *documents* so they can
// be read back as a roadmap. They share a shape (append-only rows, one per
// deliberate user action) and nothing else; see schema.ts's own comment on
// `portfolio_versions` for why they are two tables.
//
// Append-only in the same sense `snapshots.ts` is: there is no function here
// that changes a Version's CONTENT, and there is no delete. `renameVersion` is
// the one mutation, and it touches `label` only — #127's resolution made
// naming post-hoc (you save in one click, then name the row that appears), so
// the label has to be writable for the feature to exist at all. Restoring a
// Version back onto the live document is deliberately out of scope (#128's own
// gist) and would be a write path into every Program's Yjs room, not anything
// this module could do.

/** List-view shape — deliberately omits `programs` so `listVersions` never ships N full Program documents per row. */
export interface PortfolioVersionSummary {
  id: string;
  creatorIdentity: string;
  /** Display name captured at save time, or null when the session had none. Never used as an identity — see `creatorIdentity`. */
  creatorName: string | null;
  createdAt: string;
  /** User-supplied name, or null for an unnamed Version (the list falls back to its saved-at time). */
  label: string | null;
  programCount: number;
  milestoneCount: number;
}

export interface PortfolioVersion extends PortfolioVersionSummary {
  programs: Program[];
}

/**
 * Appends one Version row. `programs` is stored exactly as given — the caller
 * (the API route) is responsible for it being the freshest server-side state,
 * since nothing here can see a connected room's in-memory doc.
 *
 * Returns the new row's id, which the caller hands back so the UI can open it
 * in its inline rename field.
 */
export async function createVersion(
  portfolioId: string,
  creatorIdentity: string,
  creatorName: string | null,
  programs: Program[],
  label: string | null = null,
): Promise<string> {
  const client = getDbClient();
  await ensureSchema(client);
  const id = nanoid();
  await client.execute({
    sql: "INSERT INTO portfolio_versions (id, portfolio_id, creator_identity, creator_name, created_at, label, program_count, milestone_count, programs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      id,
      portfolioId,
      creatorIdentity,
      creatorName,
      new Date().toISOString(),
      label,
      programs.length,
      programs.reduce((n, p) => n + p.milestones.length, 0),
      JSON.stringify(programs),
    ],
  });
  return id;
}

/** Every Version saved for a Roadmap, newest first, without the (large) `programs` blob. */
export async function listVersions(portfolioId: string): Promise<PortfolioVersionSummary[]> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT id, creator_identity, creator_name, created_at, label, program_count, milestone_count FROM portfolio_versions WHERE portfolio_id = ? ORDER BY created_at DESC, rowid DESC",
    args: [portfolioId],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    creatorIdentity: String(row.creator_identity),
    creatorName: row.creator_name === null ? null : String(row.creator_name),
    createdAt: String(row.created_at),
    label: row.label === null ? null : String(row.label),
    programCount: Number(row.program_count),
    milestoneCount: Number(row.milestone_count),
  }));
}

/**
 * One Version's full row including its `programs` documents. Checks
 * `portfolio_id` alongside `id` — same reasoning as `getSnapshot`: a member of
 * one Roadmap must not be able to read another Roadmap's Version by reusing an
 * id. Returns `null` if no row matches both.
 */
export async function getVersion(portfolioId: string, versionId: string): Promise<PortfolioVersion | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT id, creator_identity, creator_name, created_at, label, program_count, milestone_count, programs FROM portfolio_versions WHERE id = ? AND portfolio_id = ?",
    args: [versionId, portfolioId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    creatorIdentity: String(row.creator_identity),
    creatorName: row.creator_name === null ? null : String(row.creator_name),
    createdAt: String(row.created_at),
    label: row.label === null ? null : String(row.label),
    programCount: Number(row.program_count),
    milestoneCount: Number(row.milestone_count),
    programs: JSON.parse(String(row.programs)) as Program[],
  };
}

/**
 * Sets (or clears, with `null`) a Version's label. The only mutation in this
 * module, and it reaches the label column only — a Version's captured content
 * is immutable. Scoped by `portfolio_id` for the same reason `getVersion` is.
 * Returns false when no row matched, so a route can 404 rather than silently
 * reporting success.
 */
export async function renameVersion(portfolioId: string, versionId: string, label: string | null): Promise<boolean> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "UPDATE portfolio_versions SET label = ? WHERE id = ? AND portfolio_id = ?",
    args: [label, versionId, portfolioId],
  });
  return result.rowsAffected > 0;
}
