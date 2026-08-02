"use client";

// PROTOTYPE — throwaway. Variant B: risks-first tile grid. wayframe#8.
// Primary affordance: top risks lead (headline card), swimlanes follow as
// a card grid — different information hierarchy from A's lane-first list.
import type { RoadmapData } from "@/components/timeline/types";
import { laneRollups, topRisks, type Rag } from "./rag";

const RAG_BG: Record<Rag, string> = {
  green: "rgba(34,197,94,0.12)",
  amber: "rgba(245,158,11,0.14)",
  red: "rgba(239,68,68,0.14)",
};
const RAG_BORDER: Record<Rag, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };
const TREND_ARROW = { up: "↑", down: "↓", flat: "→" };

export function ExecutiveViewB({ data, today }: { data: RoadmapData; today: Date }) {
  const lanes = laneRollups(data, today);
  const risks = topRisks(data);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-lg font-semibold">{data.programName}</h1>
      <p className="mb-6 text-sm text-zinc-500">{data.bluf.statement}</p>

      <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-300">Top risks</h2>
        <ul className="space-y-1.5 text-sm">
          {risks.map((r) => (
            <li key={r.milestoneId}>
              <span className="font-medium">{r.title}</span>{" "}
              <span className="text-zinc-500">— {r.laneName}, due {r.date}</span>
              {r.comment && <span className="block text-zinc-500">{r.comment}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {lanes.map((l) => (
          <div
            key={l.laneId}
            className="rounded-lg border-2 p-3"
            style={{ background: RAG_BG[l.rag], borderColor: RAG_BORDER[l.rag] }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide">{l.laneName}</span>
              <span className="text-sm">{TREND_ARROW[l.trend]}</span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              {l.delayedCount + l.atRiskCount === 0 ? "On track" : `${l.delayedCount + l.atRiskCount} milestone(s) at risk`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
