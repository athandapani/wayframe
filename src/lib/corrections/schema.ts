import { z } from "zod";
import { RagSchema, StatusSchema } from "@/lib/extraction/schema";

/**
 * The patch shape settled in issue #9: targeted ops against the *existing*
 * document's real ids (no tempKey scheme needed — unlike #6's initial
 * extraction, ids already exist before a correction call). `field` is a
 * discriminated union so `newValue` is validated against the right type
 * per field, the same way schema.ts keeps date/status apart.
 *
 * Originally just date/status — the two directive shapes validated by #9's
 * hand-driven prototype for free-text AI corrections. Widened in #18/#19 to
 * the full manual-editor v1 field set (#17) so `useCorrectionBox` can serve
 * both editing paths through one op shape and one undo stack — the AI path
 * only ever emits date/status ops; the extra variants exist for the direct
 * editor, which builds ops client-side (see build-milestone-ops.ts), not
 * something the model is prompted for (`/api/correct`'s tool-schema.ts is
 * unchanged and still only offers date/status).
 *
 * `previousValue` is deliberately not part of any op: the client derives it
 * by looking up the live document, so a stale or hallucinated echo can't
 * desync from truth.
 */
export const PatchOpSchema = z.discriminatedUnion("field", [
  z.object({
    targetId: z.string().min(1),
    field: z.literal("date"),
    newValue: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("status"),
    newValue: StatusSchema,
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("title"),
    newValue: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("percentComplete"),
    newValue: z.number().min(0).max(100),
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("owner"),
    newValue: z.string(), // "" clears the field
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("comment"),
    newValue: z.string(), // "" clears the field
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("isCriticalPathOverride"),
    newValue: z.boolean(),
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("shortLabel"),
    newValue: z.string(), // "" clears the field (falls back to the auto-derived label)
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("showReferenceLine"),
    newValue: z.boolean(),
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("endDate"),
    newValue: z.string(), // "" clears the field, converting a phase back into a point milestone (wayframe#45)
    reason: z.string().min(1),
  }),
  z.object({
    targetId: z.string().min(1),
    field: z.literal("potentialDate"),
    newValue: z.string(), // "" clears the field (wayframe#61/#72)
    reason: z.string().min(1),
  }),
]);

/** PROGRAM-band item fields a correction (AI or manual) can target — mirrors PatchOpSchema's discriminated-by-field shape, scoped to TopLevelItem's fields (wayframe#59). Not every field applies to every kind (e.g. "date" is milestone/annotation-only, "startDate"/"endDate" phase-only) — same "apply whichever fields are relevant" merge as the existing editTopLevelItem reducer action, not enforced by this schema. */
export const TOP_LEVEL_ITEM_FIELDS = ["title", "status", "date", "startDate", "endDate", "showReferenceLine", "message", "potentialDate"] as const;
const TopLevelItemFieldEnum = z.enum(TOP_LEVEL_ITEM_FIELDS);

export const TopLevelItemOpSchema = z.discriminatedUnion("field", [
  z.object({ targetId: z.string().min(1), field: z.literal("title"), newValue: z.string().min(1), reason: z.string().min(1) }),
  z.object({ targetId: z.string().min(1), field: z.literal("status"), newValue: StatusSchema, reason: z.string().min(1) }),
  z.object({ targetId: z.string().min(1), field: z.literal("date"), newValue: z.string().min(1), reason: z.string().min(1) }),
  z.object({ targetId: z.string().min(1), field: z.literal("startDate"), newValue: z.string().min(1), reason: z.string().min(1) }),
  z.object({ targetId: z.string().min(1), field: z.literal("endDate"), newValue: z.string().min(1), reason: z.string().min(1) }),
  z.object({ targetId: z.string().min(1), field: z.literal("showReferenceLine"), newValue: z.boolean(), reason: z.string().min(1) }),
  z.object({ targetId: z.string().min(1), field: z.literal("message"), newValue: z.string(), reason: z.string().min(1) }), // "" clears the message
  z.object({ targetId: z.string().min(1), field: z.literal("potentialDate"), newValue: z.string(), reason: z.string().min(1) }), // "" clears it (wayframe#61/#72); milestone/phase only, not annotation
]);
export type TopLevelItemOp = z.infer<typeof TopLevelItemOpSchema>;

