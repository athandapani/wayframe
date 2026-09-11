// The Zod-side validation of RoadmapData (wayfinder t1). TypeScript
// (src/components/timeline/types.ts) stays the source of truth for the
// shape; the compile-time assertion at the bottom of this file fails `tsc`
// the moment this schema and that type disagree, which is what lets this
// file's `.strict()` object schemas exist as a second, independently
// maintained description of the same shape without silently drifting from
// it the way the pre-t1 schema did (owner/actionItems/annotation.message).
import { z } from "zod";
import type { ActionItem, RoadmapData } from "@/components/timeline/types";
import { sanitizeBlufHtml } from "@/lib/rich-text/sanitize";

const StatusSchema = z.enum(["not-started", "on-track", "at-risk", "delayed", "complete"]);
const RagSchema = z.enum(["green", "amber", "red"]);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

const SwimlaneSchema = z
  .object({
    id: z.string().min(1),
    order: z.number(),
    type: z.enum(["lane", "separator"]),
    name: z.string(),
    ragOverride: RagSchema.optional(),
    color: z.string().optional(),
    rollupHistory: z
      .array(z.object({ date: IsoDate, rag: RagSchema, atRiskCount: z.number(), delayedCount: z.number() }).strict())
      .optional(),
    density: z.enum(["normal", "lean"]).optional(),
    owner: z.string().optional(),
  })
  .strict();

const LegendCategorySchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    color: z.string(),
  })
  .strict();

const MilestoneSchema = z
  .object({
    id: z.string().min(1),
    laneId: z.string().min(1),
    title: z.string(),
    date: IsoDate,
    endDate: IsoDate.optional(),
    originalDate: IsoDate.optional(),
    status: StatusSchema,
    percentComplete: z.number().optional(),
    owner: z.string().optional(),
    comment: z.string().optional(),
    dependsOn: z.array(z.object({ id: z.string(), showConnector: z.boolean() }).strict()),
    linksToTopLevelMilestone: z.string().nullable(),
    isCriticalPath: z.boolean(),
    isCriticalPathOverride: z.boolean().optional(),
    shortLabel: z.string().optional(),
    showReferenceLine: z.boolean().optional(),
    attachments: z
      .array(z.object({ type: z.enum(["image", "link"]), url: z.string(), label: z.string().optional() }).strict())
      .optional(),
    potentialDate: IsoDate.optional(),
    categoryId: z.string().nullable().optional(),
  })
  .strict();

const TopLevelItemSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("phase"), title: z.string(), startDate: IsoDate, endDate: IsoDate, status: StatusSchema, potentialDate: IsoDate.optional() }).strict(),
  z.object({ id: z.string(), type: z.literal("milestone"), title: z.string(), date: IsoDate, status: StatusSchema, showReferenceLine: z.boolean().optional(), potentialDate: IsoDate.optional() }).strict(),
  z.object({ id: z.string(), type: z.literal("annotation"), title: z.string(), date: IsoDate, message: z.string() }).strict(),
]);

const ActionItemSchema = z
  .object({
    id: z.string().min(1),
    text: z.string(),
    owner: z.string().optional(),
    dueDate: z.string().optional(),
    done: z.boolean().optional(),
  })
  .strict();

/**
 * Monotonic integer, bumped whenever RoadmapDataSchema's shape changes in a
 * way that needs a migration step below (wayfinder t1) — replaces the old
 * decorative `schemaVersion: "1.0"` string, which had zero comparison sites
 * and no migration code anywhere.
 */
export const CURRENT_SCHEMA_VERSION = 1;

const RoadmapDataSchema = z
  .object({
    // Not z.literal(CURRENT_SCHEMA_VERSION): RoadmapData.schemaVersion is
    // typed `number`, not the literal `1`, so the compile-time
    // Equals<> assertion below needs this to infer as `number` too. The
    // exact-current-version requirement is enforced at runtime instead —
    // by the time a document reaches this parse, migrateToLatest has
    // already brought it up to CURRENT_SCHEMA_VERSION or given up.
    schemaVersion: z.number().int().positive().refine((v): boolean => v === CURRENT_SCHEMA_VERSION, {
      message: `expected schemaVersion ${CURRENT_SCHEMA_VERSION} (after migration)`,
    }),
    programName: z.string(),
    generatedAt: z.string(),
    lastUpdatedAt: z.string().optional(),
    owner: z.string(),
    reportsTo: z.string().optional(),
    nextReviewDate: z.string().optional(),
    bluf: z
      .object({
        statement: z.string(),
        bullets: z.array(z.string()),
        label: z.string().optional(),
        size: z.object({ width: z.number(), height: z.number().nullable() }).strict().optional(),
      })
      .strict(),
    actionItems: z.array(ActionItemSchema),
    swimlanes: z.array(SwimlaneSchema),
    topLevelItems: z.array(TopLevelItemSchema),
    milestones: z.array(MilestoneSchema),
    // Was missing entirely until wayframe#64 — z.object() silently strips
    // unrecognized keys rather than erroring, so a saved file's companyLogo
    // was dropped on every Open, without a schema-validation error to catch it.
    companyLogo: z.object({ dataUrl: z.string(), dx: z.number().optional(), dy: z.number().optional(), scale: z.number().optional() }).strict().optional(),
    legendCategories: z.array(LegendCategorySchema).optional(),
  })
  .strict();

