"use client";

// Variant B (persistent correction sidebar) — kept as a user-selectable
// alternate mode per issue #9's resolution. Adds a running log of past
// corrections; the log is pure UI bookkeeping local to this component, not
// part of the core patch/undo state in use-correction-box.ts.
import { useState } from "react";
import { buildOpPreview, buildSkippedPreview } from "@/lib/corrections/preview";
import type { UseCorrectionBoxResult } from "./use-correction-box";

interface LogEntry {
  text: string;
  status: "applied" | "discarded";
  opCount: number;
}

export function CorrectionSidebar({ box }: { box: UseCorrectionBoxResult }) {
  const [text, setText] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const opRows = box.pending ? buildOpPreview(box.data.milestones, box.pending.ops) : [];
  const skippedRows = box.pending ? buildSkippedPreview(box.data.milestones, box.pending.skipped) : [];

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold">Corrections</h2>
        <button
          onClick={box.undo}
          disabled={box.historyLength === 0}
          className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
        >
          Undo last ({box.historyLength})
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {log.length === 0 && !box.pending && (
          <p className="text-xs text-zinc-400">Type a correction below — e.g. &quot;push certification milestones by two weeks&quot;.</p>
        )}

        {log.map((entry, i) => (
          <div key={i} className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">&quot;{entry.text}&quot;</p>
            <p className={entry.status === "applied" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}>
              {entry.status} — {entry.opCount} change{entry.opCount === 1 ? "" : "s"}
            </p>
          </div>
        ))}

        {box.pending && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-700 dark:bg-amber-950">
            <p className="mb-1 font-medium">&quot;{box.pending.inputText}&quot;</p>
            <ul className="mb-2 space-y-0.5">
              {opRows.map((op) => (
                <li key={op.targetId}>
                  {op.targetTitle}: {op.field} {op.previousValue} → <span className="font-semibold">{op.newValue}</span>
                </li>
              ))}
              {skippedRows.map((s) => (
                <li key={s.targetId} className="text-zinc-400">
                  skipped: {s.targetTitle}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setLog((l) => [...l, { text: box.pending!.inputText, status: "applied", opCount: box.pending!.ops.length }]);
                  box.apply();
                }}
                className="rounded bg-emerald-600 px-2 py-1 text-white"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  setLog((l) => [...l, { text: box.pending!.inputText, status: "discarded", opCount: box.pending!.ops.length }]);
                  box.discard();
                }}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {box.error && <p className="text-xs text-red-600 dark:text-red-400">{box.error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          box.submit(text);
          setText("");
        }}
        className="border-t border-zinc-200 p-3 dark:border-zinc-700"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={box.loading}
          placeholder="Describe a correction..."
          className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-zinc-400 disabled:opacity-50 dark:border-zinc-600"
        />
      </form>
    </aside>
  );
}
