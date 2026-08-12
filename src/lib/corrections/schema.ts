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
]);

export const SkippedSchema = z.object({
  targetId: z.string().min(1),
  reason: z.string().min(1),
});

/** The field literals a free-text correction can target — mirrors PatchOpSchema's discriminant. */
export const CORRECTION_FIELDS = [
  "date",
  "status",
  "title",
  "percentComplete",
  "owner",
  "comment",
  "isCriticalPathOverride",
  "shortLabel",
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

/** Shape the tool call's raw JSON is validated against, before op coercion. */
export const RawCorrectionResponseSchema = z.object({
  ops: z.array(RawPatchOpSchema).default([]),
  addMilestones: z.array(AddMilestoneOpSchema).default([]),
  deletes: z.array(DeleteOpSchema).default([]),
  swimlaneOps: z.array(RawSwimlaneOpSchema).default([]),
  skipped: z.array(SkippedSchema).default([]),
  ambiguous: AmbiguousChoiceSchema.nullable().default(null),
});
export type RawCorrectionResponse = z.infer<typeof RawCorrectionResponseSchema>;

export const CorrectionResponseSchema = z.object({
  ops: z.array(PatchOpSchema).default([]),
  addMilestones: z.array(AddMilestoneOpSchema).default([]),
  deletes: z.array(DeleteOpSchema).default([]),
  swimlaneOps: z.array(SwimlaneOpSchema).default([]),
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
  if (response.ambiguous) {
    for (const c of response.ambiguous.candidates) {
      if (!knownIds.has(c.targetId)) {
        problems.push(`ambiguous candidate references unknown targetId "${c.targetId}"`);
      }
    }
  }
  return problems;
}
