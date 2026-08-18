import { NextResponse } from "next/server";
import { hasEnv } from "@/lib/server/env-guard";

/**
 * Backend-foundation visibility — the equivalent of
 * a "startup log" naming which optional integrations are configured,
 * surfaced as an inspectable endpoint rather than a console line: a
 * serverless function has no persistent process startup the way a
 * long-running Express server does, so there's no boot-time moment to log
 * at. Booleans only — never echoes a configured value, same posture as
 * requireEnv (see src/lib/server/env-guard.ts).
 */
export async function GET() {
  return NextResponse.json({
    anthropicConfigured: hasEnv("ANTHROPIC_API_KEY"),
    smartsheetConfigured: hasEnv("SMARTSHEET_API_TOKEN"),
  });
}
