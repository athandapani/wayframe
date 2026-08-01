import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { extractRoadmap, type ExtractionError } from "@/lib/extraction/extract";
import { EXTRACTION_TOOL } from "@/lib/extraction/tool-schema";

const client = new Anthropic();

const STATUS_BY_ERROR_KIND: Record<ExtractionError["kind"], number> = {
  no_input: 400,
  no_tool_call: 502,
  api_error: 502,
  schema_validation_failed: 422,
  dangling_reference: 422,
  empty_extraction: 422,
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: { kind: "no_input", message: "Request body must be JSON with text and/or imageDataUrl." } },
      { status: 400 },
    );
  }

  const { text, imageDataUrl } = body as { text?: unknown; imageDataUrl?: unknown };

  const result = await extractRoadmap(
    {
      text: typeof text === "string" ? text : undefined,
      imageDataUrl: typeof imageDataUrl === "string" ? imageDataUrl : undefined,
    },
    async (system, messages) =>
      client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 8192,
        system,
        messages,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      }),
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR_KIND[result.error.kind] });
  }

  return NextResponse.json({ document: result.document });
}
