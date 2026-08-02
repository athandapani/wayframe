"use client";

// PROTOTYPE — throwaway. wayframe#13, Variant B.
//
// Symmetric tabbed source picker. File upload and Smartsheet each get their
// own tab and keep independent state — connecting Smartsheet doesn't clear
// an already-loaded file. A single explicit "Build extraction input" step
// lets the user pick which loaded source(s) to combine, rather than one
// source silently replacing another (contrast Variant A).
import { useRef, useState } from "react";
import {
  formatTime,
  MOCK_SHEETS,
  MOCK_SMARTSHEET_ACCOUNT,
  parseCsvText,
  rowsToText,
  SAMPLE_CSV_FILENAME,
  SAMPLE_CSV_TEXT,
  type LoadedSource,
} from "./shared";

type Tab = "file" | "smartsheet";
type ConnectState = "disconnected" | "connecting" | "connected" | "pulling";

export function VariantB() {
  const [tab, setTab] = useState<Tab>("file");
  const [fileSource, setFileSource] = useState<LoadedSource | null>(null);
  const [sheetSource, setSheetSource] = useState<LoadedSource | null>(null);
  const [connectState, setConnectState] = useState<ConnectState>("disconnected");
  const [selectedSheetId, setSelectedSheetId] = useState(MOCK_SHEETS[0].id);
  const [includeFile, setIncludeFile] = useState(true);
  const [includeSheet, setIncludeSheet] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File) {
    file.text().then((text) => {
      setFileSource({ kind: "file", label: file.name, rows: parseCsvText(text), loadedAt: new Date() });
    });
  }

  function loadSampleFile() {
    setFileSource({ kind: "file", label: SAMPLE_CSV_FILENAME, rows: parseCsvText(SAMPLE_CSV_TEXT), loadedAt: new Date() });
  }

  function connectSmartsheet() {
    setConnectState("connecting");
    setTimeout(() => setConnectState("connected"), 700);
  }

  function pullSheet() {
    setConnectState("pulling");
    setTimeout(() => {
      const sheet = MOCK_SHEETS.find((s) => s.id === selectedSheetId)!;
      setSheetSource({ kind: "smartsheet", label: sheet.name, rows: sheet.rows, loadedAt: new Date() });
      setConnectState("connected");
    }, 600);
  }

  const combined = [
    includeFile && fileSource ? rowsToText(fileSource.label, fileSource.rows) : null,
    includeSheet && sheetSource ? rowsToText(sheetSource.label, sheetSource.rows) : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="mx-auto max-w-2xl p-8 pt-16">
      <h1 className="mb-1 text-lg font-semibold">Import a schedule</h1>
      <p className="mb-6 text-sm text-zinc-500">
        File upload and Smartsheet are independent sources — load one, both, or switch tabs
        without losing what&apos;s already loaded.
      </p>

      <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-sm dark:border-zinc-700">
        {(["file", "smartsheet"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "flex-1 px-4 py-2 capitalize " +
              (tab === t
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 dark:text-zinc-300")
            }
          >
            {t === "file" ? "File upload" : "Smartsheet"}
            {t === "file" && fileSource && " ✓"}
            {t === "smartsheet" && sheetSource && " ✓"}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        {tab === "file" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Browse CSV/XLSX
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
              <button
                onClick={loadSampleFile}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
              >
                Use sample file
              </button>
            </div>
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
            {connectState === "disconnected" && (
              <button
                onClick={connectSmartsheet}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Connect Smartsheet
              </button>
            )}
            {connectState === "connecting" && <p className="text-sm text-zinc-500">Connecting…</p>}
            {(connectState === "connected" || connectState === "pulling") && (
              <>
                <p className="text-xs text-zinc-500">Connected as {MOCK_SMARTSHEET_ACCOUNT}</p>
                <div className="flex gap-2">
                  <select
                    value={selectedSheetId}
                    onChange={(e) => setSelectedSheetId(e.target.value)}
                    className="flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-600"
                  >
                    {MOCK_SHEETS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={pullSheet}
                    disabled={connectState === "pulling"}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {connectState === "pulling" ? "Pulling…" : "Pull now"}
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
          </div>
        )}
      </div>

      {(fileSource || sheetSource) && (
        <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
            Build extraction input
          </h2>
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
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
            {combined || "(nothing selected)"}
          </pre>
          <button
            disabled={!combined}
            className="mt-3 w-full rounded-lg bg-zinc-900 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Extract roadmap →
          </button>
        </div>
      )}
    </div>
  );
}

function RowPreviewTable({ rows }: { rows: import("./shared").ParsedRow[] }) {
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
