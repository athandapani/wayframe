import type { ParsedRow } from "@/lib/import/rows-to-text";
import { requireEnv } from "@/lib/server/env-guard";

// Server-only — SMARTSHEET_API_TOKEN never reaches the client, same reason
// the Anthropic key doesn't (see src/app/api/extract/route.ts). Personal
// Access Token per wayframe#12's resolution, not OAuth.
const SMARTSHEET_BASE = "https://api.smartsheet.com/2.0";

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${requireEnv("SMARTSHEET_API_TOKEN")}` };
}

export interface SheetSummary {
  id: string;
  name: string;
}

export async function listSheets(): Promise<SheetSummary[]> {
  const res = await fetch(`${SMARTSHEET_BASE}/sheets`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Smartsheet list sheets failed (${res.status})`);
  const body = (await res.json()) as { data: { id: number; name: string }[] };
  return body.data.map((s) => ({ id: String(s.id), name: s.name }));
}

interface SmartsheetCell {
  columnId: number;
  value?: string | number | boolean;
  displayValue?: string;
}
interface SmartsheetRow {
  cells: SmartsheetCell[];
}
interface SmartsheetColumn {
  id: number;
  title: string;
}
interface SmartsheetSheetResponse {
  name: string;
  columns: SmartsheetColumn[];
  rows: SmartsheetRow[];
}

export interface FetchedSheet {
  label: string;
  rows: ParsedRow[];
}

/** Converts Smartsheet's column-id-keyed cell shape into the same Record<string,string>-per-row shape rowsToText expects, regardless of source. */
export async function fetchSheetRows(sheetId: string): Promise<FetchedSheet> {
  const res = await fetch(`${SMARTSHEET_BASE}/sheets/${sheetId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Smartsheet fetch sheet failed (${res.status})`);
  const body = (await res.json()) as SmartsheetSheetResponse;
  const titleByColumnId = new Map(body.columns.map((c) => [c.id, c.title]));

  const rows: ParsedRow[] = body.rows.map((row) => {
    const parsed: ParsedRow = {};
    for (const cell of row.cells) {
      const title = titleByColumnId.get(cell.columnId);
      if (!title) continue;
      const raw = cell.displayValue ?? cell.value;
      parsed[title] = raw === undefined || raw === null ? "" : String(raw);
    }
    return parsed;
  });

  return { label: body.name, rows };
}
