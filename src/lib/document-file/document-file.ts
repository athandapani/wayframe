// Save / open a roadmap as a .wayframe.json file (prototype/theme-system).
//
// Until now the only persistence was a single localStorage slot, which
// means the work is trapped in one browser profile: no backup, no handoff
// to a colleague, no second roadmap. This is the escape hatch — the whole
// document, round-trippable.
//
// Loading validates before it replaces anything. The reducer's loadDocument
// is destructive-ish (it swaps the whole document, undoably), so handing it
// a malformed file would put the app in a state where the chart throws on
// render and the only recovery is clearing storage. Failing closed with a
// readable reason is the same posture /api/extract already takes.
import { z } from "zod";
import type { RoadmapData } from "@/components/timeline/types";
import { sanitizeBlufHtml } from "@/lib/rich-text/sanitize";

const StatusSchema = z.enum(["not-started", "on-track", "at-risk", "delayed", "complete"]);
const RagSchema = z.enum(["green", "amber", "red"]);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

const SwimlaneSchema = z.object({
  id: z.string().min(1),
  order: z.number(),
  type: z.enum(["lane", "separator"]),
  name: z.string(),
  ragOverride: RagSchema.optional(),
  color: z.string().optional(),
  rollupHistory: z
    .array(z.object({ date: IsoDate, rag: RagSchema, atRiskCount: z.number(), delayedCount: z.number() }))
    .optional(),
  density: z.enum(["normal", "lean"]).optional(),
});

const MilestoneSchema = z.object({
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
  dependsOn: z.array(z.object({ id: z.string(), showConnector: z.boolean() })),
  linksToTopLevelMilestone: z.string().nullable(),
  isCriticalPath: z.boolean(),
  isCriticalPathOverride: z.boolean().optional(),
  shortLabel: z.string().optional(),
  showReferenceLine: z.boolean().optional(),
  attachments: z.array(z.object({ type: z.enum(["image", "link"]), url: z.string(), label: z.string().optional() })).optional(),
});

const TopLevelItemSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("phase"), title: z.string(), startDate: IsoDate, endDate: IsoDate, status: StatusSchema }),
  z.object({ id: z.string(), type: z.literal("milestone"), title: z.string(), date: IsoDate, status: StatusSchema, showReferenceLine: z.boolean().optional() }),
  z.object({ id: z.string(), type: z.literal("annotation"), title: z.string(), date: IsoDate }),
]);

const RoadmapDataSchema = z.object({
  schemaVersion: z.string(),
  programName: z.string(),
  generatedAt: z.string(),
  lastUpdatedAt: z.string().optional(),
  owner: z.string().optional(),
  reportsTo: z.string().optional(),
  nextReviewDate: z.string().optional(),
  bluf: z.object({
    statement: z.string(),
    bullets: z.array(z.string()),
    label: z.string().optional(),
    size: z.object({ width: z.number(), height: z.number().nullable() }).optional(),
  }),
  actionItems: z.array(z.unknown()).optional(),
  swimlanes: z.array(SwimlaneSchema),
  topLevelItems: z.array(TopLevelItemSchema),
  milestones: z.array(MilestoneSchema),
  // Was missing entirely until wayframe#64 — z.object() silently strips
  // unrecognized keys rather than erroring, so a saved file's companyLogo
  // was dropped on every Open, without a schema-validation error to catch it.
  companyLogo: z.object({ dataUrl: z.string(), dx: z.number().optional(), dy: z.number().optional(), scale: z.number().optional() }).optional(),
});

export type LoadResult = { ok: true; document: RoadmapData } | { ok: false; message: string; issues: string[] };

/** Referential integrity — a shape-valid file can still point at lanes that don't exist. */
function referentialProblems(doc: RoadmapData): string[] {
  const problems: string[] = [];
  const laneIds = new Set(doc.swimlanes.map((l) => l.id));
  const milestoneIds = new Set(doc.milestones.map((m) => m.id));
  const topIds = new Set(doc.topLevelItems.map((t) => t.id));
  for (const m of doc.milestones) {
    if (!laneIds.has(m.laneId)) problems.push(`"${m.title}" is in lane "${m.laneId}", which doesn't exist`);
    for (const d of m.dependsOn) {
      if (!milestoneIds.has(d.id)) problems.push(`"${m.title}" depends on "${d.id}", which doesn't exist`);
    }
    if (m.linksToTopLevelMilestone && !topIds.has(m.linksToTopLevelMilestone)) {
      problems.push(`"${m.title}" links to top-level item "${m.linksToTopLevelMilestone}", which doesn't exist`);
    }
  }
  return problems;
}

export function parseDocumentFile(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file isn't valid JSON.", issues: [] };
  }
  const parsed = RoadmapDataSchema.safeParse(raw);
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
  // An opened file is fully untrusted input, and bluf.statement/bullets are
  // rendered via dangerouslySetInnerHTML (wayframe#38 item 4 / #39) —
  // sanitizing at the same boundary the zod shape/referential checks
  // already gate on, not just at render time, so a malicious file can't
  // even round-trip its markup through a Save unsanitized.
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

export function documentFileName(programName: string): string {
  const slug = programName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "roadmap"}.wayframe.json`;
}

/** Triggers a download of the document as pretty-printed JSON. */
export function saveDocumentFile(data: RoadmapData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = documentFileName(data.programName);
  a.click();
  // Revoking immediately can cancel the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
