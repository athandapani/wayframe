"use client";

// PROTOTYPE — throwaway. Variant B: persistent correction sidebar.
// wayframe#9. Primary affordance: a docked right-hand panel (copilot-chat
// shape) that keeps a running log of corrections, not just the latest one.
import { useState } from "react";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { useCorrectionPrototype } from "./use-correction-prototype";

interface LogEntry {
  text: string;
  status: "applied" | "discarded";
  opCount: number;
}

export function VariantB() {
  const { roadmap, today, patchState, submit, apply, discard, undo } = useCorrectionPrototype();
  const [text, setText] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
      <div className="min-w-0 flex-1 overflow-x-auto p-8">
        <BlufCallout bluf={roadmap.bluf} />
        <RoadmapTimeline data={roadmap} today={today} width={1300} />
      </div>

      <aside className="flex w-96 shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold">Corrections</h2>
          <button
            onClick={undo}
            disabled={patchState.history.length === 0}
            className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
          >
            Undo last ({patchState.history.length})
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {log.length === 0 && !patchState.pending && (
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

          {patchState.pending && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-700 dark:bg-amber-950">
              <p className="mb-1 font-medium">&quot;{patchState.pending.inputText}&quot;</p>
              <ul className="mb-2 space-y-0.5">
                {patchState.pending.ops.map((op) => (
                  <li key={op.targetId}>
                    {op.targetTitle}: {op.field} {op.previousValue} → <span className="font-semibold">{op.newValue}</span>
                  </li>
                ))}
                {patchState.pending.skipped.map((s) => (
                  <li key={s.title} className="text-zinc-400">
                    skipped: {s.title}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setLog((l) => [...l, { text: patchState.pending!.inputText, status: "applied", opCount: patchState.pending!.ops.length }]);
                    apply();
                  }}
                  className="rounded bg-emerald-600 px-2 py-1 text-white"
                >
                  Apply
                </button>
                <button
                  onClick={() => {
                    setLog((l) => [...l, { text: patchState.pending!.inputText, status: "discarded", opCount: patchState.pending!.ops.length }]);
                    discard();
                  }}
                  className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {patchState.lastError && <p className="text-xs text-red-600 dark:text-red-400">{patchState.lastError}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
            setText("");
          }}
          className="border-t border-zinc-200 p-3 dark:border-zinc-700"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe a correction..."
            className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-zinc-400 dark:border-zinc-600"
          />
        </form>
      </aside>
    </div>
  );
}
