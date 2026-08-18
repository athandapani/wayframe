"use client";

// Real structured-data import (wayframe#16) — promotes Variant B from
// wayframe#13's prototype (prototype/structured-import): symmetric tabs,
// file upload and Smartsheet keep independent state (loading one doesn't
// clear the other), an explicit "Build extraction input" step lets the
// user pick which loaded source(s) combine before extracting. Real CSV
// parsing (PapaParse — see rows-to-text.ts's doc for why not SheetJS/xlsx)
// and a real Smartsheet pull replace the prototype's naive splitter and
// canned mock data; rowsToText()'s shape is unchanged from the prototype,
// so /api/extract needed no schema change.
import { useRef, useState } from "react";
import type { Milestone, RoadmapData } from "@/components/timeline/types";
import type { PatchOp } from "@/lib/corrections/schema";
import { parseCsvFile } from "@/lib/import/parse-csv";
import { rowsToText, type ParsedRow } from "@/lib/import/rows-to-text";
import { SpreadsheetImportTab } from "./SpreadsheetImportTab";

interface LoadedSource {
  label: string;
  rows: ParsedRow[];
  loadedAt: Date;
}

interface SheetSummary {
  id: string;
  name: string;
}

type Tab = "file" | "smartsheet" | "spreadsheet";
type SmartsheetState = "disconnected" | "connecting" | "connected" | "pulling";

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
  data: RoadmapData;
  onExtracted: (data: RoadmapData) => void;
  /** Deterministic CSV/XLSX import merge (Archer delta v1.2) — see SpreadsheetImportTab.tsx. */
  onMerge: (newLanes: { id: string; name: string }[], adds: Milestone[], updateOps: PatchOp[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("file");
  const [fileSource, setFileSource] = useState<LoadedSource | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sheetSource, setSheetSource] = useState<LoadedSource | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [smartsheetState, setSmartsheetState] = useState<SmartsheetState>("disconnected");
  const [smartsheetError, setSmartsheetError] = useState<string | null>(null);
  const [includeFile, setIncludeFile] = useState(true);
  const [includeSheet, setIncludeSheet] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function connectSmartsheet() {
    setSmartsheetState("connecting");
    setSmartsheetError(null);
    try {
      const res = await fetch("/api/smartsheet/sheets");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to connect to Smartsheet.");
      setSheets(body.sheets);
      setSelectedSheetId(body.sheets[0]?.id ?? null);
      setSmartsheetState("connected");
    } catch (err) {
      setSmartsheetError(err instanceof Error ? err.message : "Failed to connect to Smartsheet.");
      setSmartsheetState("disconnected");
    }
  }

  async function pullSheet() {
    if (!selectedSheetId) return;
    setSmartsheetState("pulling");
    setSmartsheetError(null);
    try {
      const res = await fetch(`/api/smartsheet/sheets/${selectedSheetId}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to pull sheet.");
      if (body.rows.length === 0) throw new Error("That sheet has no rows.");
      setSheetSource({ label: body.label, rows: body.rows, loadedAt: new Date() });
    } catch (err) {
      setSmartsheetError(err instanceof Error ? err.message : "Failed to pull sheet.");
    } finally {
      setSmartsheetState("connected");
    }
  }

  const combined = [
    includeFile && fileSource ? rowsToText(fileSource.label, fileSource.rows) : null,
    includeSheet && sheetSource ? rowsToText(sheetSource.label, sheetSource.rows) : null,
  ]
    .filter(Boolean)
    .join("\n\n");

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
      onExtracted(body.document as RoadmapData);
      onClose();
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
              File upload and Smartsheet are independent sources — load one, both, or switch tabs without losing what&apos;s already loaded.
            </p>
          </div>
          <button onClick={onClose} className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-sm dark:border-zinc-700">
          {(["file", "smartsheet", "spreadsheet"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={"flex-1 px-4 py-2 capitalize " + (tab === t ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-300")}
            >
              {t === "file" ? "AI extraction" : t === "smartsheet" ? "Smartsheet" : "Spreadsheet (no AI)"}
              {t === "file" && fileSource && " ✓"}
              {t === "smartsheet" && sheetSource && " ✓"}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          {tab === "spreadsheet" && <SpreadsheetImportTab data={data} onMerge={onMerge} />}
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
            </div>
          )}

          {tab === "smartsheet" && (
            <div className="space-y-3">
              {smartsheetState === "disconnected" && (
                <button onClick={connectSmartsheet} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                  Connect Smartsheet
                </button>
              )}
              {smartsheetState === "connecting" && <p className="text-sm text-zinc-500">Connecting…</p>}
              {(smartsheetState === "connected" || smartsheetState === "pulling") && (
                <>
                  <div className="flex gap-2">
                    <select
                      value={selectedSheetId ?? ""}
                      onChange={(e) => setSelectedSheetId(e.target.value)}
                      className="flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-600"
                    >
                      {sheets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={pullSheet}
                      disabled={smartsheetState === "pulling" || !selectedSheetId}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {smartsheetState === "pulling" ? "Pulling…" : "Pull now"}
                    </button>
                  </div>
                  {sheetSource && (
                    <div>
                      <p className="mb-1 text-xs text-zinc-500">
                        Last pulled {formatTime(sheetSource.loadedAt)} — {sheetSource.rows.length} rows
                      </p>
                      <RowPreviewTable rows={sheetSource.rows} />
                    </div>
                  )}
                  <p className="text-xs text-zinc-400">One-way pull only — no write-back, no auto-sync.</p>
                </>
              )}
              {smartsheetError && <p className="text-xs text-red-600 dark:text-red-400">{smartsheetError}</p>}
            </div>
          )}
        </div>

        {(fileSource || sheetSource) && (
          <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <h2 className="mb-2 text-xs font-bold tracking-wide text-zinc-500 uppercase">Build extraction input</h2>
            <div className="mb-3 space-y-1 text-sm">
              {fileSource && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includeFile} onChange={(e) => setIncludeFile(e.target.checked)} />
                  Include {fileSource.label} ({fileSource.rows.length} rows)
                </label>
              )}
              {sheetSource && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includeSheet} onChange={(e) => setIncludeSheet(e.target.checked)} />
                  Include {sheetSource.label} ({sheetSource.rows.length} rows)
                </label>
              )}
            </div>
            <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs whitespace-pre-wrap dark:bg-zinc-950">{combined || "(nothing selected)"}</pre>
            {extractError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{extractError}</p>}
            <button
              onClick={extract}
              disabled={!combined || extracting}
              className="mt-3 w-full rounded-lg bg-zinc-900 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {extracting ? "Extracting…" : "Extract roadmap →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
