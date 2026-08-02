"use client";

// PROTOTYPE — throwaway. Variant C: single-glance strip + narrative.
// wayframe#8. Primary affordance: a compact RAG strip plus an
// auto-generated prose summary (words over widgets) with risks embedded
// inline rather than as a separate list — tests whether prose reads faster
// than a list/grid for a 2-minute read.
import type { RoadmapData } from "@/components/timeline/types";
import { laneRollups, topRisks, type Rag } from "./rag";

const RAG_COLOR: Record<Rag, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

function buildNarrative(lanes: ReturnType<typeof laneRollups>, risks: ReturnType<typeof topRisks>): string {
  const onTrack = lanes.filter((l) => l.rag === "green");
  const needsAttention = lanes.filter((l) => l.rag !== "green");

  let s = `${onTrack.length} of ${lanes.length} lanes are on track.`;
  if (needsAttention.length > 0) {
    s += ` ${needsAttention.map((l) => l.laneName).join(" and ")} need${needsAttention.length === 1 ? "s" : ""} attention.`;
  }
  if (risks.length > 0) {
    s += ` Top risk: ${risks[0].title} (${risks[0].laneName}, due ${risks[0].date})`;
    if (risks.length > 1) {
      s += `, followed by ${risks
        .slice(1)
        .map((r) => r.title)
        .join(" and ")}.`;
    } else {
      s += ".";
    }
  }
  return s;
}

export function ExecutiveViewC({ data, today }: { data: RoadmapData; today: Date }) {
  const lanes = laneRollups(data, today);
  const risks = topRisks(data);
  const narrative = buildNarrative(lanes, risks);

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="mb-3 text-lg font-semibold">{data.programName}</h1>

      <div className="mb-4 flex gap-1.5">
        {lanes.map((l) => (
          <span
            key={l.laneId}
            className="h-2 flex-1 rounded-full"
            style={{ background: RAG_COLOR[l.rag] }}
            title={l.laneName}
          />
        ))}
      </div>

      <p className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200">{narrative}</p>

      <p className="mt-4 text-xs text-zinc-400">Next review: {data.nextReviewDate}</p>
    </div>
  );
}
