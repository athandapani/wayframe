import { z } from "zod";

/**
 * The draft shape Claude emits, before client-side id stamping (see issue #5:
 * ids are nanoids assigned by the client after the response comes back).
 *
 * Since real ids don't exist yet, cross-references within the draft (a
 * milestone's lane, a milestone's dependency, a milestone's link to a
 * top-level item) use model-invented `tempKey` strings instead. The client
 * resolves these to real ids in `resolveDraftIds` below.
 */

export const StatusSchema = z.enum([
  "not-started",
  "on-track",
  "at-risk",
  "delayed",
  "complete",
]);

export const RagSchema = z.enum(["green", "amber", "red"]);

export const SwimlaneDraftSchema = z.object({
  tempKey: z.string().min(1),
  order: z.number(),
  type: z.enum(["lane", "separator"]),
  name: z.string().min(1),
  // Manual override for the Executive-view RAG rollup — see
  // src/components/timeline/types.ts's Swimlane.ragOverride doc.
  ragOverride: RagSchema.optional(),
});

export const TopLevelItemDraftSchema = z.discriminatedUnion("type", [
  z.object({
    tempKey: z.string().min(1),
    type: z.literal("milestone"),
    title: z.string().min(1),
    date: z.string().min(1),
    status: StatusSchema,
    showReferenceLine: z.boolean().optional(),
  }),
  z.object({
    tempKey: z.string().min(1),
    type: z.literal("phase"),
    title: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    status: StatusSchema,
  }),
  z.object({
    tempKey: z.string().min(1),
    type: z.literal("annotation"),
    title: z.string().min(1),
    date: z.string().min(1),
    message: z.string().min(1),
  }),
]);

export const DependencyEdgeDraftSchema = z.object({
  tempKey: z.string().min(1), // predecessor milestone's tempKey
  showConnector: z.boolean(),
});

export const AttachmentDraftSchema = z.object({
  type: z.enum(["image", "link"]),
  url: z.string().min(1),
  label: z.string().optional(),
});

export const MilestoneDraftSchema = z.object({
  tempKey: z.string().min(1),
  laneRef: z.string().min(1), // -> SwimlaneDraft.tempKey
  title: z.string().min(1),
  date: z.string().min(1),
  status: StatusSchema,
  percentComplete: z.number().min(0).max(100).optional(),
  owner: z.string().optional(),
  comment: z.string().optional(),
  dependsOn: z.array(DependencyEdgeDraftSchema).default([]),
  linksToTopLevelMilestoneRef: z.string().nullable().default(null), // -> TopLevelItemDraft.tempKey
  isCriticalPath: z.boolean().default(false),
  attachments: z.array(AttachmentDraftSchema).optional(),
  // Hand-picked marker abbreviation — see Milestone.shortLabel's doc in
  // src/components/timeline/types.ts.
  shortLabel: z.string().optional(),
  // Baseline snapshot for ghost-rendering a slip — see Milestone.originalDate's
  // doc in src/components/timeline/types.ts. Normally set by the correction
  // endpoint (src/lib/corrections/), not by extraction; optional here only
  // so a document that already states an original-vs-slipped date can carry
  // it through untouched.
  originalDate: z.string().optional(),
  // Lane-scoped duration pill when set (and later than `date`) instead of a
  // point-in-time marker — see Milestone.endDate's doc in
  // src/components/timeline/types.ts.
  endDate: z.string().optional(),
  showReferenceLine: z.boolean().optional(),
});

export const ActionItemDraftSchema = z.object({
  text: z.string().min(1),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  done: z.boolean().optional(),
});

export const RoadmapDraftSchema = z.object({
  schemaVersion: z.literal("1.0"),
  programName: z.string().min(1),
  owner: z.string().min(1),
  reportsTo: z.string().optional(),
  nextReviewDate: z.string().optional(),
  bluf: z.object({
    statement: z.string().min(1),
    bullets: z.array(z.string()).max(4),
  }),
  actionItems: z.array(ActionItemDraftSchema).default([]),
  swimlanes: z.array(SwimlaneDraftSchema).min(1),
  topLevelItems: z.array(TopLevelItemDraftSchema).default([]),
  milestones: z.array(MilestoneDraftSchema).default([]),
});

export type RoadmapDraft = z.infer<typeof RoadmapDraftSchema>;
export type MilestoneDraft = z.infer<typeof MilestoneDraftSchema>;

/**
 * Referential integrity isn't expressible in the zod shape above (zod
 * validates each object's shape, not cross-object references). Checked
 * separately so a dangling reference produces the same actionable,
 * field-pinpointed error as a zod failure — not a downstream crash when the
 * client tries to resolve ids.
 */
export function findDanglingReferences(draft: RoadmapDraft): string[] {
  const laneKeys = new Set(draft.swimlanes.map((l) => l.tempKey));
  const topLevelKeys = new Set(draft.topLevelItems.map((t) => t.tempKey));
  const milestoneKeys = new Set(draft.milestones.map((m) => m.tempKey));

  const problems: string[] = [];

  for (const m of draft.milestones) {
    if (!laneKeys.has(m.laneRef)) {
      problems.push(
        `milestone "${m.title}" (tempKey=${m.tempKey}) references unknown laneRef "${m.laneRef}"`,
      );
    }
    if (
      m.linksToTopLevelMilestoneRef !== null &&
      !topLevelKeys.has(m.linksToTopLevelMilestoneRef)
    ) {
      problems.push(
        `milestone "${m.title}" (tempKey=${m.tempKey}) references unknown linksToTopLevelMilestoneRef "${m.linksToTopLevelMilestoneRef}"`,
      );
    }
    for (const dep of m.dependsOn) {
      if (!milestoneKeys.has(dep.tempKey)) {
        problems.push(
          `milestone "${m.title}" (tempKey=${m.tempKey}) depends on unknown tempKey "${dep.tempKey}"`,
        );
      }
    }
  }

  return problems;
}
