import type Anthropic from "@anthropic-ai/sdk";
import { buildCorrectionMessages, systemPrompt, type CorrectionInput } from "./prompt";
import { CORRECTION_TOOL } from "./tool-schema";
import { RawCorrectionResponseSchema, coercePatchOp, findUnknownTargets, type CorrectionResponse, type PatchOp } from "./schema";

export type CorrectionError =
  | { kind: "no_input"; message: string }
  | { kind: "api_error"; message: string }
  | { kind: "no_tool_call"; message: string }
  | { kind: "schema_validation_failed"; message: string; issues: string[] }
  | { kind: "unknown_target"; message: string; issues: string[] };

export type CorrectionResult =
  | { ok: true; response: CorrectionResponse }
  | { ok: false; error: CorrectionError };

/**
 * Injected so this module stays pure/testable — mirrors extraction/extract.ts's
 * CallModel signature exactly (the real Anthropic call lives in the API route).
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
  knownIds: ReadonlySet<string>,
  knownLaneIds: ReadonlySet<string>,
): { ok: true; response: CorrectionResponse } | { ok: false; error: CorrectionError } {
  const parsed = RawCorrectionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: "schema_validation_failed",
        message: "Correction response didn't match the expected shape.",
        issues: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
        ),
      },
    };
  }

  // Coercing raw string newValues (tool-schema.ts's uniform string contract)
  // into their real typed PatchOp shape — see coercePatchOp's doc.
  const ops: PatchOp[] = [];
  const coercionIssues: string[] = [];
  for (const rawOp of parsed.data.ops) {
    const result = coercePatchOp(rawOp);
    if (result.ok) ops.push(result.op);
    else coercionIssues.push(result.issue);
  }
  if (coercionIssues.length > 0) {
    return {
      ok: false,
      error: { kind: "schema_validation_failed", message: "Correction response had invalid op values.", issues: coercionIssues },
    };
  }

  const response: CorrectionResponse = {
    ops,
    addMilestones: parsed.data.addMilestones,
    skipped: parsed.data.skipped,
    ambiguous: parsed.data.ambiguous,
  };

  const unknown = findUnknownTargets(response, knownIds, knownLaneIds);
  if (unknown.length > 0) {
    return {
      ok: false,
      error: {
        kind: "unknown_target",
        message: "Correction referenced a milestone or lane id that wasn't in the given list.",
        issues: unknown,
      },
    };
  }

  return { ok: true, response };
}

function repairMessages(
  original: Anthropic.MessageParam[],
  badResponse: Anthropic.Message,
  error: CorrectionError,
): Anthropic.MessageParam[] {
  const toolUse = badResponse.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  const issueList = "issues" in error ? error.issues.map((i) => `- ${i}`).join("\n") : error.message;

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
              content: `Your response had validation problems. Fix these specific issues and call ${CORRECTION_TOOL.name} again with a corrected result:\n${issueList}`,
            },
          ]
        : `You didn't call ${CORRECTION_TOOL.name}. Call it now with your best-effort resolution.`,
    },
  ];
}

/**
 * Orchestrates one correction-resolution attempt plus, if needed, exactly
 * one repair retry — same fail-closed shape as extraction/extract.ts's
 * extractRoadmap: never returns a response with a dangling targetId for
 * the client to choke on.
 */
export async function proposeCorrection(
  input: CorrectionInput,
  callModel: CallModel,
): Promise<CorrectionResult> {
  if (!input.correctionText?.trim()) {
    return { ok: false, error: { kind: "no_input", message: "Provide a correction request." } };
  }

  const knownIds = new Set(input.milestones.map((m) => m.id));
  const knownLaneIds = new Set(input.lanes.map((l) => l.id));
  const messages = buildCorrectionMessages(input);

  let response: Anthropic.Message;
  try {
    response = await callModel(systemPrompt(), messages);
  } catch (err) {
    return {
      ok: false,
      error: { kind: "api_error", message: err instanceof Error ? err.message : "Claude API call failed." },
    };
  }

  let raw = extractToolInput(response);
  if (raw === null) {
    return { ok: false, error: { kind: "no_tool_call", message: "Model did not call the correction tool." } };
  }

  let result = validate(raw, knownIds, knownLaneIds);

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
      return { ok: false, error: { kind: "no_tool_call", message: "Model did not call the correction tool on retry." } };
    }
    result = validate(raw, knownIds, knownLaneIds);
    if (!result.ok) {
      // One repair attempt only — fail closed rather than loop.
      return result;
    }
  }

  return { ok: true, response: result.response };
}
