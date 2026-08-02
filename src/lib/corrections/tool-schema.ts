import type Anthropic from "@anthropic-ai/sdk";
import { CORRECTION_TOOL_NAME } from "./prompt";

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
 */
export const CORRECTION_TOOL: Anthropic.Tool = {
  name: CORRECTION_TOOL_NAME,
  description:
    "Propose targeted edits (and explicitly-skipped candidates) resolving a free-text correction request against the given milestone list.",
  input_schema: {
    type: "object",
    properties: {
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            targetId: { type: "string", description: "Real id of the milestone this op applies to — must be one of the given milestone ids." },
            field: { type: "string", enum: ["date", "status"] },
            newValue: {
              type: "string",
              description:
                "For field=date: the shifted ISO date (YYYY-MM-DD). For field=status: one of " +
                STATUS_ENUM.join("|") +
                ".",
            },
            reason: { type: "string", description: "Short explanation of why this milestone matched the request." },
          },
          required: ["targetId", "field", "newValue", "reason"],
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
    },
    required: ["ops", "skipped"],
  },
};
