import { nanoid } from "nanoid";
import type { RoadmapDraft } from "./schema";

/**
 * The final, id-bearing document shape from issue #5's RoadmapDocument
 * schema (generatedAt is stamped here, not trusted from the model).
 */
export interface RoadmapDocument {
  schemaVersion: string;
  programName: string;
  generatedAt: string;
  owner: string;
  reportsTo?: string;
  nextReviewDate?: string;
  bluf: { statement: string; bullets: string[] };
  actionItems: {
    id: string;
    text: string;
    owner?: string;
    dueDate?: string;
    done?: boolean;
  }[];
  swimlanes: {
    id: string;
    order: number;
    type: "lane" | "separator";
    name: string;
    ragOverride?: "green" | "amber" | "red";
  }[];
  topLevelItems: Record<string, unknown>[];
  milestones: Record<string, unknown>[];
}

/**
 * Converts a validated draft (tempKey-linked) into the final document
 * (nanoid-linked) the rest of the app expects. Runs only after
 * `findDanglingReferences` has come back empty — every tempKey used here is
 * assumed to resolve.
 */
export function resolveDraftIds(draft: RoadmapDraft): RoadmapDocument {
  const laneIdByTempKey = new Map(
    draft.swimlanes.map((l) => [l.tempKey, nanoid()]),
  );
  const topLevelIdByTempKey = new Map(
    draft.topLevelItems.map((t) => [t.tempKey, nanoid()]),
  );
  const milestoneIdByTempKey = new Map(
    draft.milestones.map((m) => [m.tempKey, nanoid()]),
  );

  return {
    schemaVersion: draft.schemaVersion,
    programName: draft.programName,
    generatedAt: new Date().toISOString(),
    owner: draft.owner,
    reportsTo: draft.reportsTo,
    nextReviewDate: draft.nextReviewDate,
    bluf: draft.bluf,
    actionItems: draft.actionItems.map((a) => ({ id: nanoid(), ...a })),
    swimlanes: draft.swimlanes.map((l) => ({
      id: laneIdByTempKey.get(l.tempKey)!,
      order: l.order,
      type: l.type,
      name: l.name,
      ragOverride: l.ragOverride,
    })),
    topLevelItems: draft.topLevelItems.map((t) => {
      const { tempKey, ...rest } = t;
      return { id: topLevelIdByTempKey.get(tempKey)!, ...rest };
    }),
    milestones: draft.milestones.map((m) => {
      const { tempKey, laneRef, linksToTopLevelMilestoneRef, dependsOn, ...rest } = m;
      return {
        id: milestoneIdByTempKey.get(tempKey)!,
        laneId: laneIdByTempKey.get(laneRef)!,
        linksToTopLevelMilestone:
          linksToTopLevelMilestoneRef !== null
            ? (topLevelIdByTempKey.get(linksToTopLevelMilestoneRef) ?? null)
            : null,
        dependsOn: dependsOn.map((d) => ({
          id: milestoneIdByTempKey.get(d.tempKey)!,
          showConnector: d.showConnector,
        })),
        ...rest,
      };
    }),
  };
}
