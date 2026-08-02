"use client";

// PROTOTYPE — throwaway. Variant A: stoplight rows. wayframe#8.
// Primary affordance: one row per swimlane, list-shaped, scan top-to-bottom
// like a status report. Risks called out below as a plain list.
import type { RoadmapData } from "@/components/timeline/types";
import { laneRollups, topRisks, type Rag } from "./rag";

const RAG_COLOR: Record<Rag, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };
const TREND_ARROW = { up: "↑", down: "↓", flat: "→" };

export function ExecutiveViewA({ data, today }: { data: RoadmapData; today: Date }) {
  const lanes = laneRollups(data, today);
  const risks = topRisks(data);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-lg font-semibold">{data.programName}</h1>
      <p className="mb-6 text-sm text-zinc-500">{data.bluf.statement}</p>

      <ul className="mb-8 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
        {lanes.map((l) => (
          <li key={l.laneId} className="flex items-center gap-3 px-4 py-3">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: RAG_COLOR[l.rag] }} />
            <span className="flex-1 text-sm font-medium">{l.laneName}</span>
            <span className="text-sm text-zinc-400" title={`trend: ${l.trend}`}>
              {TREND_ARROW[l.trend]}
            </span>
            {l.delayedCount + l.atRiskCount > 0 && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {l.delayedCount + l.atRiskCount} at risk
              </span>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Top risks</h2>
      <ul className="space-y-2">
        {risks.map((r) => (
          <li key={r.milestoneId} className="text-sm">
            <span className="font-medium">{r.title}</span>{" "}
            <span className="text-zinc-400">({r.laneName}, {r.date})</span>
            {r.comment && <span className="block text-zinc-500">{r.comment}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
