// Executive view (wayframe issue #8): RAG rollup per swimlane, top-3-risks
// callout, readable in under two minutes — the alternative to Program
// view's full milestone-level RoadmapTimeline. Risks-first layout (a
// program's headline risks lead, lane rollups follow as a scannable tile
// grid), with the program's BLUF statement and each risk's status comment
// carried through as supporting subtext.
"use client";

import type { RoadmapData } from "../timeline/types";
import { formatDateShort } from "../timeline/date-utils";
import { laneRollups, topRisks, type Rag } from "./rag";
import { ExecutiveTimeline } from "./ExecutiveTimeline";
import type { ExecutiveTimelineSummary } from "./timeline-summary";

const RAG_BG: Record<Rag, string> = {
  green: "rgba(34,197,94,0.12)",
  amber: "rgba(245,158,11,0.14)",
  red: "rgba(239,68,68,0.14)",
};
const RAG_BORDER: Record<Rag, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };
const TREND_ARROW = { up: "↑", down: "↓", flat: "→" };

export function ExecutiveView({
  data,
  today,
  timelineSummary,
}: {
  data: RoadmapData;
  today: Date;
  /** Generated on demand via RoadmapWorkspace's OptionsMenu trigger (wayframe#37) — undefined until the first "Generate" click. */
  timelineSummary?: ExecutiveTimelineSummary | null;
}) {
  const lanes = laneRollups(data, today);
  const risks = topRisks(data);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-1 text-lg font-semibold">{data.programName}</h1>
      <p className="mb-6 text-sm text-zinc-500">{data.bluf.statement}</p>

      {timelineSummary && <ExecutiveTimeline summary={timelineSummary} />}

      <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-300">Top risks</h2>
        <ul className="space-y-1.5 text-sm">
          {risks.map((r) => (
            <li key={r.milestoneId}>
              <span className="font-medium">{r.title}</span>{" "}
              <span className="text-zinc-500">
                — {r.laneName}, due {formatDateShort(r.date)}
              </span>
              {r.comment && <span className="block text-zinc-500">{r.comment}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {lanes.map((l) => (
          <div key={l.laneId} className="rounded-lg border-2 p-3" style={{ background: RAG_BG[l.rag], borderColor: RAG_BORDER[l.rag] }}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide">{l.laneName}</span>
              {l.trend && <span className="text-sm">{TREND_ARROW[l.trend]}</span>}
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              {l.delayedCount + l.atRiskCount === 0
                ? "On track"
                : `${l.delayedCount + l.atRiskCount} milestone${l.delayedCount + l.atRiskCount === 1 ? "" : "s"} at risk`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
