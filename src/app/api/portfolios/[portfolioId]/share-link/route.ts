import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { createShareLink, getRole, getShareLink, revokeShareLink, setShareLinkRole, type ShareRole } from "@/lib/db/portfolios";

function isShareRole(value: unknown): value is ShareRole {
  return value === "editor" || value === "viewer";
}

async function requireOwner(portfolioId: string): Promise<{ error: NextResponse } | { identity: string }> {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const role = await getRole(portfolioId, identity);
  if (role !== "owner") {
    return { error: NextResponse.json({ error: "Only the owner can manage the share link." }, { status: 403 }) };
  }
  return { identity };
}

/** wayframe#t37: creates the Portfolio's public link, or regenerates it (invalidating the old token) if one already exists. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params;
  const ownerCheck = await requireOwner(portfolioId);
  if ("error" in ownerCheck) return ownerCheck.error;

  const body = await req.json().catch(() => null);
  const rawRole = body?.role;
  if (!isShareRole(rawRole)) {
    return NextResponse.json({ error: "Request body must include { role: \"editor\" | \"viewer\" }." }, { status: 400 });
  }

  const token = await createShareLink(portfolioId, rawRole);
  return NextResponse.json({ token, role: rawRole });
}

/** wayframe#t37: changes the role an existing link grants, without changing its token. 409 if no link exists yet. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params;
  const ownerCheck = await requireOwner(portfolioId);
  if ("error" in ownerCheck) return ownerCheck.error;

  const body = await req.json().catch(() => null);
  const rawRole = body?.role;
  if (!isShareRole(rawRole)) {
    return NextResponse.json({ error: "Request body must include { role: \"editor\" | \"viewer\" }." }, { status: 400 });
  }

  const existing = await getShareLink(portfolioId);
  if (!existing) {
    return NextResponse.json({ error: "No share link exists yet for this Roadmap — create one first." }, { status: 409 });
  }

  await setShareLinkRole(portfolioId, rawRole);
  return NextResponse.json({ token: existing.token, role: rawRole });
}

/** wayframe#t37: revokes the Portfolio's public link entirely. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params;
  const ownerCheck = await requireOwner(portfolioId);
  if ("error" in ownerCheck) return ownerCheck.error;

  await revokeShareLink(portfolioId);
  return NextResponse.json({ ok: true });
}
