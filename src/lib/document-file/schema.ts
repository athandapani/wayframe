// The Zod-side validation of PortfolioDocument (wayfinder t1, split into
// Portfolio+Program in t11). TypeScript (src/components/timeline/types.ts)
// stays the source of truth for the shape; the compile-time assertions at
// the bottom of this file fail `tsc` the moment a schema and its type
// disagree, which is what lets this file's `.strict()` object schemas exist
// as a second, independently maintained description of the same shape
// without silently drifting from it the way the pre-t1 schema did
// (owner/actionItems/annotation.message).
import { z } from "zod";
import { nanoid } from "nanoid";
import type { ActionItem, Portfolio, PortfolioDocument, Program } from "@/components/timeline/types";
import type { PortfolioTheme } from "@/components/timeline/theme";
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

/** Mirrors theme.ts's `LaneRamp` — edited/merged as one atomic field, never exploded into per-key L/C/startHue overrides (see PortfolioTheme's doc). */
const LaneRampSchema = z.object({ L: z.number(), C: z.number(), startHue: z.number() }).strict();

/**
 * Every `Theme` field except `id` (wayframe#88/t18) — `id` is `baseId`'s job,
 * not something an override can shadow. `.partial()` since `overrides` is
 * always sparse: a Portfolio only ever stores the fields someone actually
 * hand-edited off the base preset.
 */
const ThemeOverridesSchema = z
  .object({
    name: z.string(),
    tagline: z.string(),
    mode: z.enum(["light", "dark"]),
    font: z.string(),
    ground: z.string(),
    ink: z.string(),
    inkMuted: z.string(),
    rowDivider: z.string(),
    axisBg: z.string(),
    axisText: z.string(),
    separatorBg: z.string(),
    separatorText: z.string(),
    laneWashOpacity: z.number(),
    laneGutter: z.number(),
    laneRamp: LaneRampSchema,
    statusColor: z.object({ "not-started": z.string(), complete: z.string(), "on-track": z.string(), "at-risk": z.string(), delayed: z.string() }).strict(),
    criticalPathColor: z.string(),
    traceColor: z.string(),
    connector: z.string(),
    markerHalo: z.string(),
    todayColor: z.string(),
    annotationColor: z.string(),
    tooltipBg: z.string(),
    tooltipInk: z.string(),
    ragColor: z.object({ green: z.string(), amber: z.string(), red: z.string() }).strict(),
    pageBg: z.string(),
    panelBg: z.string(),
    panelBorder: z.string(),
    panelInk: z.string(),
    accent: z.string(),
  })
  .strict()
  .partial();

