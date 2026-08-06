// PROTOTYPE (wayframe#37) — throwaway. Variant B: narrative-led, with a row
// of compact date chips carrying no proportional geometry — reads more like
// a sentence than a chart.
import { formatDateShort } from "@/components/timeline/date-utils";
import type { ExecutiveTimelineSummary } from "./generate-summary";

const RAG_CHIP: Record<string, string> = {
  green: "border-green-400 text-green-700 dark:text-green-300",
  amber: "border-amber-400 text-amber-700 dark:text-amber-300",
  red: "border-red-400 text-red-700 dark:text-red-300",
};

export function VariantB({ summary }: { summary: ExecutiveTimelineSummary }) {
  return (
    <div className="mb-6 rounded-xl border p-4" style={{ borderColor: "var(--wf-border, #e4e4e7)" }}>
      <p className="mb-3 text-sm">{summary.narrative}</p>
      <div className="flex flex-wrap gap-1.5">
        {summary.keyDates.map((k) => (
          <span key={k.id} className={"rounded-full border px-2.5 py-1 text-[11px] " + RAG_CHIP[k.rag]}>
            <span className="font-medium">{k.fullLabel}</span> <span className="opacity-70">· {formatDateShort(k.date)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
