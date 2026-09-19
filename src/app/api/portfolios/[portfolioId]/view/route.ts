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
        return NextResponse.json({ error: "This share link does not grant access to this Portfolio." }, { status: 403 });
      }
      if (resolved) role = resolved.role;
    }
  }

  if (!role) {
    if (!session) {
      return NextResponse.json({ error: "Sign in or use a share link to view this Portfolio." }, { status: 401 });
    }
    return NextResponse.json({ error: "No access to this Portfolio." }, { status: 403 });
  }

  const content = await getPortfolioContent(portfolioId);
  if (!content) {
    return NextResponse.json({ error: "Portfolio not found." }, { status: 404 });
  }

  const snapshots = await listProgramSnapshotsForPortfolio(portfolioId);
  if (snapshots.length === 0) {
    return NextResponse.json({ error: "This Portfolio has no Program yet." }, { status: 404 });
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
    return NextResponse.json({ error: `No Program "${requestedProgramId}" in this Portfolio.` }, { status: 404 });
  }

  const program = decodeProgramSnapshot(row.snapshot);
  if (!program) {
    return NextResponse.json({ error: "This Portfolio's Program data is unreadable." }, { status: 500 });
  }

  return NextResponse.json({ role, portfolio: content, program });
}
