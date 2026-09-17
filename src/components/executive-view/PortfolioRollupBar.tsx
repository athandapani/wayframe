// Minimal RAG rollup surface for the All-Programs merged view (t27, on top
// of t26's page). Deliberately NOT a chip rendered inside RoadmapTimeline's
// own Program band (that's "a rollup chip to #104's band UI", which t27's
// own gist explicitly defers to a future ticket) — this is a standalone row
// above the timeline, reusing rag.ts's live Program/Portfolio rollup
// functions and ExecutiveView's own RAG_BORDER/RAG_BG color pair.
"use client";

import type { Program } from "@/components/timeline/types";
import { portfolioRollup, RAG_BORDER, RAG_BG, type Rag } from "./rag";

const TREND_ARROW = { up: "↑", down: "↓", flat: "→" };

function RagDot({ rag }: { rag: Rag }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RAG_BORDER[rag] }} aria-hidden="true" />;
}

export function PortfolioRollupBar({ programs, today }: { programs: Program[]; today: Date }) {
  if (programs.length === 0) return null;
  const rollup = portfolioRollup(programs, today);

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="rounded-full border-2 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" style={{ background: RAG_BG[rollup.rag], borderColor: RAG_BORDER[rollup.rag] }}>
          Portfolio
        </span>
        {rollup.trend && <span aria-label={`Trend: ${rollup.trend}`}>{TREND_ARROW[rollup.trend]}</span>}
        <span className="text-xs text-gray-500">
          {rollup.delayedCount + rollup.atRiskCount === 0
            ? "All Programs on track"
            : `${rollup.delayedCount + rollup.atRiskCount} milestone${rollup.delayedCount + rollup.atRiskCount === 1 ? "" : "s"} at risk across ${programs.length} Program${programs.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {rollup.programs.map((p) => (
          <span key={p.programId} className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs" style={{ background: RAG_BG[p.rag], borderColor: RAG_BORDER[p.rag] }}>
            <RagDot rag={p.rag} />
            <span className="max-w-[12rem] truncate font-medium">{p.programName}</span>
            {p.trend && <span aria-label={`Trend: ${p.trend}`}>{TREND_ARROW[p.trend]}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