/** Base preset id + sparse override map (wayframe#88/t18) — see PortfolioTheme's doc in theme.ts for why this beats a whole-Theme blob field under concurrent edits. */
const PortfolioThemeSchema = z
  .object({
    baseId: z.enum(["blueprint", "graphite", "press"]),
    overrides: ThemeOverridesSchema.optional(),
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
 * Monotonic integer, bumped whenever the persisted document's shape changes
 * in a way that needs a migration step below (wayfinder t1; bumped again in
 * t11 for the Portfolio/Program split) — replaces the old decorative
 * `schemaVersion: "1.0"` string, which had zero comparison sites and no
 * migration code anywhere.
 */
export const CURRENT_SCHEMA_VERSION = 2;

const ProgramSchema = z
  .object({
    id: z.string().min(1),
    portfolioId: z.string().min(1),
    order: z.number(),
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
  })
  .strict();

const PortfolioSchema = z
  .object({
    id: z.string().min(1),
    // Not z.literal(CURRENT_SCHEMA_VERSION): Portfolio.schemaVersion is
    // typed `number`, not the literal `2`, so the compile-time Equals<>
    // assertion below needs this to infer as `number` too. The
    // exact-current-version requirement is enforced at runtime instead —
    // by the time a document reaches this parse, migrateToLatest has
    // already brought it up to CURRENT_SCHEMA_VERSION or given up.
    schemaVersion: z.number().int().positive().refine((v): boolean => v === CURRENT_SCHEMA_VERSION, {
      message: `expected schemaVersion ${CURRENT_SCHEMA_VERSION} (after migration)`,
    }),
    // Was missing entirely until wayframe#64 — z.object() silently strips
    // unrecognized keys rather than erroring, so a saved file's companyLogo
    // was dropped on every Open, without a schema-validation error to catch it.
    companyLogo: z.object({ dataUrl: z.string(), dx: z.number().optional(), dy: z.number().optional(), scale: z.number().optional() }).strict().optional(),
    legendCategories: z.array(LegendCategorySchema).optional(),
    theme: PortfolioThemeSchema.optional(),
  })
  .strict();

const PortfolioDocumentSchema = z
  .object({
    portfolio: PortfolioSchema,
    // Today's app only ever has one Program in view (wayframe t11 is
    // types+schema+minimal persistence only — multi-Program UI is t12/t26's
    // job), but the persisted shape already holds the real array so nothing
    // about the file format needs to change again once that UI lands.
    programs: z.array(ProgramSchema).min(1),
  })
  .strict();

/**
 * Compile-time-only checks (no runtime cost, these types are never
 * referenced) that each schema's inferred shape is exactly its TS
 * counterpart — neither side can gain, drop, or change the optionality of a
 * field without `tsc` failing here. This is the mechanism note in t1's gist
 * ("TS stays SSoT with a compile-time Zod<->TS assertion").
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type AssertTrue<_T extends true> = never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ProgramSchemaMatchesProgram = AssertTrue<Equals<z.infer<typeof ProgramSchema>, Program>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _PortfolioSchemaMatchesPortfolio = AssertTrue<Equals<z.infer<typeof PortfolioSchema>, Portfolio>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _PortfolioDocumentSchemaMatchesPortfolioDocument = AssertTrue<Equals<z.infer<typeof PortfolioDocumentSchema>, PortfolioDocument>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ActionItemSchemaMatchesActionItem = AssertTrue<Equals<z.infer<typeof ActionItemSchema>, ActionItem>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _PortfolioThemeSchemaMatchesPortfolioTheme = AssertTrue<Equals<z.infer<typeof PortfolioThemeSchema>, PortfolioTheme>>;

export type LoadResult = { ok: true; document: PortfolioDocument } | { ok: false; message: string; issues: string[] };

type Migration = { from: number; migrate: (doc: Record<string, unknown>) => Record<string, unknown> };

/**
 * Registered in ascending `from` order; each step's output must be a valid
 * input to the next (or to detectVersion, to find the next step). A raw
 * document's version is:
 *  - the integer at `portfolio.schemaVersion`, if `portfolio` is present
 *    (already enveloped — wayframe t11's shape);
 *  - else the integer at the top-level `schemaVersion` (wayframe t1's flat
 *    shape, pre-Portfolio-split);
 *  - else 0 — a legacy `"1.0"` string, a missing field, or anything else
 *    not recognized as either of the above. 0 always means "run every
 *    migration from the start."
 */
const migrations: Migration[] = [
  // t1: normalize a legacy/missing schemaVersion to the integer 1 — still
  // the flat, pre-Portfolio shape at this point.
  {
    from: 0,
    migrate: (doc) => ({ ...doc, schemaVersion: 1 }),
  },
  // t11: envelope the flat, single-Program document into
  // {portfolio, programs: [program]} — schemaVersion/companyLogo/
  // legendCategories move onto a freshly-identified Portfolio; the rest of
  // the fields become that Portfolio's one Program, freshly identified too.
  {
    from: 1,
    migrate: (doc) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { schemaVersion: _schemaVersion, companyLogo, legendCategories, ...programFields } = doc;
      const portfolioId = nanoid();
      const portfolio: Record<string, unknown> = { id: portfolioId, schemaVersion: 2 };
      if (companyLogo !== undefined) portfolio.companyLogo = companyLogo;
      if (legendCategories !== undefined) portfolio.legendCategories = legendCategories;
      return {
        portfolio,
        programs: [{ ...programFields, id: nanoid(), portfolioId, order: 0 }],
      };
    },
  },
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function detectVersion(raw: Record<string, unknown>): number {
  if (isPlainObject(raw.portfolio)) {
    const v = raw.portfolio.schemaVersion;
    if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
    return 0; // enveloped shape but a schemaVersion migrateToLatest doesn't recognize — no path forward, let safeParse reject it
  }
  const v = raw.schemaVersion;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

/**
 * Migrate-then-validate-once: runs every applicable step so
 * PortfolioDocumentSchema itself only ever has to validate the current
 * shape, not every shape a document has ever had. Not a shape guarantee by
 * itself — `raw` may still fail PortfolioDocumentSchema.safeParse after
 * this, e.g. if there's no migration step for its detected version yet.
 */
function migrateToLatest(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw;
  let doc = raw;
  let version = detectVersion(doc);
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations.find((m) => m.from === version);
    if (!step) break; // no path forward — PortfolioDocumentSchema.safeParse below will reject it with a readable issue
    doc = step.migrate(doc);
    version = detectVersion(doc);
  }
  return doc;
}

/** Referential integrity — a shape-valid document can still point at lanes/categories that don't exist, or a Program that disagrees with its own Portfolio. */
function referentialProblems(doc: PortfolioDocument): string[] {
  const problems: string[] = [];
  const categoryIds = new Set((doc.portfolio.legendCategories ?? []).map((c) => c.id));

  const programIds = new Set<string>();
  for (const program of doc.programs) {
    if (programIds.has(program.id)) problems.push(`Program "${program.programName}" reuses id "${program.id}", which another Program in this Portfolio already has`);
    programIds.add(program.id);
    if (program.portfolioId !== doc.portfolio.id) {
      problems.push(`Program "${program.programName}" has portfolioId "${program.portfolioId}", which doesn't match this Portfolio's id "${doc.portfolio.id}"`);
    }

    const laneIds = new Set(program.swimlanes.map((l) => l.id));
    const milestoneIds = new Set(program.milestones.map((m) => m.id));
    const topIds = new Set(program.topLevelItems.map((t) => t.id));
    for (const m of program.milestones) {
      if (!laneIds.has(m.laneId)) problems.push(`"${m.title}" is in lane "${m.laneId}", which doesn't exist`);
      if (m.categoryId && !categoryIds.has(m.categoryId)) problems.push(`"${m.title}" references category "${m.categoryId}", which doesn't exist`);
      for (const d of m.dependsOn) {
        if (!milestoneIds.has(d.id)) problems.push(`"${m.title}" depends on "${d.id}", which doesn't exist`);
      }
      if (m.linksToTopLevelMilestone && !topIds.has(m.linksToTopLevelMilestone)) {
        problems.push(`"${m.title}" links to top-level item "${m.linksToTopLevelMilestone}", which doesn't exist`);
      }
    }
  }
  return problems;
}

/**
 * The one validation pipeline every entry point for a persisted document
 * goes through — file-open (document-file.ts) and localStorage rehydration
 * (use-correction-box.ts) alike (wayfinder t1: "localStorage now validates
 * through the same pipeline as file-open"). Neither call site should parse
 * or cast a PortfolioDocument on its own.
 */
export function validatePortfolioDocument(raw: unknown): LoadResult {
  const migrated = migrateToLatest(raw);
  const parsed = PortfolioDocumentSchema.safeParse(migrated);
  if (!parsed.success) {
    return {
      ok: false,
      message: "That file isn't a Wayframe roadmap.",
      issues: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`),
    };
  }
  const doc = parsed.data as PortfolioDocument;
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
  const sanitized: PortfolioDocument = {
    ...doc,
    programs: doc.programs.map((program) => ({
      ...program,
      bluf: {
        ...program.bluf,
        statement: sanitizeBlufHtml(program.bluf.statement),
        bullets: program.bluf.bullets.map(sanitizeBlufHtml),
        label: program.bluf.label !== undefined ? sanitizeBlufHtml(program.bluf.label) : undefined,
      },
    })),
  };
  return { ok: true, document: sanitized };
}
