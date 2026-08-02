import { z } from "zod";
import { StatusSchema } from "@/lib/extraction/schema";

/**
 * The patch shape settled in issue #9: targeted ops against the *existing*
 * document's real ids (no tempKey scheme needed — unlike #6's initial
 * extraction, ids already exist before a correction call). `field` is a
 * discriminated union so `newValue` is validated against the right type
 * per field, the same way schema.ts keeps date/status apart.
 *
 * Scope is intentionally just date/status — the two directive shapes
 * validated by #9's hand-driven prototype (shift-by-duration, set-status).
 * `previousValue` is deliberately not part of the model's response: the
 * client derives it by looking up the live document, so a stale or
 * hallucinated echo can't desync from truth.
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
]);

export const SkippedSchema = z.object({
  targetId: z.string().min(1),
  reason: z.string().min(1),
});

export const CorrectionResponseSchema = z.object({
  ops: z.array(PatchOpSchema).default([]),
  skipped: z.array(SkippedSchema).default([]),
});

export type PatchOp = z.infer<typeof PatchOpSchema>;
export type Skipped = z.infer<typeof SkippedSchema>;
export type CorrectionResponse = z.infer<typeof CorrectionResponseSchema>;

/**
 * Referential integrity against the milestone list actually sent to the
 * model — same pattern as findDanglingReferences in extraction/schema.ts:
 * checked separately from the zod shape so a hallucinated id produces the
 * same actionable, field-pinpointed error rather than a downstream crash
 * when the client tries to apply an op to a milestone that doesn't exist.
 */
export function findUnknownTargets(
  response: CorrectionResponse,
  knownIds: ReadonlySet<string>,
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
  return problems;
}
