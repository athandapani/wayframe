"use client";

// PROTOTYPE — throwaway. Variant C: select-then-describe, on-canvas.
// wayframe#9. Primary affordance: no separate correction box at all — click
// milestones directly on the timeline to select them, then a small
// contextual panel asks only "what should happen to these". Tests a
// different answer to reference resolution: user-driven selection instead
// of text matching (see prototype-patch-logic.ts's parseCorrectionForSelection).
import { useState } from "react";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { useCorrectionPrototype } from "./use-correction-prototype";

export function VariantC() {
  const { roadmap, today, patchState, apply, discard, undo, submitForSelection } = useCorrectionPrototype();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitDirective() {
    submitForSelection(text, [...selected]);
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-8 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px] p-8">
        <BlufCallout bluf={roadmap.bluf} />
        <p className="mb-2 text-xs text-zinc-500">
          Click milestones to select them ({selected.size} selected), then describe the change.
        </p>
        <RoadmapTimeline
          data={roadmap}
          today={today}
          width={1600}
          onMilestoneClick={toggle}
          selectedMilestoneIds={selected}
        />
      </div>

      <div className="fixed bottom-16 left-1/2 z-40 w-[560px] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-600 dark:bg-zinc-900">
        {patchState.pending && (
          <ul className="mb-2 space-y-1 text-sm">
            {patchState.pending.ops.map((op) => (
              <li key={op.targetId}>
                {op.targetTitle}: {op.field} {op.previousValue} → <span className="font-semibold text-emerald-600 dark:text-emerald-400">{op.newValue}</span>
              </li>
            ))}
            {patchState.pending.skipped.map((s) => (
              <li key={s.title} className="text-zinc-400">
                skipped: {s.title} ({s.reason})
              </li>
            ))}
          </ul>
        )}
        {patchState.lastError && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{patchState.lastError}</p>}
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={selected.size > 0 ? `Describe the change for ${selected.size} milestone(s)...` : "Select milestones on the timeline first"}
            disabled={selected.size === 0}
            className="flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-zinc-400 disabled:opacity-40 dark:border-zinc-600"
          />
          <button
            onClick={submitDirective}
            disabled={selected.size === 0 || !text.trim()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Preview
          </button>
        </div>
        {patchState.pending && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                apply();
                setSelected(new Set());
                setText("");
              }}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Apply
            </button>
            <button onClick={discard} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">
              Discard
            </button>
          </div>
        )}
        <button
          onClick={undo}
          disabled={patchState.history.length === 0}
          className="mt-2 text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
        >
          Undo ({patchState.history.length})
        </button>
      </div>
    </div>
  );
}
