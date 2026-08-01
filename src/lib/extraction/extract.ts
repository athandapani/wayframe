import type Anthropic from "@anthropic-ai/sdk";
import { buildExtractionMessages, systemPrompt, type ExtractionInput } from "./prompt";
import { EXTRACTION_TOOL } from "./tool-schema";
import { RoadmapDraftSchema, findDanglingReferences, type RoadmapDraft } from "./schema";
import { resolveDraftIds, type RoadmapDocument } from "./resolve-ids";

export type ExtractionError =
  | { kind: "no_input"; message: string }
  | { kind: "api_error"; message: string }
  | { kind: "no_tool_call"; message: string }
  | { kind: "schema_validation_failed"; message: string; issues: string[] }
  | { kind: "dangling_reference"; message: string; issues: string[] }
  | { kind: "empty_extraction"; message: string };

export type ExtractionResult =
  | { ok: true; document: RoadmapDocument }
  | { ok: false; error: ExtractionError };

/**
 * Injected so this module stays pure/testable — the real Anthropic call
 * lives in the API route; the prototype TUI injects a canned-response
 * version of the same signature.
 */
export type CallModel = (
  system: string,
  messages: Anthropic.MessageParam[],
) => Promise<Anthropic.Message>;

function extractToolInput(response: Anthropic.Message): unknown | null {
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  return toolUse ? toolUse.input : null;
}

function validate(
  raw: unknown,
): { ok: true; draft: RoadmapDraft } | { ok: false; error: ExtractionError } {
  const parsed = RoadmapDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: "schema_validation_failed",
        message: "Extraction didn't match the expected shape.",
        issues: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
        ),
      },
    };
  }

  const dangling = findDanglingReferences(parsed.data);
  if (dangling.length > 0) {
    return {
      ok: false,
      error: {
        kind: "dangling_reference",
        message: "Extraction referenced a lane, milestone, or top-level item that doesn't exist.",
        issues: dangling,
      },
    };
  }

  return { ok: true, draft: parsed.data };
}

function isEmptyExtraction(draft: RoadmapDraft): boolean {
  return draft.topLevelItems.length === 0 && draft.milestones.length === 0;
}

function repairMessages(
  original: Anthropic.MessageParam[],
  badResponse: Anthropic.Message,
  error: ExtractionError,
): Anthropic.MessageParam[] {
  const toolUse = badResponse.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  const issueList =
    "issues" in error ? error.issues.map((i) => `- ${i}`).join("\n") : error.message;

  return [
    ...original,
    { role: "assistant", content: badResponse.content },
    {
      role: "user",
      content: toolUse
        ? [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              is_error: true,
              content: `Your extraction had validation problems. Fix these specific issues and call ${EXTRACTION_TOOL.name} again with a corrected result:\n${issueList}`,
            },
          ]
        : `You didn't call ${EXTRACTION_TOOL.name}. Call it now with your best-effort extraction.`,
    },
  ];
}

/**
 * Orchestrates one extraction attempt plus, if needed, exactly one repair
 * retry. Never returns a partially-valid document — a still-broken result
 * after the retry comes back as a typed error for the route to surface,
 * not a half-populated RoadmapDocument for the UI to choke on.
 */
export async function extractRoadmap(
  input: ExtractionInput,
  callModel: CallModel,
): Promise<ExtractionResult> {
  if (!input.text?.trim() && !input.imageDataUrl) {
    return {
      ok: false,
      error: { kind: "no_input", message: "Provide typed text, an image, or both." },
    };
  }

  const messages = buildExtractionMessages(input);

  let response: Anthropic.Message;
  try {
    response = await callModel(systemPrompt(), messages);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "api_error",
        message: err instanceof Error ? err.message : "Claude API call failed.",
      },
    };
  }

  let raw = extractToolInput(response);
  if (raw === null) {
    return {
      ok: false,
      error: { kind: "no_tool_call", message: "Model did not call the extraction tool." },
    };
  }

  let result = validate(raw);

  if (!result.ok) {
    let retryResponse: Anthropic.Message;
    try {
      retryResponse = await callModel(systemPrompt(), repairMessages(messages, response, result.error));
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: "api_error",
          message: err instanceof Error ? err.message : "Claude API call failed during repair.",
        },
      };
    }

    raw = extractToolInput(retryResponse);
    if (raw === null) {
      return {
        ok: false,
        error: { kind: "no_tool_call", message: "Model did not call the extraction tool on retry." },
      };
    }
    result = validate(raw);
    if (!result.ok) {
      // One repair attempt only — fail closed rather than loop.
      return result;
    }
  }

  if (isEmptyExtraction(result.draft)) {
    return {
      ok: false,
      error: {
        kind: "empty_extraction",
        message: "No milestones or schedule items could be found in the input.",
      },
    };
  }

  return { ok: true, document: resolveDraftIds(result.draft) };
}

export type { RoadmapDocument };
