"use client";

// PROTOTYPE — throwaway. wayframe#13, Variant A.
//
// Drop-zone-primary, single active source. Loading a file or connecting
// Smartsheet REPLACES whatever was loaded before — there's no combining.
// The drop zone is the dominant affordance; Smartsheet connect is a
// secondary, initially-collapsed panel underneath it.
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

type ConnectState = "disconnected" | "connecting" | "connected" | "pulling";

export function VariantA() {
  const [source, setSource] = useState<LoadedSource | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSmartsheet, setShowSmartsheet] = useState(false);
  const [connectState, setConnectState] = useState<ConnectState>("disconnected");
  const [selectedSheetId, setSelectedSheetId] = useState(MOCK_SHEETS[0].id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File) {
    file.text().then((text) => {
      setSource({ kind: "file", label: file.name, rows: parseCsvText(text), loadedAt: new Date() });
    });
  }

  function loadSampleFile() {
    setSource({ kind: "file", label: SAMPLE_CSV_FILENAME, rows: parseCsvText(SAMPLE_CSV_TEXT), loadedAt: new Date() });
  }

  function connectSmartsheet() {
    setConnectState("connecting");
    setTimeout(() => setConnectState("connected"), 700);
  }

  function pullSheet() {
    setConnectState("pulling");
    setTimeout(() => {
      const sheet = MOCK_SHEETS.find((s) => s.id === selectedSheetId)!;
      setSource({ kind: "smartsheet", label: sheet.name, rows: sheet.rows, loadedAt: new Date() });
      setConnectState("connected");
    }, 600);
  }

  const preview = source ? rowsToText(source.label, source.rows) : "";

  return (
    <div className="mx-auto max-w-2xl p-8 pt-16">
      <h1 className="mb-1 text-lg font-semibold">Import a schedule</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Upload a spreadsheet, or connect Smartsheet for a one-way live pull. Loading a new source
        replaces the current one.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) loadFile(file);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={
          "cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors " +
          (dragOver
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600")
        }
      >
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
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Drop a CSV/XLSX file here, or click to browse
        </p>
        <p className="mt-1 text-xs text-zinc-500">XLSX parsing stubbed in this prototype — CSV parses for real</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            loadSampleFile();
          }}
          className="mt-3 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Use sample file
        </button>
      </div>

      <button
        onClick={() => setShowSmartsheet((v) => !v)}
        className="mt-3 text-sm text-emerald-700 underline dark:text-emerald-400"
      >
        {showSmartsheet ? "Hide" : "or connect a live Smartsheet"}
      </button>

      {showSmartsheet && (
        <div className="mt-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
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
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">Connected as {MOCK_SMARTSHEET_ACCOUNT}</p>
              <select
                value={selectedSheetId}
                onChange={(e) => setSelectedSheetId(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-600"
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
                {connectState === "pulling" ? "Pulling…" : "Pull sheet"}
              </button>
              <p className="text-xs text-zinc-400">One-way pull only — no write-back to Smartsheet.</p>
            </div>
          )}
        </div>
      )}

      {source && (
        <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>
              {source.kind === "file" ? "📄" : "🔗"} {source.label} — {source.rows.length} row(s)
            </span>
            <span>loaded {formatTime(source.loadedAt)}</span>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
            {preview}
          </pre>
          <button className="mt-3 w-full rounded-lg bg-zinc-900 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
            Extract roadmap →
          </button>
        </div>
      )}
    </div>
  );
}
