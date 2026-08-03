import Papa from "papaparse";
import type { ParsedRow } from "./rows-to-text";

/**
 * Real CSV parsing (wayframe#16) — replaces the prototype's naive
 * comma-split, which broke on quoted fields containing commas/newlines.
 * PapaParse handles RFC 4180 quoting/escaping; `header: true` uses the
 * first row as column names, matching rowsToText's expectation of a
 * Record<string,string> per row.
 */
export function parseCsvText(text: string): ParsedRow[] {
  const result = Papa.parse<ParsedRow>(text, { header: true, skipEmptyLines: true });
  return result.data;
}

export function parseCsvFile(file: File): Promise<ParsedRow[]> {
  return file.text().then(parseCsvText);
}
