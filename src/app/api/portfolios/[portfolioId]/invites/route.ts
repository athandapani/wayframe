import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { createInvite, getRole, type ShareRole } from "@/lib/db/portfolios";
import { sendInviteEmail } from "@/lib/email/send-invite-email";

function isShareRole(value: unknown): value is ShareRole {
  return value === "editor" || value === "viewer";
}

/**
 * wayframe#t37: owner sends an email invite. The pending invite row is
 * written first and is durable regardless of what happens next — email
 * delivery is attempted after, and a delivery failure is reported back
 * (`emailSent: false`) rather than rolled back or swallowed, so the owner
 * can still share the Portfolio's link out-of-band.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId } = await params;
  const role = await getRole(portfolioId, identity);
  if (role !== "owner") {
    return NextResponse.json({ error: "Only the owner can invite collaborators." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rawEmail = body?.email;
  const rawRole = body?.role;
  if (typeof rawEmail !== "string" || !rawEmail.trim() || !rawEmail.includes("@")) {
    return NextResponse.json({ error: "Request body must include a valid { email }." }, { status: 400 });
  }
  if (!isShareRole(rawRole)) {
    return NextResponse.json({ error: "Request body must include { role: \"editor\" | \"viewer\" }." }, { status: 400 });
  }

  const email = rawEmail.trim().toLowerCase();
  await createInvite(portfolioId, email, rawRole);

  const inviteUrl = `${req.nextUrl.origin}/p/${portfolioId}`;
  let emailSent = true;
  try {
    await sendInviteEmail(email, inviteUrl, rawRole);
  } catch (err) {
    console.error("Wayframe: invite email delivery failed", err);
    emailSent = false;
  }

  return NextResponse.json({ email, role: rawRole, emailSent });
}
