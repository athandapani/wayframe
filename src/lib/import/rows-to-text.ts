// Promoted from wayframe#13's prototype (prototype/structured-import) —
// the shape both import sources (file upload, Smartsheet) converge on. The
// same plain-text blob shape the existing /api/extract route already
// accepts as `text` (see src/lib/extraction/prompt.ts) — no new API field,
// no schema change.
export type ParsedRow = Record<string, string>;

export function rowsToText(sourceLabel: string, rows: ParsedRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [`Source: ${sourceLabel}`, headers.join(" | "), ...rows.map((r) => headers.map((h) => r[h] ?? "").join(" | "))];
  return lines.join("\n");
}
