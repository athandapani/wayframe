import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { acceptPendingInvites } from "@/lib/db/portfolios";

/**
 * wayframe#t37: called once per authenticated sign-in (see
 * use-accept-invites.ts) to resolve any pending email invites matching the
 * signed-in identity's Google account email into real membership rows. A
 * Google account with no email scope granted is treated as a no-op, not an
 * error — same posture as t17's migrate-local route's "nothing local to
 * migrate" case.
 */
export async function POST() {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const email = session.user?.email;
  if (!email) return NextResponse.json({ portfolioIds: [] });

  const portfolioIds = await acceptPendingInvites(identity, email);
  return NextResponse.json({ portfolioIds });
}
