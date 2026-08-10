import type Anthropic from "@anthropic-ai/sdk";
import { CORRECTION_TOOL_NAME } from "./prompt";
import { CORRECTION_FIELDS } from "./schema";

const STATUS_ENUM = [
  "not-started",
  "on-track",
  "at-risk",
  "delayed",
  "complete",
];

/**
 * Hand-authored JSON Schema for the tool's input, kept in sync with
 * CorrectionResponseSchema in schema.ts — same split as extraction's
 * tool-schema.ts/schema.ts: this steers the model's output shape,
 * schema.ts's zod schema is what actually validates the response.
 *
 * `field` widened past date/status to the full manual-editor field set
 * (wayframe#38 item 1 / #39) — `newValue` stays a plain string across every
 * field (including percentComplete/isCriticalPathOverride); schema.ts's
 * coercePatchOp turns it into the real typed value. `addMilestones` and
 * `ambiguous` are new op kinds from the same decision: an add isn't a field
 * widening (it invents a lane/date), and an ambiguous tie is surfaced as
 * resolvable candidates instead of silently skipped (refuse-ambiguous).
 */
export const CORRECTION_TOOL: Anthropic.Tool = {
  name: CORRECTION_TOOL_NAME,
  description:
    "Propose targeted edits, new milestones, explicitly-skipped candidates, and/or a clarifying question resolving a free-text correction request against the given milestone list.",
  input_schema: {
    type: "object",
    properties: {
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            targetId: { type: "string", description: "Real id of the milestone this op applies to — must be one of the given milestone ids." },
            field: { type: "string", enum: [...CORRECTION_FIELDS] },
            newValue: {
              type: "string",
              description:
                "Always a string, whatever the field's real type: for field=date, the shifted ISO date (YYYY-MM-DD); for field=status, one of " +
                STATUS_ENUM.join("|") +
                "; for field=percentComplete, an integer 0-100 as a string; for field=isCriticalPathOverride, the literal string \"true\" or \"false\"; for title/owner/comment/shortLabel, the literal new text.",
            },
            reason: { type: "string", description: "Short explanation of why this milestone matched the request." },
          },
          required: ["targetId", "field", "newValue", "reason"],
        },
      },
      addMilestones: {
        type: "array",
        description: "New milestones the request asks to create. Only include one if you can confidently resolve a lane — never guess a lane.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "The new milestone's title." },
            laneId: { type: "string", description: "Real id of the swimlane this milestone belongs in — must be one of the given lane ids. Required; if no lane can be confidently resolved from the request, omit this add entirely rather than guessing one." },
            date: { type: ["string", "null"], description: "ISO date (YYYY-MM-DD) if the request specifies or implies one, otherwise null." },
            reason: { type: "string", description: "Short explanation of how the lane (and date, if any) were resolved." },
          },
          required: ["title", "laneId", "reason"],
        },
      },
      skipped: {
        type: "array",
        items: {
          type: "object",
          properties: {
            targetId: { type: "string", description: "Real id of a milestone that plausibly matched but was deliberately excluded." },
            reason: { type: "string" },
          },
          required: ["targetId", "reason"],
        },
      },
      ambiguous: {
        type: ["object", "null"],
        description:
          "Set this instead of guessing when the request's subject ties equally across multiple milestones (e.g. several milestones share a word and none is a clearly better match). Do not emit ops for tied candidates — list them here so the person can pick one.",
        properties: {
          field: { type: "string", enum: [...CORRECTION_FIELDS] },
          reason: { type: "string", description: "Explain the tie, e.g. how many milestones matched and on what." },
          candidates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                targetId: { type: "string", description: "Real id of a tied milestone." },
                newValue: { type: "string", description: "What this specific candidate's newValue would be if picked — same string convention as ops.newValue." },
              },
              required: ["targetId", "newValue"],
            },
          },
        },
        required: ["field", "reason", "candidates"],
      },
    },
    required: ["ops", "skipped"],
  },
};
