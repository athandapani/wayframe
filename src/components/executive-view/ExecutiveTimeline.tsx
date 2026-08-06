// Executive-view compact timeline (wayframe#37) — the missing time
// dimension: Executive view answered "how are we doing" but never "by
// when." A mini point-marker strip, proportionally spaced between the
// first and last key date (see timeline-summary.ts for what's selected and
// why). Labels are short (same short-label/hover-for-full-title convention
// as RoadmapTimeline's markers) and greedily assigned to one of four tiers
// to avoid overlap when the critical path has many close-together
// milestones — a scaled-down version of the collision problem
// RoadmapTimeline's label-layout.ts already solves for the full chart.
// Solid diamonds are on the critical path (drive the finish date); hollow
// diamonds are flagged at-risk/delayed but off the critical chain — two
// different reasons a date matters, kept visually distinct rather than
// conflated (a first pass that showed critical-path dates only silently
// hid a real delayed milestone off that chain).
import { formatDateShort } from "@/components/timeline/date-utils";
import type { ExecutiveTimelineSummary } from "./timeline-summary";

const RAG_COLOR: Record<string, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };
const RAG_LABEL: Record<string, string> = { green: "On track", amber: "At risk", red: "Delayed" };

// Tiers ordered by visual preference: near-above, near-below, far-above, far-below.
const TIERS = [
  { offsetClass: "-top-9", dotClass: "-translate-y-1/2" },
  { offsetClass: "top-3", dotClass: "-translate-y-1/2" },
  { offsetClass: "-top-16", dotClass: "-translate-y-1/2" },
  { offsetClass: "top-10", dotClass: "-translate-y-1/2" },
] as const;

const MIN_GAP_PCT = 11; // ~label width in a 0-100% strip at typical container widths

function assignTiers(positions: number[]): number[] {
  const order = positions.map((pct, i) => ({ pct, i })).sort((a, b) => a.pct - b.pct);
  const lastPctByTier = new Array(TIERS.length).fill(-Infinity);
  const tierByIndex = new Array(positions.length).fill(0);
  for (const { pct, i } of order) {
    let tier = TIERS.findIndex((_, t) => pct - lastPctByTier[t] >= MIN_GAP_PCT);
    if (tier === -1) tier = 0; // all tiers still collide (very dense) — accept overlap on the preferred tier
    tierByIndex[i] = tier;
    lastPctByTier[tier] = pct;
  }
  return tierByIndex;
}

export function ExecutiveTimeline({ summary }: { summary: ExecutiveTimelineSummary }) {
  const { keyDates } = summary;
  if (keyDates.length === 0) return null;
  const times = keyDates.map((k) => new Date(k.date + "T00:00:00Z").getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = max - min || 1;
  const positions = times.map((t) => ((t - min) / span) * 100);
  const tiers = assignTiers(positions);
  const abbreviated = keyDates.filter((k) => k.label !== k.fullLabel);

  return (
    <div className="mb-6 rounded-xl border p-4" style={{ borderColor: "var(--wf-border, #e4e4e7)" }}>
      <div className="relative mt-16 mb-20 h-0.5 bg-zinc-200 dark:bg-zinc-700">
        {keyDates.map((k, i) => {
          const pct = positions[i];
          const tier = TIERS[tiers[i]];
          return (
            <div key={k.id} className="absolute top-0 -translate-x-1/2" style={{ left: `${pct}%` }}>
              <div
                className={`h-2.5 w-2.5 rotate-45 ${tier.dotClass}`}
                style={
                  k.onCriticalPath
                    ? { background: RAG_COLOR[k.rag] }
                    : { background: "white", border: `2px solid ${RAG_COLOR[k.rag]}` }
                }
                title={`${k.fullLabel} — ${formatDateShort(k.date)}${k.onCriticalPath ? " (critical path)" : " (off critical path)"}`}
              />
              <div
                className={"absolute w-20 text-center text-[10px] leading-tight text-zinc-600 dark:text-zinc-300 " + tier.offsetClass}
                style={{ left: "50%", transform: "translateX(-50%)" }}
                title={k.fullLabel}
              >
                <div className="truncate font-medium">{k.label}</div>
                <div className="text-zinc-400">{formatDateShort(k.date)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mb-3 text-xs text-zinc-500">{summary.narrative}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[10px] text-zinc-500" style={{ borderColor: "var(--wf-border, #e4e4e7)" }}>
        {(["green", "amber", "red"] as const).map((rag) => (
          <span key={rag} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rotate-45" style={{ background: RAG_COLOR[rag] }} />
            {RAG_LABEL[rag]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rotate-45" style={{ background: "white", border: `2px solid ${RAG_COLOR.amber}` }} />
          Off critical path
        </span>
      </div>

      {abbreviated.length > 0 && (
        <p className="mt-2 text-[10px] text-zinc-400">
          {abbreviated.map((k, i) => (
            <span key={k.id}>
              {i > 0 && " · "}
              <strong className="font-medium">{k.label}</strong> = {k.fullLabel}
            </span>
          ))}
        </p>
      )}

      <p className="mt-2 text-right text-[10px] text-zinc-400">as of {new Date(summary.generatedAt).toLocaleTimeString()}</p>
    </div>
  );
}