/** Uniform-string tool-call shape, coerced below — same split as RawPatchOpSchema/coercePatchOp. */
export const RawTopLevelItemOpSchema = z.object({
  targetId: z.string().min(1),
  field: TopLevelItemFieldEnum,
  newValue: z.string(),
  reason: z.string().min(1),
});
export type RawTopLevelItemOp = z.infer<typeof RawTopLevelItemOpSchema>;

export function coerceTopLevelItemOp(raw: RawTopLevelItemOp): { ok: true; op: TopLevelItemOp } | { ok: false; issue: string } {
  if (raw.field === "showReferenceLine") {
    const v = raw.newValue.trim().toLowerCase();
    if (v !== "true" && v !== "false") {
      return { ok: false, issue: `topLevelItemOp for "${raw.targetId}": showReferenceLine newValue "${raw.newValue}" isn't true/false` };
    }
    return { ok: true, op: { targetId: raw.targetId, field: "showReferenceLine", newValue: v === "true", reason: raw.reason } };
  }
  const parsed = TopLevelItemOpSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issue: `topLevelItemOp for "${raw.targetId}": ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  return { ok: true, op: parsed.data };
}

/**
 * New PROGRAM-band item (wayframe#59) — mirrors AddMilestoneOpSchema but
 * discriminated by `kind` since TopLevelItem (unlike Milestone) is itself a
 * discriminated union of three shapes. `date` is nullable like
 * AddMilestoneOpSchema's (the client falls back to today and opens the
 * editor, same "create empty, open for editing" behavior); `endDate` lets a
 * phase come in as a real span instead of always landing zero-length.
 */
export const AddTopLevelItemOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("milestone"), title: z.string().min(1), date: z.string().nullable(), reason: z.string().min(1) }),
  z.object({ kind: z.literal("phase"), title: z.string().min(1), date: z.string().nullable(), endDate: z.string().nullable(), reason: z.string().min(1) }),
  z.object({ kind: z.literal("annotation"), title: z.string().min(1), date: z.string().nullable(), message: z.string().min(1), reason: z.string().min(1) }),
]);
export type AddTopLevelItemOp = z.infer<typeof AddTopLevelItemOpSchema>;

/** Flat tool-call shape (every kind's fields optional except kind/title/reason), coerced below — same split as RawSwimlaneOpSchema/coerceSwimlaneOp. */
export const RawAddTopLevelItemOpSchema = z.object({
  kind: z.enum(["milestone", "phase", "annotation"]),
  title: z.string().min(1),
  date: z.string().nullable(),
  endDate: z.string().nullable().optional(),
  message: z.string().optional(),
  reason: z.string().min(1),
});
export type RawAddTopLevelItemOp = z.infer<typeof RawAddTopLevelItemOpSchema>;

export function coerceAddTopLevelItemOp(raw: RawAddTopLevelItemOp): { ok: true; op: AddTopLevelItemOp } | { ok: false; issue: string } {
  switch (raw.kind) {
    case "milestone":
      return { ok: true, op: { kind: "milestone", title: raw.title, date: raw.date, reason: raw.reason } };
    case "phase":
      return { ok: true, op: { kind: "phase", title: raw.title, date: raw.date, endDate: raw.endDate ?? null, reason: raw.reason } };
    case "annotation": {
      if (!raw.message) return { ok: false, issue: `addTopLevelItems entry "${raw.title}": kind "annotation" needs a message` };
      return { ok: true, op: { kind: "annotation", title: raw.title, date: raw.date, message: raw.message, reason: raw.reason } };
    }
  }
}

/**
 * Dependency-edge management (wayframe#59) — mirrors the existing
 * toggleDependency reducer action one-for-one, widened to also set
 * `showConnector` (which edges draw as a visible connector line vs. just
 * feeding the cascade/critical-path graph silently). `dependentId` is the
 * milestone that depends on `dependencyId`, same direction as
 * DependencyEdge — a "successor" request just swaps which id goes where,
 * exactly like the manual EdgeEditor does.
 */
export const DependencyOpSchema = z.object({
  dependentId: z.string().min(1),
  dependencyId: z.string().min(1),
  add: z.boolean(),
  showConnector: z.boolean().optional(),
  reason: z.string().min(1),
});
export type DependencyOp = z.infer<typeof DependencyOpSchema>;

/**
 * Bulk relative-date shift across many milestones/PROGRAM-band items at
 * once (wayframe#57) — the model names a selector and one deltaDays, never
 * enumerates per-item absolute dates itself (fragile arithmetic with no
 * consistency guarantee, degrading as the item count grows against the
 * response token budget). Resolved deterministically client-side
 * (src/lib/corrections/bulk-shift.ts), mirroring how cascade.ts is already
 * a deterministic client-side walk rather than model-computed arithmetic —
 * the resolver compiles a bulkShiftOp down into ordinary
 * date/startDate/endDate PatchOp/TopLevelItemOp entries *before* they reach
 * applyCascade/apply.ts/preview.ts, so none of that downstream code needs
 * to know this op kind exists. No Raw/coerce split needed (unlike
 * PatchOpSchema): every field here is already the type the model should
 * emit directly, same as DependencyOpSchema/BlufOpSchema below.
 */
export const BulkShiftSelectorSchema = z.discriminatedUnion("kind", [
  // laneId, or the reserved "PROGRAM" pseudo-lane selecting the whole PROGRAM band (which has no real laneId of its own).
  z.object({ kind: z.literal("lane"), laneId: z.string().min(1) }),
  // Cutoff is afterId's own current date, inclusive (the referenced item itself also shifts) — sweeps milestones + PROGRAM-band items together, not lane-scoped.
  z.object({ kind: z.literal("after"), afterId: z.string().min(1) }),
  // Explicit picks — real milestone and/or top-level-item ids, mixed freely.
  z.object({ kind: z.literal("ids"), ids: z.array(z.string().min(1)).min(1) }),
]);
export type BulkShiftSelector = z.infer<typeof BulkShiftSelectorSchema>;

export const BulkShiftOpSchema = z.object({
  selector: BulkShiftSelectorSchema,
  deltaDays: z.number().int(),
  reason: z.string().min(1),
});
export type BulkShiftOp = z.infer<typeof BulkShiftOpSchema>;

export const SkippedSchema = z.object({
  targetId: z.string().min(1),
  reason: z.string().min(1),
});

/**
 * The field literals a free-text correction can target — mirrors
 * PatchOpSchema's discriminant. `showReferenceLine`/`endDate` were already
 * real PatchOpSchema variants (wayframe#15/#48, plumbed for the manual
 * editor) but never listed here, so the AI path could never reach them — a
 * near-miss closed by wayframe#60, not a new field.
 */
export const CORRECTION_FIELDS = [
  "date",
  "status",
  "title",
  "percentComplete",
  "owner",
  "comment",
  "isCriticalPathOverride",
  "shortLabel",
  "showReferenceLine",
  "endDate",
  "potentialDate",
] as const;
const FieldEnum = z.enum(CORRECTION_FIELDS);

/**
 * What the model's tool call actually emits per op: `newValue` is always a
 * string (the tool-schema keeps one uniform type across every field rather
 * than a JSON-schema union), coerced field-by-field into the real typed
 * PatchOp below. Keeping the tool contract this simple avoids relying on the
 * model emitting a correctly-typed JSON number/boolean for
 * percentComplete/isCriticalPathOverride, which forced-tool-use models are
 * more error-prone about than a plain string.
 */
export const RawPatchOpSchema = z.object({
  targetId: z.string().min(1),
  field: FieldEnum,
  newValue: z.string(),
  reason: z.string().min(1),
});
export type RawPatchOp = z.infer<typeof RawPatchOpSchema>;

/**
 * Widened past date/status (wayframe#38 item 1 / #39) to the full manual-
 * editor field set, per the scope-widening prototype's finding: the risky
 * part was never which field gets written, it's reference resolution — see
 * prototype/correction-box-scope-widening's README.
 */
export function coercePatchOp(raw: RawPatchOp): { ok: true; op: PatchOp } | { ok: false; issue: string } {
  if (raw.field === "percentComplete") {
    const n = Number(raw.newValue);
    if (!Number.isFinite(n)) {
      return { ok: false, issue: `op for "${raw.targetId}": percentComplete newValue "${raw.newValue}" isn't a number` };
    }
    const parsed = PatchOpSchema.safeParse({ ...raw, field: "percentComplete", newValue: n });
    if (!parsed.success) return { ok: false, issue: `op for "${raw.targetId}": percentComplete ${parsed.error.issues.map((i) => i.message).join("; ")}` };
    return { ok: true, op: parsed.data };
  }
  if (raw.field === "isCriticalPathOverride") {
    const v = raw.newValue.trim().toLowerCase();
    if (v !== "true" && v !== "false") {
      return { ok: false, issue: `op for "${raw.targetId}": isCriticalPathOverride newValue "${raw.newValue}" isn't true/false` };
    }
    return { ok: true, op: { targetId: raw.targetId, field: "isCriticalPathOverride", newValue: v === "true", reason: raw.reason } };
  }
  if (raw.field === "showReferenceLine") {
    const v = raw.newValue.trim().toLowerCase();
    if (v !== "true" && v !== "false") {
      return { ok: false, issue: `op for "${raw.targetId}": showReferenceLine newValue "${raw.newValue}" isn't true/false` };
    }
    return { ok: true, op: { targetId: raw.targetId, field: "showReferenceLine", newValue: v === "true", reason: raw.reason } };
  }
  const parsed = PatchOpSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issue: `op for "${raw.targetId}": ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  return { ok: true, op: parsed.data };
}

/**
 * New op kind (wayframe#38 item 1 / #39): "add a milestone" isn't a field
 * widening, it's a new op type that has to invent a lane and (optionally) a
 * date from an under-specified request. Per the scope-widening prototype's
 * verdict: laneId is required — there's no sane default lane to guess, so
 * the model refuses (omits the add) rather than invent one. `date` is
 * optional; when the model can't resolve one, the client falls back to the
 * same "create empty, open for editing" behavior as the manual "+" button
 * (see use-correction-box.ts's addMilestone action).
 */
export const AddMilestoneOpSchema = z.object({
  title: z.string().min(1),
  laneId: z.string().min(1),
  date: z.string().nullable(),
  // Duration-pill creation via AI (wayframe#45/#59): a lane milestone with an
  // endDate renders as a span instead of a point marker, same field the
  // manual editor already exposes (Milestone.endDate). Optional/nullable —
  // omitting it still creates a plain point milestone.
  endDate: z.string().nullable().optional(),
  reason: z.string().min(1),
});
export type AddMilestoneOp = z.infer<typeof AddMilestoneOpSchema>;

/**
 * Generic entity delete (wayframe#55/#56/#58) — one op shape covers all
 * three deletable entity kinds rather than three separate op families,
 * since the only thing that varies per kind is which id set the target is
 * checked against (see findUnknownTargets) and which reducer action it
 * routes to (see use-correction-box.ts's "apply" case).
 */
export const EntityTypeSchema = z.enum(["milestone", "topLevelItem", "swimlane"]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const DeleteOpSchema = z.object({
  targetId: z.string().min(1),
  entityType: EntityTypeSchema,
  reason: z.string().min(1),
});
export type DeleteOp = z.infer<typeof DeleteOpSchema>;

/**
 * Curated recolor palette (wayframe#58) — the model emits a name, never a
 * hex value; resolveNamedLaneColor (apply.ts) resolves it server-side. This
 * keeps an AI-driven recolor from producing an arbitrary, possibly
 * inaccessible or off-theme hex.
 */
export const NAMED_LANE_COLORS = ["red", "amber", "green", "blue", "purple", "gray"] as const;
export type NamedLaneColor = (typeof NAMED_LANE_COLORS)[number];
const NamedLaneColorEnum = z.enum(NAMED_LANE_COLORS);

/** Swimlane.ragOverride's four states as the AI-facing op sees them — "auto" clears the override, mirroring the manual dropdown (SwimlaneManager.tsx). */
const RagOverrideValueSchema = z.union([RagSchema, z.literal("auto")]);
export type RagOverrideValue = z.infer<typeof RagOverrideValueSchema>;

/**
 * Swimlane management (wayframe#55/#58) — mirrors the existing manual
 * reducer actions (addSwimlane/renameSwimlane/moveSwimlane/setLaneColor)
 * one-for-one, plus ragOverride (new). `kind` is the discriminant, same
 * pattern as PatchOpSchema's `field`.
 */
export const SwimlaneOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), swimlaneType: z.enum(["lane", "separator"]), name: z.string().min(1), reason: z.string().min(1) }),
  z.object({ kind: z.literal("rename"), targetId: z.string().min(1), name: z.string().min(1), reason: z.string().min(1) }),
  z.object({ kind: z.literal("reorder"), targetId: z.string().min(1), delta: z.union([z.literal(-1), z.literal(1)]), reason: z.string().min(1) }),
  z.object({ kind: z.literal("recolor"), targetId: z.string().min(1), color: NamedLaneColorEnum, reason: z.string().min(1) }),
  z.object({ kind: z.literal("ragOverride"), targetId: z.string().min(1), rag: RagOverrideValueSchema, reason: z.string().min(1) }),
]);
export type SwimlaneOp = z.infer<typeof SwimlaneOpSchema>;

/**
 * What the model's tool call actually emits per swimlaneOp: one flat shape
 * with every kind's fields optional except kind/reason — same uniform-
 * shape-then-coerce split as RawPatchOpSchema/coercePatchOp above, since a
 * JSON-schema discriminated union isn't how the hand-authored tool-schema.ts
 * expresses this either.
 */
export const RawSwimlaneOpSchema = z.object({
  kind: z.enum(["add", "rename", "reorder", "recolor", "ragOverride"]),
  targetId: z.string().optional(),
  swimlaneType: z.enum(["lane", "separator"]).optional(),
  name: z.string().optional(),
  delta: z.number().optional(),
  color: z.string().optional(),
  rag: z.string().optional(),
  reason: z.string().min(1),
});
export type RawSwimlaneOp = z.infer<typeof RawSwimlaneOpSchema>;

export function coerceSwimlaneOp(raw: RawSwimlaneOp): { ok: true; op: SwimlaneOp } | { ok: false; issue: string } {
  switch (raw.kind) {
    case "add": {
      const parsed = SwimlaneOpSchema.safeParse({ kind: "add", swimlaneType: raw.swimlaneType, name: raw.name, reason: raw.reason });
      if (!parsed.success) return { ok: false, issue: `swimlaneOp "add": needs swimlaneType (lane|separator) and a name` };
      return { ok: true, op: parsed.data };
    }
    case "rename": {
      const parsed = SwimlaneOpSchema.safeParse({ kind: "rename", targetId: raw.targetId, name: raw.name, reason: raw.reason });
      if (!parsed.success) return { ok: false, issue: `swimlaneOp "rename" for "${raw.targetId}": needs targetId and a name` };
      return { ok: true, op: parsed.data };
    }
    case "reorder": {
      if (raw.delta !== -1 && raw.delta !== 1) {
        return { ok: false, issue: `swimlaneOp "reorder" for "${raw.targetId}": delta must be -1 or 1, got "${raw.delta}"` };
      }
      const parsed = SwimlaneOpSchema.safeParse({ kind: "reorder", targetId: raw.targetId, delta: raw.delta, reason: raw.reason });
      if (!parsed.success) return { ok: false, issue: `swimlaneOp "reorder" for "${raw.targetId}": needs a targetId` };
      return { ok: true, op: parsed.data };
    }
    case "recolor": {
      const parsed = SwimlaneOpSchema.safeParse({ kind: "recolor", targetId: raw.targetId, color: raw.color, reason: raw.reason });
      if (!parsed.success) return { ok: false, issue: `swimlaneOp "recolor" for "${raw.targetId}": color must be one of ${NAMED_LANE_COLORS.join("/")}, got "${raw.color}"` };
      return { ok: true, op: parsed.data };
    }
    case "ragOverride": {
      const parsed = SwimlaneOpSchema.safeParse({ kind: "ragOverride", targetId: raw.targetId, rag: raw.rag, reason: raw.reason });
      if (!parsed.success) return { ok: false, issue: `swimlaneOp "ragOverride" for "${raw.targetId}": rag must be one of green/amber/red/auto, got "${raw.rag}"` };
      return { ok: true, op: parsed.data };
    }
  }
}

/**
 * A tied match the model couldn't confidently break on its own — the
 * refuse-ambiguous policy (scope-widening prototype's verdict) surfaces the
 * tie as resolvable candidates instead of silently skipping all of them, so
 * a human can pick one and turn it straight into a normal op with no
 * retyping. `newValue` is precomputed per candidate (not shared) because a
 * date-shift's result depends on that candidate's own current date.
 */
export const AmbiguousCandidateSchema = z.object({
  targetId: z.string().min(1),
  newValue: z.string(),
});
export const AmbiguousChoiceSchema = z.object({
  field: FieldEnum,
  reason: z.string().min(1),
  candidates: z.array(AmbiguousCandidateSchema).min(2),
});
export type AmbiguousCandidate = z.infer<typeof AmbiguousCandidateSchema>;
export type AmbiguousChoice = z.infer<typeof AmbiguousChoiceSchema>;

/**
 * BLUF (So-what) edit (wayframe#55/#60) — one op, not targetId-addressed:
 * bluf is a single document-level entity (RoadmapData.bluf), the same
 * reasoning that keeps addMilestones' laneId required rather than every op
 * being self-describing. Mirrors editBluf's existing manual reducer action
 * (use-correction-box.ts) field-for-field, minus `size` — that's a resize
 * gesture, not something a free-text request plausibly asks for.
 */
export const BlufOpSchema = z.object({
  statement: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  label: z.string().optional(),
  reason: z.string().min(1),
});
export type BlufOp = z.infer<typeof BlufOpSchema>;

/**
 * Document-header fields (wayframe#55/#60) — programName/owner/reportsTo/
 * nextReviewDate all live at the RoadmapData root, one op shape for the same
 * reason as blufOp: there's exactly one of each per document, no id to
 * target.
 */
export const DocumentFieldsOpSchema = z.object({
  programName: z.string().optional(),
  owner: z.string().optional(),
  reportsTo: z.string().optional(),
  nextReviewDate: z.string().optional(),
  reason: z.string().min(1),
});
export type DocumentFieldsOp = z.infer<typeof DocumentFieldsOpSchema>;

/** Mirrors the existing Attachment type (components/timeline/types.ts). */
export const AttachmentSchema = z.object({
  type: z.enum(["image", "link"]),
  url: z.string().min(1),
  label: z.string().optional(),
});
export type AttachmentInput = z.infer<typeof AttachmentSchema>;

/**
 * Milestone.attachments management (wayframe#55/#60) — add-one/remove-one,
 * never a whole-list replace: the model isn't asked to echo back every
 * attachment a milestone already has just to add or drop one. `index` on
 * "add" is optional and manual-editor-only (lets the modal's in-place row
 * edit reuse this same op as remove-then-reinsert-at-position); the AI path
 * never sets it, so a model-proposed add always appends.
 */
export const AttachmentOpSchema = z.discriminatedUnion("action", [
  z.object({ targetId: z.string().min(1), action: z.literal("add"), attachment: AttachmentSchema, index: z.number().int().min(0).optional(), reason: z.string().min(1) }),
  z.object({ targetId: z.string().min(1), action: z.literal("remove"), index: z.number().int().min(0), reason: z.string().min(1) }),
]);
export type AttachmentOp = z.infer<typeof AttachmentOpSchema>;

/** Flat tool-call shape, coerced below — same split as RawSwimlaneOpSchema/coerceSwimlaneOp. */
export const RawAttachmentOpSchema = z.object({
  targetId: z.string().min(1),
  action: z.enum(["add", "remove"]),
  type: z.enum(["image", "link"]).optional(),
  url: z.string().optional(),
  label: z.string().optional(),
  index: z.number().optional(),
  reason: z.string().min(1),
});
export type RawAttachmentOp = z.infer<typeof RawAttachmentOpSchema>;

export function coerceAttachmentOp(raw: RawAttachmentOp): { ok: true; op: AttachmentOp } | { ok: false; issue: string } {
  if (raw.action === "remove") {
    if (raw.index === undefined) return { ok: false, issue: `attachmentOp "remove" for "${raw.targetId}": needs an index` };
    const parsed = AttachmentOpSchema.safeParse({ targetId: raw.targetId, action: "remove", index: raw.index, reason: raw.reason });
    if (!parsed.success) return { ok: false, issue: `attachmentOp "remove" for "${raw.targetId}": ${parsed.error.issues.map((i) => i.message).join("; ")}` };
    return { ok: true, op: parsed.data };
  }
  const parsed = AttachmentOpSchema.safeParse({
    targetId: raw.targetId,
    action: "add",
    attachment: { type: raw.type, url: raw.url, label: raw.label || undefined },
    reason: raw.reason,
  });
  if (!parsed.success) return { ok: false, issue: `attachmentOp "add" for "${raw.targetId}": needs type (image|link) and a url` };
  return { ok: true, op: parsed.data };
}

/** Shape the tool call's raw JSON is validated against, before op coercion. */
export const RawCorrectionResponseSchema = z.object({
  ops: z.array(RawPatchOpSchema).default([]),
  addMilestones: z.array(AddMilestoneOpSchema).default([]),
  deletes: z.array(DeleteOpSchema).default([]),
  swimlaneOps: z.array(RawSwimlaneOpSchema).default([]),
  topLevelItemOps: z.array(RawTopLevelItemOpSchema).default([]),
  addTopLevelItems: z.array(RawAddTopLevelItemOpSchema).default([]),
  dependencyOps: z.array(DependencyOpSchema).default([]),
  attachmentOps: z.array(RawAttachmentOpSchema).default([]),
  bulkShiftOps: z.array(BulkShiftOpSchema).default([]),
  blufOp: BlufOpSchema.nullable().default(null),
  documentOp: DocumentFieldsOpSchema.nullable().default(null),
  skipped: z.array(SkippedSchema).default([]),
  ambiguous: AmbiguousChoiceSchema.nullable().default(null),
});
export type RawCorrectionResponse = z.infer<typeof RawCorrectionResponseSchema>;

export const CorrectionResponseSchema = z.object({
  ops: z.array(PatchOpSchema).default([]),
  addMilestones: z.array(AddMilestoneOpSchema).default([]),
  deletes: z.array(DeleteOpSchema).default([]),
  swimlaneOps: z.array(SwimlaneOpSchema).default([]),
  topLevelItemOps: z.array(TopLevelItemOpSchema).default([]),
  addTopLevelItems: z.array(AddTopLevelItemOpSchema).default([]),
  dependencyOps: z.array(DependencyOpSchema).default([]),
  attachmentOps: z.array(AttachmentOpSchema).default([]),
  bulkShiftOps: z.array(BulkShiftOpSchema).default([]),
  blufOp: BlufOpSchema.nullable().default(null),
  documentOp: DocumentFieldsOpSchema.nullable().default(null),
  skipped: z.array(SkippedSchema).default([]),
  ambiguous: AmbiguousChoiceSchema.nullable().default(null),
});

export type PatchOp = z.infer<typeof PatchOpSchema>;
export type Skipped = z.infer<typeof SkippedSchema>;
export type CorrectionResponse = z.infer<typeof CorrectionResponseSchema>;

/**
 * Referential integrity against the milestone/lane/top-level-item list
 * actually sent to the model — same pattern as findDanglingReferences in
 * extraction/schema.ts: checked separately from the zod shape so a
 * hallucinated id produces the same actionable, field-pinpointed error
 * rather than a downstream crash when the client tries to apply an op to
 * something that doesn't exist.
 *
 * `knownLaneIds` covers lane-type swimlanes only (what addMilestones and
 * the lane-only swimlaneOps kinds — recolor, ragOverride — can target);
 * `knownSwimlaneIds` covers every swimlane row including separators (what
 * deletes/rename/reorder can target, since those apply to either type,
 * mirroring removeSwimlane/renameSwimlane/moveSwimlane's reducer actions).
 */
export function findUnknownTargets(
  response: CorrectionResponse,
  knownIds: ReadonlySet<string>,
  knownLaneIds: ReadonlySet<string> = new Set(),
  knownSwimlaneIds: ReadonlySet<string> = new Set(),
  knownTopLevelIds: ReadonlySet<string> = new Set(),
): string[] {
  const problems: string[] = [];
  for (const op of response.ops) {
    if (!knownIds.has(op.targetId)) {
      problems.push(`op references unknown targetId "${op.targetId}"`);
    }
  }
  for (const s of response.skipped) {
    if (!knownIds.has(s.targetId)) {
      problems.push(`skipped entry references unknown targetId "${s.targetId}"`);
    }
  }
  for (const a of response.addMilestones) {
    if (!knownLaneIds.has(a.laneId)) {
      problems.push(`addMilestones entry references unknown laneId "${a.laneId}"`);
    }
  }
  for (const d of response.deletes) {
    const known = d.entityType === "milestone" ? knownIds : d.entityType === "topLevelItem" ? knownTopLevelIds : knownSwimlaneIds;
    if (!known.has(d.targetId)) {
      problems.push(`delete entry references unknown ${d.entityType} targetId "${d.targetId}"`);
    }
  }
  for (const op of response.swimlaneOps) {
    if (op.kind === "add") continue;
    const known = op.kind === "recolor" || op.kind === "ragOverride" ? knownLaneIds : knownSwimlaneIds;
    if (!known.has(op.targetId)) {
      problems.push(`swimlaneOp "${op.kind}" references unknown targetId "${op.targetId}"`);
    }
  }
  for (const op of response.topLevelItemOps) {
    if (!knownTopLevelIds.has(op.targetId)) {
      problems.push(`topLevelItemOp "${op.field}" references unknown targetId "${op.targetId}"`);
    }
  }
  for (const op of response.dependencyOps) {
    if (!knownIds.has(op.dependentId)) {
      problems.push(`dependencyOp references unknown dependentId "${op.dependentId}"`);
    }
    if (!knownIds.has(op.dependencyId)) {
      problems.push(`dependencyOp references unknown dependencyId "${op.dependencyId}"`);
    }
  }
  for (const op of response.attachmentOps) {
    if (!knownIds.has(op.targetId)) {
      problems.push(`attachmentOp references unknown targetId "${op.targetId}"`);
    }
  }
  for (const op of response.bulkShiftOps) {
    if (op.selector.kind === "lane") {
      if (op.selector.laneId !== "PROGRAM" && !knownLaneIds.has(op.selector.laneId)) {
        problems.push(`bulkShiftOp references unknown laneId "${op.selector.laneId}"`);
      }
    } else if (op.selector.kind === "after") {
      if (!knownIds.has(op.selector.afterId) && !knownTopLevelIds.has(op.selector.afterId)) {
        problems.push(`bulkShiftOp references unknown afterId "${op.selector.afterId}"`);
      }
    } else {
      for (const id of op.selector.ids) {
        if (!knownIds.has(id) && !knownTopLevelIds.has(id)) {
          problems.push(`bulkShiftOp references unknown id "${id}" in an ids selector`);
        }
      }
    }
  }
  if (response.ambiguous) {
    for (const c of response.ambiguous.candidates) {
      if (!knownIds.has(c.targetId)) {
        problems.push(`ambiguous candidate references unknown targetId "${c.targetId}"`);
      }
    }
  }
  return problems;
}
