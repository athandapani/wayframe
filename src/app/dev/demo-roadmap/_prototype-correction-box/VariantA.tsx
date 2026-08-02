"use client";

// PROTOTYPE — throwaway. Variant A: floating command bar. wayframe#9.
// Primary affordance: a single always-visible text input, chat-adjacent,
// minimal chrome. Proposal appears as a card floating just above the bar.
import { useState } from "react";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { useCorrectionPrototype } from "./use-correction-prototype";

export function VariantA() {
  const { roadmap, today, patchState, submit, apply, discard, undo } = useCorrectionPrototype();
  const [text, setText] = useState("");

  return (
    <div className="min-h-screen bg-zinc-50 pb-40 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px] p-8">
        <BlufCallout bluf={roadmap.bluf} />
        <RoadmapTimeline data={roadmap} today={today} width={1600} />
      </div>

      {patchState.pending && (
        <div className="fixed bottom-24 left-1/2 z-40 w-[560px] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Proposed correction</p>
          <ul className="mb-3 space-y-1 text-sm">
            {patchState.pending.ops.map((op) => (
              <li key={op.targetId}>
                <span className="font-medium">{op.targetTitle}</span>: {op.field} {op.previousValue} →{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{op.newValue}</span>
                <span className="text-zinc-400"> ({op.reason})</span>
              </li>
            ))}
            {patchState.pending.skipped.map((s) => (
              <li key={s.title} className="text-zinc-400">
                skipped: {s.title} ({s.reason})
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={apply} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              Apply
            </button>
            <button onClick={discard} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">
              Discard
            </button>
          </div>
        </div>
      )}

      {patchState.lastError && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white shadow-lg">
          {patchState.lastError}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
          setText("");
        }}
        className="fixed bottom-16 left-1/2 z-40 flex w-[560px] -translate-x-1/2 items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 shadow-xl dark:border-zinc-600 dark:bg-zinc-900"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "push certification milestones by two weeks"'
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
        />
        <button
          type="button"
          onClick={undo}
          disabled={patchState.history.length === 0}
          className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
        >
          Undo
        </button>
        <button type="submit" className="rounded-full bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          Send
        </button>
      </form>
    </div>
  );
}
