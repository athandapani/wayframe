import { z } from "zod";
import { StatusSchema } from "@/lib/extraction/schema";

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
  skipped: z.array(SkippedSchema).default([]),
  ambiguous: AmbiguousChoiceSchema.nullable().default(null),
});
export type RawCorrectionResponse = z.infer<typeof RawCorrectionResponseSchema>;

export const CorrectionResponseSchema = z.object({
  ops: z.array(PatchOpSchema).default([]),
  addMilestones: z.array(AddMilestoneOpSchema).default([]),
  skipped: z.array(SkippedSchema).default([]),
  ambiguous: AmbiguousChoiceSchema.nullable().default(null),
});

export type PatchOp = z.infer<typeof PatchOpSchema>;
export type Skipped = z.infer<typeof SkippedSchema>;
export type CorrectionResponse = z.infer<typeof CorrectionResponseSchema>;

/**
 * Referential integrity against the milestone/lane list actually sent to the
 * model — same pattern as findDanglingReferences in extraction/schema.ts:
 * checked separately from the zod shape so a hallucinated id produces the
 * same actionable, field-pinpointed error rather than a downstream crash
 * when the client tries to apply an op to a milestone that doesn't exist.
 */
export function findUnknownTargets(
  response: CorrectionResponse,
  knownIds: ReadonlySet<string>,
  knownLaneIds: ReadonlySet<string> = new Set(),
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
  if (response.ambiguous) {
    for (const c of response.ambiguous.candidates) {
      if (!knownIds.has(c.targetId)) {
        problems.push(`ambiguous candidate references unknown targetId "${c.targetId}"`);
      }
    }
  }
  return problems;
}