/**
 * Compile-time-only check (no runtime cost, the type is never referenced)
 * that this schema's inferred shape is exactly RoadmapData — neither side
 * can gain, drop, or change the optionality of a field without `tsc`
 * failing here. This is the mechanism note in t1's gist ("TS stays SSoT
 * with a compile-time Zod<->TS assertion").
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type AssertTrue<_T extends true> = never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _RoadmapDataSchemaMatchesRoadmapData = AssertTrue<Equals<z.infer<typeof RoadmapDataSchema>, RoadmapData>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ActionItemSchemaMatchesActionItem = AssertTrue<Equals<z.infer<typeof ActionItemSchema>, ActionItem>>;

export type LoadResult = { ok: true; document: RoadmapData } | { ok: false; message: string; issues: string[] };

type Migration = { from: number; migrate: (doc: Record<string, unknown>) => Record<string, unknown> };

/**
 * Registered in ascending `from` order; each step's output must be a valid
 * input to the next. A raw document's version is "whatever integer
 * `schemaVersion` holds," or 0 if it's anything else at all (a legacy
 * `"1.0"` string, a missing field, an out-of-range number) — 0 always means
 * "pre-versioning, run every migration from the start."
 */
const migrations: Migration[] = [
  {
    from: 0,
    migrate: (doc) => ({ ...doc, schemaVersion: 1 }),
  },
];

function detectVersion(raw: Record<string, unknown>): number {
  const v = raw.schemaVersion;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

/**
 * Migrate-then-validate-once: runs every applicable step so
 * RoadmapDataSchema itself only ever has to validate the current shape, not
 * every shape a document has ever had. Not a shape guarantee by itself —
 * `raw` may still fail RoadmapDataSchema.safeParse after this, e.g. if
 * there's no migration step for its detected version yet.
 */
function migrateToLatest(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  let doc = raw as Record<string, unknown>;
  let version = detectVersion(doc);
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations.find((m) => m.from === version);
    if (!step) break; // no path forward — RoadmapDataSchema.safeParse below will reject it with a readable issue
    doc = step.migrate(doc);
    version = detectVersion(doc);
  }
  return doc;
}

/** Referential integrity — a shape-valid document can still point at lanes that don't exist. */
function referentialProblems(doc: RoadmapData): string[] {
  const problems: string[] = [];
  const laneIds = new Set(doc.swimlanes.map((l) => l.id));
  const milestoneIds = new Set(doc.milestones.map((m) => m.id));
  const topIds = new Set(doc.topLevelItems.map((t) => t.id));
  const categoryIds = new Set((doc.legendCategories ?? []).map((c) => c.id));
  for (const m of doc.milestones) {
    if (!laneIds.has(m.laneId)) problems.push(`"${m.title}" is in lane "${m.laneId}", which doesn't exist`);
    if (m.categoryId && !categoryIds.has(m.categoryId)) problems.push(`"${m.title}" references category "${m.categoryId}", which doesn't exist`);
    for (const d of m.dependsOn) {
      if (!milestoneIds.has(d.id)) problems.push(`"${m.title}" depends on "${d.id}", which doesn't exist`);
    }
    if (m.linksToTopLevelMilestone && !topIds.has(m.linksToTopLevelMilestone)) {
      problems.push(`"${m.title}" links to top-level item "${m.linksToTopLevelMilestone}", which doesn't exist`);
    }
  }
  return problems;
}

/**
 * The one validation pipeline every entry point for a RoadmapData document
 * goes through — file-open (document-file.ts) and localStorage rehydration
 * (use-correction-box.ts) alike (wayfinder t1: "localStorage now validates
 * through the same pipeline as file-open"). Neither call site should parse
 * or cast RoadmapData on its own.
 */
export function validateRoadmapDocument(raw: unknown): LoadResult {
  const migrated = migrateToLatest(raw);
  const parsed = RoadmapDataSchema.safeParse(migrated);
  if (!parsed.success) {
    return {
      ok: false,
      message: "That file isn't a Wayframe roadmap.",
      issues: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`),
    };
  }
  const doc = parsed.data as RoadmapData;
  const problems = referentialProblems(doc);
  if (problems.length > 0) {
    return { ok: false, message: "That roadmap has broken references.", issues: problems.slice(0, 6) };
  }
  // Untrusted input (an opened file, or localStorage someone could have
  // hand-edited) and bluf.statement/bullets are rendered via
  // dangerouslySetInnerHTML (wayframe#38 item 4 / #39) — sanitizing at the
  // same boundary the zod shape/referential checks already gate on, not
  // just at render time, so malicious markup can't round-trip through a
  // Save unsanitized.
  const sanitized: RoadmapData = {
    ...doc,
    bluf: {
      ...doc.bluf,
      statement: sanitizeBlufHtml(doc.bluf.statement),
      bullets: doc.bluf.bullets.map(sanitizeBlufHtml),
      label: doc.bluf.label !== undefined ? sanitizeBlufHtml(doc.bluf.label) : undefined,
    },
  };
  return { ok: true, document: sanitized };
}
