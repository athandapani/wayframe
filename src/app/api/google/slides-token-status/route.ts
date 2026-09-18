import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { refreshAccessToken } from "@/lib/db/google-tokens";

/**
 * wayframe#t30's "valid-token check" primitive — the export UI calls this
 * before a Slides send to decide whether to pop the re-consent flow first.
 * `ok: false` covers both "never granted" and "granted, then revoked" the
 * same way (refreshAccessToken clears a dead row on a failed refresh), so
 * the client never needs to distinguish them — either way the next step is
 * the same inline re-consent.
 */
export async function GET() {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ ok: false }, { status: 401 });

  const accessToken = await refreshAccessToken(identity);
  return NextResponse.json({ ok: accessToken !== null });
}
