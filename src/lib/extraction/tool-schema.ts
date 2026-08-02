import type Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_TOOL_NAME } from "./prompt";

const STATUS_ENUM = [
  "not-started",
  "on-track",
  "at-risk",
  "delayed",
  "complete",
];

/**
 * Hand-authored JSON Schema for the tool's input, kept in sync with
 * RoadmapDraftSchema in schema.ts. This is what steers the model's output
 * shape; schema.ts's zod schema is the source of truth that actually
 * validates the response — the two are intentionally decoupled so a
 * prompt-shape tweak here can't silently loosen validation.
 */
export const EXTRACTION_TOOL: Anthropic.Tool = {
  name: EXTRACTION_TOOL_NAME,
  description:
    "Emit the extracted program roadmap as structured data matching the given shape.",
  input_schema: {
    type: "object",
    properties: {
      schemaVersion: { type: "string", enum: ["1.0"] },
      programName: { type: "string" },
      owner: { type: "string" },
      reportsTo: { type: "string" },
      nextReviewDate: { type: "string", description: "ISO date" },
      bluf: {
        type: "object",
        properties: {
          statement: { type: "string" },
          bullets: { type: "array", items: { type: "string" }, maxItems: 4 },
        },
        required: ["statement", "bullets"],
      },
      actionItems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            owner: { type: "string" },
            dueDate: { type: "string" },
            done: { type: "boolean" },
          },
          required: ["text"],
        },
      },
      swimlanes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            tempKey: { type: "string" },
            order: { type: "number" },
            type: { type: "string", enum: ["lane", "separator"] },
            name: { type: "string" },
            ragOverride: {
              type: "string",
              enum: ["green", "amber", "red"],
              description: "Manual Executive-view rollup override — leave unset unless the input explicitly states a status the milestones don't already imply.",
            },
          },
          required: ["tempKey", "order", "type", "name"],
        },
      },
      topLevelItems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tempKey: { type: "string" },
            type: { type: "string", enum: ["milestone", "phase", "annotation"] },
            title: { type: "string" },
            date: { type: "string", description: "used by milestone/annotation" },
            startDate: { type: "string", description: "used by phase" },
            endDate: { type: "string", description: "used by phase" },
            status: { type: "string", enum: STATUS_ENUM },
            message: { type: "string", description: "used by annotation" },
          },
          required: ["tempKey", "type", "title"],
        },
      },
      milestones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tempKey: { type: "string" },
            laneRef: { type: "string" },
            title: { type: "string" },
            date: { type: "string" },
            status: { type: "string", enum: STATUS_ENUM },
            percentComplete: { type: "number", minimum: 0, maximum: 100 },
            owner: { type: "string" },
            comment: { type: "string" },
            dependsOn: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tempKey: {
                    type: "string",
                    description: "tempKey of the predecessor milestone",
                  },
                  showConnector: { type: "boolean" },
                },
                required: ["tempKey", "showConnector"],
              },
            },
            linksToTopLevelMilestoneRef: {
              type: ["string", "null"],
              description: "tempKey of a topLevelItems entry, or null",
            },
            isCriticalPath: { type: "boolean" },
            attachments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["image", "link"] },
                  url: { type: "string" },
                  label: { type: "string" },
                },
                required: ["type", "url"],
              },
            },
            shortLabel: {
              type: "string",
              description: "Hand-picked short abbreviation for the timeline marker, only if the input explicitly gives one — otherwise omit and let it auto-derive from the title.",
            },
            originalDate: {
              type: "string",
              description: "Baseline date, only if the input explicitly states both an original and a since-slipped date — otherwise omit.",
            },
          },
          required: [
            "tempKey",
            "laneRef",
            "title",
            "date",
            "status",
            "dependsOn",
            "linksToTopLevelMilestoneRef",
            "isCriticalPath",
          ],
        },
      },
    },
    required: [
      "schemaVersion",
      "programName",
      "owner",
      "bluf",
      "actionItems",
      "swimlanes",
      "topLevelItems",
      "milestones",
    ],
  },
};
