import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getRole, getShareLink, listInvites, listMembers } from "@/lib/db/portfolios";

/**
 * wayframe#t37: the one combined read the owner-facing Share panel needs —
 * members, pending invites, and the current public link, in a single
 * round-trip. Owner-only (403 for editor/viewer/non-member) since it
 * exposes every collaborator's identity and every pending invitee's email.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId } = await params;
  const role = await getRole(portfolioId, identity);
  if (role !== "owner") {
    return NextResponse.json({ error: "Only the owner can view sharing settings." }, { status: 403 });
  }

  const [members, invites, shareLink] = await Promise.all([
    listMembers(portfolioId),
    listInvites(portfolioId),
    getShareLink(portfolioId),
  ]);

  return NextResponse.json({ members, invites, shareLink });
}
