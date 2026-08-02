"use client";

// PROTOTYPE — throwaway. wayframe#13, Variant C.
//
// Composer-first: file/Smartsheet aren't alternate top-level modes, they're
// attachments to the same typed-notes box P0 already uses. Attaching a
// source adds a small dismissible chip; the combined text blob (typed text
// + every attached source's serialized rows) updates live with no separate
// "confirm" step — contrast Variant B's explicit combine step.
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

export function VariantC() {
  const [typedText, setTypedText] = useState("");
  const [attachments, setAttachments] = useState<LoadedSource[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [connectState, setConnectState] = useState<ConnectState>("disconnected");
  const [selectedSheetId, setSelectedSheetId] = useState(MOCK_SHEETS[0].id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addAttachment(a: LoadedSource) {
    setAttachments((prev) => [...prev.filter((x) => x.label !== a.label), a]);
  }

  function removeAttachment(label: string) {
    setAttachments((prev) => prev.filter((a) => a.label !== label));
  }

  function loadFile(file: File) {
    file.text().then((text) => {
      addAttachment({ kind: "file", label: file.name, rows: parseCsvText(text), loadedAt: new Date() });
    });
  }

  function loadSampleFile() {
    addAttachment({ kind: "file", label: SAMPLE_CSV_FILENAME, rows: parseCsvText(SAMPLE_CSV_TEXT), loadedAt: new Date() });
  }

  function connectSmartsheet() {
    setConnectState("connecting");
    setTimeout(() => setConnectState("connected"), 700);
  }

  function pullSheet() {
    setConnectState("pulling");
    setTimeout(() => {
      const sheet = MOCK_SHEETS.find((s) => s.id === selectedSheetId)!;
      addAttachment({ kind: "smartsheet", label: sheet.name, rows: sheet.rows, loadedAt: new Date() });
      setConnectState("connected");
      setShowConnect(false);
    }, 600);
  }

  function refreshAttachment(label: string) {
    const sheet = MOCK_SHEETS.find((s) => s.name === label);
    if (!sheet) return;
    addAttachment({ kind: "smartsheet", label: sheet.name, rows: sheet.rows, loadedAt: new Date() });
  }

  const combinedBlob = [typedText.trim(), ...attachments.map((a) => rowsToText(a.label, a.rows))]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="mx-auto max-w-2xl p-8 pt-16">
      <h1 className="mb-1 text-lg font-semibold">Import a schedule</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Type notes and/or attach a file or a live Smartsheet — everything merges into one
        extraction call.
      </p>

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.label}
              className="flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
            >
              {a.kind === "file" ? "📄" : "🔗"} {a.label} · {a.rows.length} rows
              {a.kind === "smartsheet" && (
                <>
                  <span className="text-zinc-400">· synced {formatTime(a.loadedAt)}</span>
                  <button onClick={() => refreshAttachment(a.label)} aria-label="Refresh" className="text-zinc-500">
                    ↻
                  </button>
                </>
              )}
              <button onClick={() => removeAttachment(a.label)} aria-label="Remove attachment" className="text-zinc-400">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        value={typedText}
        onChange={(e) => setTypedText(e.target.value)}
        placeholder="Type meeting notes here (optional if you attach a file or sheet)…"
        className="h-32 w-full resize-none rounded-xl border border-zinc-300 bg-transparent p-3 text-sm dark:border-zinc-700"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
        >
          📎 Attach file
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
        <button onClick={loadSampleFile} className="text-xs text-zinc-500 underline">
          (use sample file)
        </button>
        <button
          onClick={() => setShowConnect((v) => !v)}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
        >
          🔗 Attach Smartsheet
        </button>
      </div>

      {showConnect && (
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
                {connectState === "pulling" ? "Pulling…" : "Attach as chip"}
              </button>
              <p className="text-xs text-zinc-400">One-way pull only — no write-back to Smartsheet.</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
          Combined extraction input (live)
        </h2>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
          {combinedBlob || "(nothing typed or attached yet)"}
        </pre>
        <button
          disabled={!combinedBlob}
          className="mt-3 w-full rounded-lg bg-zinc-900 py-2 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Extract roadmap →
        </button>
      </div>
    </div>
  );
}
