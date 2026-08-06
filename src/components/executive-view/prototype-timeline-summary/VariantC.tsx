// PROTOTYPE (wayframe#37) — throwaway. Variant C: segmented phase bar —
// area-proportional segments between consecutive key dates, Gantt-lite.
import { formatDateShort } from "@/components/timeline/date-utils";
import type { ExecutiveTimelineSummary } from "./generate-summary";

const RAG_BG: Record<string, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

export function VariantC({ summary }: { summary: ExecutiveTimelineSummary }) {
  const { keyDates } = summary;
  if (keyDates.length < 2) return null;
  const times = keyDates.map((k) => new Date(k.date + "T00:00:00Z").getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = max - min || 1;

  const segments = keyDates.slice(0, -1).map((k, i) => {
    const next = keyDates[i + 1];
    const start = new Date(k.date + "T00:00:00Z").getTime();
    const end = new Date(next.date + "T00:00:00Z").getTime();
    return { key: k.id, widthPct: ((end - start) / span) * 100, rag: next.rag, label: next.fullLabel };
  });

  return (
    <div className="mb-6 rounded-xl border p-4" style={{ borderColor: "var(--wf-border, #e4e4e7)" }}>
      <div className="flex h-7 overflow-hidden rounded">
        {segments.map((s) => (
          <div
            key={s.key}
            className="flex items-center justify-center overflow-hidden text-[10px] font-medium whitespace-nowrap text-white"
            style={{ width: `${s.widthPct}%`, background: RAG_BG[s.rag] }}
            title={s.label}
          >
            {s.widthPct > 10 ? s.label : ""}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>{formatDateShort(keyDates[0].date)}</span>
        <span>{formatDateShort(keyDates[keyDates.length - 1].date)}</span>
      </div>
      <p className="mt-3 text-xs text-zinc-500">{summary.narrative}</p>
    </div>
  );
}
