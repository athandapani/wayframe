"use client";

// Real structured-data import (wayframe#16) — promotes Variant B from
// wayframe#13's prototype (prototype/structured-import). Real CSV
// parsing (PapaParse — see rows-to-text.ts's doc for why not SheetJS/xlsx)
// replaces the prototype's naive splitter and canned mock data;
// rowsToText()'s shape is unchanged from the prototype, so /api/extract
// needed no schema change. Smartsheet used to be a third tab here, feeding
// the same free-text extraction path as file upload — wayframe#t39 moved
// it into SpreadsheetImportTab as a second deterministic row source
// instead (fetchSheetRows already returns the ParsedRow[] shape
// rowsToRoadmap consumes, so routing it through an LLM call was standing
// in for exact deterministic matching that already existed), leaving this
// panel with just the two genuinely different import strategies: AI
// extraction from free text, or deterministic column-mapped rows.
import { useRef, useState } from "react";
import type { Milestone, Program } from "@/components/timeline/types";
import type { PatchOp } from "@/lib/corrections/schema";
import { parseCsvFile } from "@/lib/import/parse-csv";
import { rowsToText, type ParsedRow } from "@/lib/import/rows-to-text";
import { useOwnedPortfolioId } from "@/lib/auth/use-owned-portfolio-id";
import { SpreadsheetImportTab } from "./SpreadsheetImportTab";

interface LoadedSource {
  label: string;
  rows: ParsedRow[];
  loadedAt: Date;
}

type Tab = "file" | "spreadsheet";

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function RowPreviewTable({ rows }: { rows: ParsedRow[] }) {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]);
  return (
    <div className="overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
      <table className="w-full text-left text-xs">
        <thead className="bg-zinc-100 dark:bg-zinc-800">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-2 py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 3).map((r, i) => (
            <tr key={i} className="border-t border-zinc-200 dark:border-zinc-700">
              {headers.map((h) => (
                <td key={h} className="px-2 py-1">
                  {r[h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImportPanel({
  data,
  onExtracted,
  onMerge,
  onClose,
}: {
  /** Live document — needed by the deterministic Spreadsheet tab's smart-merge matching. */
  data: Program;
  onExtracted: (data: Program) => void;
  /** Deterministic CSV/XLSX import merge — see SpreadsheetImportTab.tsx. */
  onMerge: (newLanes: { id: string; name: string }[], adds: Milestone[], updateOps: PatchOp[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("file");
  const [fileSource, setFileSource] = useState<LoadedSource | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [includeFile, setIncludeFile] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetPortfolioId = useOwnedPortfolioId();
  const [createAsNewProgram, setCreateAsNewProgram] = useState(false);
  const [createdConfirmation, setCreatedConfirmation] = useState(false);

  async function loadFile(file: File) {
    setFileError(null);
    try {
      const rows = await parseCsvFile(file);
      if (rows.length === 0) throw new Error("No rows found — check the file has a header row plus at least one data row.");
      setFileSource({ label: file.name, rows, loadedAt: new Date() });
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to parse file.");
    }
  }

  const combined = includeFile && fileSource ? rowsToText(fileSource.label, fileSource.rows) : "";

  async function extract() {
    if (!combined) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Extraction failed.");

      if (createAsNewProgram && targetPortfolioId) {
        const createRes = await fetch(`/api/portfolios/${targetPortfolioId}/programs/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: body.document }),
        });
        const createBody = await createRes.json().catch(() => null);
        if (!createRes.ok) throw new Error(createBody?.error ?? "Couldn't create the new Program.");
        setCreatedConfirmation(true);
      } else {
        onExtracted(body.document as Program);
        onClose();
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">Import a schedule</h1>
            <p className="mt-1 text-sm text-zinc-500">
              AI extraction reads free-form text (a pasted CSV or photo). Spreadsheet import matches CSV/XLSX/Smartsheet rows against your document
              deterministically, column by column — no model call.
            </p>
          </div>
          <button onClick={onClose} className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-sm dark:border-zinc-700">
          {(["file", "spreadsheet"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={"flex-1 px-4 py-2 capitalize " + (tab === t ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-300")}
            >
              {t === "file" ? "AI extraction" : "Spreadsheet (no AI)"}
              {t === "file" && fileSource && " ✓"}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          {tab === "spreadsheet" && <SpreadsheetImportTab data={data} onMerge={onMerge} onClose={onClose} />}
          {tab === "file" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                  Browse CSV
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) loadFile(file);
                  }}
                />
              </div>
              {fileError && <p className="text-xs text-red-600 dark:text-red-400">{fileError}</p>}
              {fileSource && (
                <div>
                  <p className="mb-1 text-xs text-zinc-500">
                    {fileSource.label} — {fileSource.rows.length} rows, loaded {formatTime(fileSource.loadedAt)}
                  </p>
                  <RowPreviewTable rows={fileSource.rows} />
                </div>
              )}
              {targetPortfolioId && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={createAsNewProgram} onChange={(e) => setCreateAsNewProgram(e.target.checked)} />
                  Add as a new Program in my Portfolio (instead of replacing this one)
                </label>
              )}
            </div>
          )}
        </div>

        {fileSource && tab === "file" && (
          <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <h2 className="mb-2 text-xs font-bold tracking-wide text-zinc-500 uppercase">Build extraction input</h2>
            <div className="mb-3 space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeFile} onChange={(e) => setIncludeFile(e.target.checked)} />
                Include {fileSource.label} ({fileSource.rows.length} rows)
              </label>
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs whitespace-pre-wrap dark:bg-zinc-950">{combined || "(nothing selected)"}</pre>
            {extractError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{extractError}</p>}
            {createdConfirmation ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ Added as a new Program in your Portfolio.</p>
                <button onClick={onClose} className="w-full rounded-lg bg-zinc-900 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                  Done
                </button>
              </div>
            ) : (
              <button
                onClick={extract}
                disabled={!combined || extracting}
                className="mt-3 w-full rounded-lg bg-zinc-900 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {extracting ? "Extracting…" : createAsNewProgram ? "Extract & create Program →" : "Extract roadmap →"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
