import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getRole, removeMember } from "@/lib/db/portfolios";

/**
 * wayframe#t37: owner removes a member. Rejects removing the caller's own
 * identity or an owner — no ownership-transfer mechanism exists yet, so
 * there must always be exactly the one owner a Portfolio was created with.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ portfolioId: string; identity: string }> }) {
  const session = await auth();
  const callerIdentity = session?.user?.id;
  if (!callerIdentity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId, identity: targetIdentity } = await params;
  const callerRole = await getRole(portfolioId, callerIdentity);
  if (callerRole !== "owner") {
    return NextResponse.json({ error: "Only the owner can remove members." }, { status: 403 });
  }

  if (targetIdentity === callerIdentity) {
    return NextResponse.json({ error: "The owner cannot remove themselves." }, { status: 400 });
  }

  const targetRole = await getRole(portfolioId, targetIdentity);
  if (targetRole === "owner") {
    return NextResponse.json({ error: "An owner cannot be removed." }, { status: 400 });
  }

  await removeMember(portfolioId, targetIdentity);
  return NextResponse.json({ ok: true });
}
