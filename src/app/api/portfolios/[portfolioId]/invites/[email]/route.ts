import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { deleteInvite, getRole } from "@/lib/db/portfolios";

/** wayframe#t37: owner cancels a pending invite. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ portfolioId: string; email: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId, email: rawEmail } = await params;
  const role = await getRole(portfolioId, identity);
  if (role !== "owner") {
    return NextResponse.json({ error: "Only the owner can cancel invites." }, { status: 403 });
  }

  const email = decodeURIComponent(rawEmail).trim().toLowerCase();
  await deleteInvite(portfolioId, email);
  return NextResponse.json({ ok: true });
}
