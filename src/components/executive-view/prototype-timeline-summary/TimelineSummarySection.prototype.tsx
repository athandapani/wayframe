// PROTOTYPE (wayframe#37) — throwaway. Presentational only: renders the
// switcher-selected variant for a summary generated elsewhere (the trigger
// button now lives in RoadmapWorkspace's shared OptionsMenu, reachable from
// Program view too — see use-timeline-summary.ts).
"use client";

import { Suspense } from "react";
import type { ExecutiveTimelineSummary } from "./generate-summary";
import { PrototypeSwitcher, useVariant } from "./PrototypeSwitcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";

function Inner({ summary, loading }: { summary: ExecutiveTimelineSummary | null; loading: boolean }) {
  const variant = useVariant();

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Timeline</span>
      </div>
      {summary && !loading && (
        <>
          {variant === "A" && <VariantA summary={summary} />}
          {variant === "B" && <VariantB summary={summary} />}
          {variant === "C" && <VariantC summary={summary} />}
          <p className="mb-6 -mt-4 text-right text-[10px] text-zinc-400">as of {new Date(summary.generatedAt).toLocaleTimeString()}</p>
        </>
      )}
      {!summary && !loading && (
        <p className="mb-6 text-xs text-zinc-400 italic">Use "Generate" in the options menu to summarize timing across the program.</p>
      )}
      {loading && <p className="mb-6 text-xs text-zinc-400 italic">Summarizing…</p>}
      <PrototypeSwitcher />
    </>
  );
}

export function TimelineSummarySection(props: { summary: ExecutiveTimelineSummary | null; loading: boolean }) {
  return (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  );
}
