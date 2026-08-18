// "Midnight" starter template (Archer delta, as-built) — resolves the
// original spec's open question (archer-rebuild-spec.md §16 item 5): with
// no AI extraction available on day one, a Phase-1 visitor needs some way
// to start besides a fully blank document. This is a small, clean starter
// — a couple of lanes, one placeholder milestone — not a second demo
// dataset (see src/data/demo-roadmap.ts for that): every label is a
// visible "replace me" placeholder rather than invented program content.
import type { RoadmapData } from "@/components/timeline/types";

export function createMidnightTemplate(today: Date): RoadmapData {
  const todayIso = today.toISOString().slice(0, 10);
  return {
    schemaVersion: "1.0",
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
  };
}
