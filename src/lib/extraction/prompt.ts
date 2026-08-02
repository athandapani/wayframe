import type Anthropic from "@anthropic-ai/sdk";

export interface ExtractionInput {
  text?: string;
  /** data: URL, e.g. "data:image/png;base64,...." */
  imageDataUrl?: string;
}

export const EXTRACTION_TOOL_NAME = "emit_roadmap_draft";

const SYSTEM_PROMPT = `You are extracting a structured program roadmap from a program manager's rough working notes. The input may be typed meeting notes, a photo of a whiteboard or napkin sketch, or both together.

Your job is to read the input carefully and call the ${EXTRACTION_TOOL_NAME} tool exactly once with your best-effort structured extraction. Rules:

- Never invent milestones, dates, or owners that aren't implied by the input. If a field is genuinely unknown, omit it (if optional) rather than guessing.
- If the input mentions dates without a year, assume the nearest future occurrence.
- Swimlanes should mirror the organizational tracks/workstreams visible in the input (e.g. team names, functions). If none are evident, use a single lane named "Program".
- Every milestone must belong to exactly one swimlane via laneRef.
- tempKey values are your own short, readable, unique identifiers (e.g. "lane-eng", "ms-fcc-cert") — invent them fresh for this response. They are NOT real ids; they only need to be unique and consistent within this single response, so you can cross-reference a milestone's lane, dependencies, and top-level link.
- dependsOn should capture real logical/technical dependencies you can infer between milestones, not just chronological ordering.
- Set showConnector to true only for the small number of dependency edges that represent the critical narrative thread worth drawing as a line on the chart — not every edge.
- isCriticalPath is a manual flag for milestones the input explicitly calls out as critical-path or blocking; don't compute a critical path yourself.
- Set a milestone's endDate only when the input explicitly describes it as spanning a date range (e.g. "integration testing, June–August") rather than a single point in time — most milestones should NOT have an endDate.
- Set showReferenceLine to true only for the rare milestone the input calls out as an important date to visually flag on its own (e.g. a contract deadline, an external regulatory gate) — not for every milestone.
- bluf.statement is one sentence capturing the program's current "so what". bluf.bullets is at most 4 supporting points.
- If the input is illegible, empty, or contains no discernible roadmap content, still call the tool, but return empty arrays for swimlanes/topLevelItems/milestones rather than fabricating content. (swimlanes still requires at least one entry — use a single lane named "Program" as a placeholder in that case.)`;

export function buildExtractionMessages(
  input: ExtractionInput,
): Anthropic.MessageParam[] {
  const content: Anthropic.ContentBlockParam[] = [];

  if (input.imageDataUrl) {
    const match = input.imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      throw new Error("imageDataUrl must be a base64 data: URL");
    }
    const [, mediaType, base64Data] = match;
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/png" | "image/jpeg" | "image/webp",
        data: base64Data,
      },
    });
  }

  content.push({
    type: "text",
    text: input.text?.trim()
      ? input.text
      : "(No typed notes provided — extract from the attached image only.)",
  });

  return [{ role: "user", content }];
}

export function systemPrompt(): string {
  return SYSTEM_PROMPT;
}
