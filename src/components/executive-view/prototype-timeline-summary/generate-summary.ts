// PROTOTYPE (wayframe#37) — throwaway. Answers: "what should an AI-summarized
// compact timeline for Executive view look like?" Not real deliverable code.
//
// Stands in for a real Claude call following /api/correct's forced tool-use
// pattern (src/app/api/correct/route.ts). Mocked here — deterministic,
// client-side, artificial delay — because the open question is the *visual
// shape* of the result, not whether a live model call works. If Variant
// A/B/C wins, the real version is a proper /api/summarize endpoint.
import type { Milestone, RoadmapData, Status } from "@/components/timeline/types";
import type { Rag } from "@/components/executive-view/rag";
import { wrapText } from "@/components/timeline/wrap-text";

// Word-boundary truncation, not RoadmapTimeline's initials-style
// deriveShortLabel — the design-review uplift (wayframe#36) already found
// initialisms ("U3CI", "HA(") unreadable and replaced them with real-title
// labels; an executive-facing summary shouldn't reintroduce that.
function shortLabel(title: string, maxChars = 14): string {
  return wrapText(title, maxChars, 1, { breakWords: false })[0] ?? title;
}

export interface SummaryKeyDate {
  id: string;
  /** Short always-visible label — same short-label/hover-for-full-title convention as RoadmapTimeline's markers. */
  label: string;
  fullLabel: string;
  date: string;
  rag: Rag;
  /** Drives the finish date (isCriticalPath) vs. flagged at-risk/delayed but off the critical chain — rendered as solid vs. hollow markers so the two reasons a date matters aren't visually conflated. */
  onCriticalPath: boolean;
}

export interface ExecutiveTimelineSummary {
  generatedAt: string;
  narrative: string;
  keyDates: SummaryKeyDate[];
}

function ragForStatus(status: Status): Rag {
  if (status === "delayed") return "red";
  if (status === "at-risk") return "amber";
  return "green";
}

function toKeyDate(m: Milestone, onCriticalPath: boolean): SummaryKeyDate {
  return { id: m.id, label: shortLabel(m.shortLabel ?? m.title), fullLabel: m.title, date: m.date, rag: ragForStatus(m.status), onCriticalPath };
}

type DatedItem = Extract<RoadmapData["topLevelItems"][number], { status: Status }>;

function itemDate(item: DatedItem): string {
  return item.type === "phase" ? item.endDate : item.date;
}

/**
 * Mocked "AI" reduction. Key dates are the union of two things an executive
 * actually needs, not just one: the critical path (computeCriticalPathIds,
 * wayframe#34/#35 — "what's driving the finish date") PLUS any at-risk/delayed
 * milestone regardless of critical-path membership ("what's currently red").
 * Critical-path-only silently hid real delayed milestones that don't happen
 * to sit on the longest chain (e.g. the demo dataset's Third-Party Safety Lab
 * Testing, status "delayed", isCriticalPath: false) — caught reviewing the
 * first pass of this prototype. Falls back to top-level items only if a
 * document has neither. The narrative deliberately does NOT restate
 * data.bluf.statement (already shown as the page subtitle) — it adds new
 * information about what's pacing the finish date, plus a call-out for any
 * off-path risk. Real version would be a forced tool-use Claude call, same
 * pattern as /api/correct.
 */
export async function generateExecutiveSummary(data: RoadmapData, _today: Date): Promise<ExecutiveTimelineSummary> {
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));

  const criticalSorted = data.milestones.filter((m) => m.isCriticalPath).sort((a, b) => (a.date < b.date ? -1 : 1));
  const criticalIds = new Set(criticalSorted.map((m) => m.id));
  const offPathRisk = data.milestones.filter((m) => !m.isCriticalPath && (m.status === "at-risk" || m.status === "delayed"));

  const merged = [...criticalSorted, ...offPathRisk].sort((a, b) => (a.date < b.date ? -1 : 1));
  const keyDates: SummaryKeyDate[] =
    merged.length > 0
      ? merged.map((m) => toKeyDate(m, criticalIds.has(m.id)))
      : data.topLevelItems
          .filter((item): item is DatedItem => item.type !== "annotation")
          .sort((a, b) => (itemDate(a) < itemDate(b) ? -1 : 1))
          .slice(0, 6)
          .map((item) => ({
            id: item.id,
            label: shortLabel(item.title),
            fullLabel: item.title,
            date: itemDate(item),
            rag: ragForStatus(item.status),
            onCriticalPath: false,
          }));

  const finishCritical = criticalSorted[criticalSorted.length - 1];
  const blockingCritical = criticalSorted.find((m) => ragForStatus(m.status) !== "green");
  const criticalClause = !finishCritical
    ? "No critical path computed for this document yet."
    : blockingCritical && blockingCritical.id !== finishCritical.id
      ? `${blockingCritical.title} is the pacing risk on the critical path — it sets how close the program tracks to the ${finishCritical.title} finish date.`
      : blockingCritical && blockingCritical.id === finishCritical.id
        ? `${finishCritical.title} itself, the critical-path finish, is at risk.`
        : `Critical path on track through ${criticalSorted.length} milestones to the ${finishCritical.title} finish date.`;
  const offPathClause =
    offPathRisk.length > 0
      ? ` ${offPathRisk.length} more milestone${offPathRisk.length === 1 ? "" : "s"} off the critical path ${offPathRisk.length === 1 ? "is" : "are"} flagged: ${offPathRisk.map((m) => m.title).join(", ")}.`
      : "";

  return { generatedAt: new Date().toISOString(), narrative: criticalClause + offPathClause, keyDates };
}
