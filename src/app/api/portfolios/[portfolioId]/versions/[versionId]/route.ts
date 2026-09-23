import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getRole } from "@/lib/db/portfolios";
import { getVersion, renameVersion } from "@/lib/db/versions";

/**
 * wayframe#128: read one Version's full Program documents (any member — this
 * is what the History dock fetches to swap the canvas over to), or rename it
 * (owner/editor).
 *
 * PATCH reaches the `label` column and nothing else. A Version's captured
 * content is immutable, so there is deliberately no way to edit it here — and
 * no DELETE at all, matching the Snapshot routes' append-only posture.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ portfolioId: string; versionId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId, versionId } = await params;
  const role = await getRole(portfolioId, identity);
  if (!role) {
    return NextResponse.json({ error: "No access to this Roadmap." }, { status: 403 });
  }

  const version = await getVersion(portfolioId, versionId);
  if (!version) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  return NextResponse.json({ version });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ portfolioId: string; versionId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId, versionId } = await params;
  const role = await getRole(portfolioId, identity);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "No edit access to this Roadmap." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (body === null || !("label" in body) || (typeof body.label !== "string" && body.label !== null)) {
    return NextResponse.json({ error: "Request body must be { label: string | null }." }, { status: 400 });
  }
  // An empty/whitespace-only name clears the label rather than storing a blank
  // one, so the row falls back to its saved-at time instead of rendering as an
  // untitled gap in the list.
  const trimmed = typeof body.label === "string" ? body.label.trim() : "";
  const renamed = await renameVersion(portfolioId, versionId, trimmed === "" ? null : trimmed);
  if (!renamed) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
