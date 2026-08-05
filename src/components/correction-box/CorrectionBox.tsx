"use client";

// Variant A (floating command bar) — the default, per issue #9's
// resolution: a single always-visible text input, proposal card floats
// above it. Preview-before-commit, always; never auto-applies.
import { useState } from "react";
import { buildOpPreview, buildSkippedPreview } from "@/lib/corrections/preview";
import type { UseCorrectionBoxResult } from "./use-correction-box";

export function CorrectionBox({ box }: { box: UseCorrectionBoxResult }) {
  const [text, setText] = useState("");
  const opRows = box.pending ? buildOpPreview(box.data.milestones, box.pending.ops) : [];
  const skippedRows = box.pending ? buildSkippedPreview(box.data.milestones, box.pending.skipped) : [];

  return (
    <>
      {box.pending && (
        <div style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
          className="fixed bottom-24 left-1/2 z-40 w-[560px] -translate-x-1/2 rounded-xl border p-4 shadow-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Proposed correction</p>
          <ul className="mb-3 space-y-1 text-sm">
            {opRows.map((op) => (
              <li key={op.targetId}>
                <span className="font-medium">{op.targetTitle}</span>: {op.field} {op.previousValue} →{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{op.newValue}</span>
                <span className="text-zinc-400"> ({op.reason})</span>
              </li>
            ))}
            {skippedRows.map((s) => (
              <li key={s.targetId} className="text-zinc-400">
                skipped: {s.targetTitle} ({s.reason})
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={box.apply} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              Apply
            </button>
            <button onClick={box.discard} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">
              Discard
            </button>
          </div>
        </div>
      )}

      {box.error && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white shadow-lg">
          {box.error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          box.submit(text);
          setText("");
        }}
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
        className="fixed bottom-16 left-1/2 z-40 flex w-[560px] -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 shadow-xl"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={box.loading}
          placeholder='e.g. "push certification milestones by two weeks"'
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={box.undo}
          disabled={box.historyLength === 0}
          className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
        >
          Undo
        </button>
        <button
          type="submit"
          disabled={box.loading}
          style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
          className="rounded-full px-3 py-1 text-sm disabled:opacity-50"
        >
          {box.loading ? "Thinking…" : "Send"}
        </button>
      </form>
    </>
  );
}
