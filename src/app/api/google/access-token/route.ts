import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { refreshAccessToken } from "@/lib/db/google-tokens";

/**
 * wayframe#t30 — the one place a raw Google access token is ever handed to
 * client-side JS: Google's Picker API requires a live OAuth token passed
 * into `PickerBuilder().setOAuthToken(...)`, there's no server-side Picker
 * flow. The `drive.file` scope this app requests is narrow enough (only
 * files the user explicitly picks or this app created) that this is the
 * standard, expected way to use Picker, not a security shortcut.
 */
export async function GET() {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const accessToken = await refreshAccessToken(identity);
  if (!accessToken) return NextResponse.json({ error: "no_valid_token" }, { status: 403 });

  return NextResponse.json({ accessToken });
}
