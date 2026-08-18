import ExcelJS from "exceljs";
import type { ParsedRow } from "./rows-to-text";

/**
 * XLSX parsing — parses the first worksheet (or one
 * chosen by name) into the same `ParsedRow[]` shape `parse-csv.ts` already
 * produces, so every downstream piece (rows-to-text, the column mapper,
 * rows-to-roadmap) is shared between CSV and XLSX rather than duplicated.
 *
 * Dependency note: the original codebase deliberately chose PapaParse over
 * SheetJS for CSV specifically over a dependency-risk concern (see
 * rows-to-text.ts's doc comment) — there's no CSV-only reason to need a
 * spreadsheet library at all. XLSX has no such alternative; a real parser
 * is unavoidable here. `xlsx` (SheetJS) was evaluated first per the
 * original plan but dropped after `npm audit` showed unpatched, direct
 * high-severity advisories (prototype pollution, ReDoS — GHSA-4r6h-8v6p-xvw6,
 * GHSA-5pgg-2g8v-p4x9) with no upstream fix on the npm-published package.
 * `exceljs` was chosen instead — its only flagged advisory is a moderate,
 * transitive one (via `uuid`), a materially smaller risk for a parser that
 * runs directly against untrusted user-uploaded files.
 */
export async function parseXlsxFile(file: File, sheetName?: string): Promise<ParsedRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  // exceljs pads index 0 (columns are 1-indexed) — drop it.
  const headers = (headerRow.values as unknown[]).slice(1).map((h) => (h === null || h === undefined ? "" : String(h)));
  if (headers.every((h) => h === "")) return [];

  const rows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    if (values.every((v) => v === null || v === undefined || v === "")) return; // skip fully-blank rows
    const parsed: ParsedRow = {};
    headers.forEach((header, i) => {
      if (!header) return;
      const cell = values[i];
      parsed[header] = cell === null || cell === undefined ? "" : cellToString(cell);
    });
    rows.push(parsed);
  });

  return rows;
}

/** exceljs cell values can be primitives, Dates, formula-result objects, or rich-text runs — flatten to a plain display string. */
function cellToString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value !== null) {
    if ("text" in value && typeof (value as { text: unknown }).text === "string") return (value as { text: string }).text;
    if ("result" in value) return cellToString((value as { result: unknown }).result);
    if ("richText" in value && Array.isArray((value as { richText: unknown }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    }
  }
  return String(value);
}

/** Sheet names for a picker, when a workbook has more than one worksheet worth choosing between. */
export async function listXlsxSheetNames(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.map((s) => s.name);
}
