import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { proposeCorrection, type CorrectionError } from "@/lib/corrections/correct";
import { CORRECTION_TOOL } from "@/lib/corrections/tool-schema";
import type { CorrectionLaneRef, CorrectionMilestoneRef } from "@/lib/corrections/prompt";

const client = new Anthropic();

const STATUS_BY_ERROR_KIND: Record<CorrectionError["kind"], number> = {
  no_input: 400,
  no_tool_call: 502,
  api_error: 502,
  schema_validation_failed: 422,
  unknown_target: 422,
};

function isMilestoneRef(v: unknown): v is CorrectionMilestoneRef {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.laneName === "string" &&
    typeof r.date === "string" &&
    typeof r.status === "string"
  );
}

function isLaneRef(v: unknown): v is CorrectionLaneRef {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.name === "string";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: { kind: "no_input", message: "Request body must be JSON with milestones and correctionText." } },
      { status: 400 },
    );
  }

  const { milestones, lanes, correctionText } = body as { milestones?: unknown; lanes?: unknown; correctionText?: unknown };

  if (!Array.isArray(milestones) || !milestones.every(isMilestoneRef)) {
    return NextResponse.json(
      { error: { kind: "no_input", message: "milestones must be an array of {id, title, laneName, date, status}." } },
      { status: 400 },
    );
  }

  if (!Array.isArray(lanes) || !lanes.every(isLaneRef)) {
    return NextResponse.json(
      { error: { kind: "no_input", message: "lanes must be an array of {id, name}." } },
      { status: 400 },
    );
  }

  const result = await proposeCorrection(
    {
      milestones,
      lanes,
      correctionText: typeof correctionText === "string" ? correctionText : "",
    },
    async (system, messages) =>
      client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system,
        messages,
        tools: [CORRECTION_TOOL],
        tool_choice: { type: "tool", name: CORRECTION_TOOL.name },
      }),
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR_KIND[result.error.kind] });
  }

  return NextResponse.json({ patch: result.response });
}
