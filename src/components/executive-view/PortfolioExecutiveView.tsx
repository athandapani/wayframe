"use client";

// The Roadmap-level Executive reading (wayframe#145).
//
// `ExecutiveView` summarises ONE Program, so with a multi-Program Roadmap
// there was nowhere at all that answered "how is each Program doing": the
// only cross-Program summary was `PortfolioRollupBar`, and until #144 it sat
// above the *editing* canvas, which is the wrong surface for a summary. This
// is that summary's home, and it breaks the Roadmap down Program by Program
// rather than flattening every Program into one set of numbers (which hides
// exactly the thing a reader is here for) or showing only one of them (which
// is what the single-Program page already does better).
//
// No new math. t27 established the rollup rule once and applied it at every
// tier — Program-level RAG is `ragForLane`'s worst-status-wins applied one
// tier up over that Program's own lanes, Portfolio-level is the same rule
// one tier above that, both computed live with no persisted history — and
// `topRisks` already ranks a Program's own risks by severity,
// critical-path-first, then soonest. This composes those.
//
// A single-Program Roadmap renders the ordinary `ExecutiveView` for that one
// Program, unchanged: a "breakdown" of one Program is just that Program's
// summary with an extra heading on top, and the familiar view is strictly
// more informative (lane tiles, reports-to, the timeline summary).
import type { Portfolio, Program } from "@/components/timeline/types";
import { mergeForRender } from "@/components/timeline/types";
import { formatDateShort } from "../timeline/date-utils";
import { blufHtmlToPlainText } from "@/lib/rich-text/sanitize";
import { laneRollups, portfolioRollup, topRisks, RAG_BORDER, RAG_BG } from "./rag";
import { PortfolioRollupBar } from "./PortfolioRollupBar";
import { ExecutiveView } from "./ExecutiveView";

const TREND_ARROW = { up: "↑", down: "↓", flat: "→" };

export function PortfolioExecutiveView({ portfolio, programs, today }: { portfolio: Portfolio; programs: Program[]; today: Date }) {
  if (programs.length === 0) {
    return <p className="mx-auto max-w-5xl p-8 text-sm text-zinc-500">This Roadmap has no Program yet.</p>;
  }
  if (programs.length === 1) {
    return <ExecutiveView data={mergeForRender(portfolio, programs[0])} today={today} />;
  }

  const rollup = portfolioRollup(programs, today);
  const rollupById = new Map(rollup.programs.map((p) => [p.programId, p]));

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-3 text-lg font-semibold">How each Program is doing</h1>

      {/* The Roadmap's own line first — the same bar that used to sit above
          the editing canvas (#144), now where it belongs. */}
      <PortfolioRollupBar programs={programs} today={today} />

      <div className="space-y-4">
        {programs.map((program) => {
          const summary = rollupById.get(program.id);
          if (!summary) return null;
          const renderable = mergeForRender(portfolio, program);
          const risks = topRisks(renderable);
          const lanes = laneRollups(program, today);
          const bluf = blufHtmlToPlainText(program.bluf.statement);
          return (
            <section
              key={program.id}
              aria-label={`${program.programName} summary`}
              className="rounded-xl border-2 p-4"
              style={{ background: RAG_BG[summary.rag], borderColor: RAG_BORDER[summary.rag] }}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{program.programName}</h2>
                {summary.trend && <span aria-label={`Trend: ${summary.trend}`}>{TREND_ARROW[summary.trend]}</span>}
                <span className="text-xs text-zinc-600 dark:text-zinc-300">
                  {summary.delayedCount + summary.atRiskCount === 0
                    ? "On track"
                    : `${summary.delayedCount} delayed · ${summary.atRiskCount} at risk`}
                </span>
              </div>
              {/* Plain text, not rich text — same reasoning as ExecutiveView's
                  own subtext line: bluf.statement can carry inline HTML and
                  this has always been prose under a name. */}
              {bluf && <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-300">{bluf}</p>}

              {risks.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {risks.map((r) => (
                    <li key={r.milestoneId}>
                      <span className="font-medium">{r.title}</span>{" "}
                      <span className="text-zinc-600 dark:text-zinc-300">
                        — {r.laneName}, due {formatDateShort(r.date)}
                      </span>
                      {r.comment && <span className="block text-xs text-zinc-600 dark:text-zinc-300">{r.comment}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">Nothing at risk or delayed.</p>
              )}

              {/* Which lanes carry that RAG — the tier below, compact, so a
                  reader can see where a Program's amber comes from without
                  leaving the Roadmap view for that Program's own page. */}
              {lanes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {lanes.map((lane) => (
                    <span
                      key={lane.laneId}
                      className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                      style={{ background: RAG_BG[lane.rag], borderColor: RAG_BORDER[lane.rag] }}
                    >
                      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: RAG_BORDER[lane.rag] }} />
                      <span className="max-w-[10rem] truncate">{lane.laneName}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
