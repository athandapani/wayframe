// "Midnight" starter template — resolves the
// original spec's open question (rebuild-spec.md §16 item 5): with
// no AI extraction available on day one, a Phase-1 visitor needs some way
// to start besides a fully blank document. This is a small, clean starter
// — a couple of lanes, one placeholder milestone — not a second demo
// dataset (see src/data/demo-roadmap.ts for that): every label is a
// visible "replace me" placeholder rather than invented program content.
import { nanoid } from "nanoid";
import type { PortfolioDocument } from "@/components/timeline/types";
import { CURRENT_SCHEMA_VERSION } from "@/lib/document-file/schema";

/** A brand-new Portfolio of one Program (wayframe t11) — this is the "start from nothing" entry point, so it mints both ids itself rather than taking them as params. */
export function createMidnightTemplate(today: Date): PortfolioDocument {
  const todayIso = today.toISOString().slice(0, 10);
  const portfolioId = nanoid();
  return {
    portfolio: { id: portfolioId, schemaVersion: CURRENT_SCHEMA_VERSION },
    programs: [
      {
        id: nanoid(),
        portfolioId,
        order: 0,
        programName: "New Program",
        generatedAt: today.toISOString(),
        owner: "",
        bluf: {
          statement: "What's the one-sentence status this week?",
          bullets: [],
        },
        actionItems: [],
        swimlanes: [
          { id: "midnight-sep-1", order: 0, type: "separator", name: "Phase 1" },
          { id: "midnight-lane-1", order: 1, type: "lane", name: "Workstream 1" },
          { id: "midnight-lane-2", order: 2, type: "lane", name: "Workstream 2" },
        ],
        topLevelItems: [],
        milestones: [
          {
            id: "midnight-m1",
            laneId: "midnight-lane-1",
            title: "First milestone",
            date: todayIso,
            status: "not-started",
            dependsOn: [],
            linksToTopLevelMilestone: null,
            isCriticalPath: false,
          },
        ],
      },
    ],
  };
}
