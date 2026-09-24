import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getPortfolioContent, getRole, resolveShareLink, type Role, type ShareRole } from "@/lib/db/portfolios";
import { decodeProgramSnapshot, listProgramSnapshotsForPortfolio } from "@/lib/db/program-storage";

/**
 * wayframe#t37: the landing page's one data endpoint (`/p/[portfolioId]`,
 * built by a companion frontend fork). A one-shot REST snapshot read, not
 * live Yjs sync — connectProgramRoom/the realtime bridge stays out of
 * scope for this route.
 *
 * Auth precedence: a real signed-in member's own role always wins over a
 * `shareToken` query param, even if one is present — a member browsing via
 * a stale/copied share link still gets their own (possibly higher) role,
 * never the link's. The token is only consulted when the signed-in
 * identity (if any) has no role of its own on this Portfolio.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params;
  const session = await auth();
  const identity = session?.user?.id;

  let role: Role | ShareRole | null = null;

  if (identity) {
    role = await getRole(portfolioId, identity);
  }

  if (!role) {
    const shareToken = req.nextUrl.searchParams.get("shareToken");
    if (shareToken) {
      const resolved = await resolveShareLink(shareToken);
      if (resolved && resolved.portfolioId !== portfolioId) {
        return NextResponse.json({ error: "This share link does not grant access to this Roadmap." }, { status: 403 });
      }
      if (resolved) role = resolved.role;
    }
  }

  if (!role) {
    if (!session) {
      return NextResponse.json({ error: "Sign in or use a share link to view this Roadmap." }, { status: 401 });
    }
    return NextResponse.json({ error: "No access to this Roadmap." }, { status: 403 });
  }

  const content = await getPortfolioContent(portfolioId);
  if (!content) {
    return NextResponse.json({ error: "Roadmap not found." }, { status: 404 });
  }

  const snapshots = await listProgramSnapshotsForPortfolio(portfolioId);
  if (snapshots.length === 0) {
    // `role` included (wayframe#123) so the client can decide whether to
    // offer "add your first Program" (owner/editor) or just a plain "this
    // Roadmap is empty" message (viewer) — a share-link guest's role is a
    // ShareRole, never "owner", so they always get the plain message too.
    return NextResponse.json({ error: "This Roadmap has no Program yet.", role }, { status: 404 });
  }

  // Optional ?programId= (wayframe UX-2026-09-18 §7) — a Portfolio's 2nd+
  // Program used to be unopenable for editing at all: this route always
  // read `snapshots[0]`, hardcoded, and `/p/[portfolioId]` had no
  // programId segment to pass one through. Falls back to `snapshots[0]`
  // when omitted, so every existing caller (the landing page's default
  // "open this Portfolio" link) keeps working byte-for-byte unchanged.
  const requestedProgramId = req.nextUrl.searchParams.get("programId");
  const row = requestedProgramId ? snapshots.find((s) => s.id === requestedProgramId) : snapshots[0];
  if (!row) {
    return NextResponse.json({ error: `No Program "${requestedProgramId}" in this Roadmap.` }, { status: 404 });
  }

  const program = decodeProgramSnapshot(row.snapshot);
  if (!program) {
    return NextResponse.json({ error: "This Roadmap's Program data is unreadable." }, { status: 500 });
  }

  // Every sibling Program's id + name (wayframe#144) — what the Programs
  // picker needs to offer the rest of the Roadmap from this page. Decoded
  // from snapshots this route has already read, rather than a second
  // round-trip: `programs` here is deliberately a NAME LIST, not documents
  // (that's what /all-programs is for). A snapshot that won't decode is
  // skipped rather than failing the whole read — the page it feeds is a
  // picker, and one unreadable sibling shouldn't take down a Program that
  // reads fine.
  const siblings = snapshots
    .map((s) => {
      const decoded = s.id === row.id ? program : decodeProgramSnapshot(s.snapshot);
      return decoded ? { id: s.id, programName: decoded.programName, order: decoded.order ?? 0 } : null;
    })
    .filter((p): p is { id: string; programName: string; order: number } => p !== null)
    .sort((a, b) => a.order - b.order);

  return NextResponse.json({ role, portfolio: content, program, programs: siblings });
}
