import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getPortfolioContent, getRole } from "@/lib/db/portfolios";
import { decodeProgramSnapshot, listProgramSnapshotsForPortfolio } from "@/lib/db/program-storage";

/**
 * wayframe#t26's data endpoint for the read-only All-Programs merged view
 * (`/p/[portfolioId]/all`). A one-shot REST snapshot read, same shape as
 * `/view`'s own (see that route's doc) — this route does NOT call
 * mergeProgramsForAllView/mergeForRender itself; it hands back every decoded
 * Program as-is and lets the page do the merge (src/lib/portfolio/merge-programs.ts).
 *
 * Deliberate scope cut vs. `/view`: NO share-token/guest support here. A
 * read-only aggregate across every Program in a Portfolio is comparatively
 * low-value to expose to a guest holding just a share link, and wiring that
 * in brings real complexity (which Program(s) a given share link's role
 * should even apply to, across N Programs) for that low value — so this
 * route only ever resolves access via a signed-in member's own role
 * (`getRole`). A guest/share-link visitor is simply not a supported audience
 * for this page.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params;
  const session = await auth();
  const identity = session?.user?.id;

  const role = identity ? await getRole(portfolioId, identity) : null;

  if (!role) {
    if (!session) {
      return NextResponse.json({ error: "Sign in to view every Program in this Roadmap." }, { status: 401 });
    }
    return NextResponse.json({ error: "No access to this Roadmap." }, { status: 403 });
  }

  const content = await getPortfolioContent(portfolioId);
  if (!content) {
    return NextResponse.json({ error: "Roadmap not found." }, { status: 404 });
  }

  const snapshots = await listProgramSnapshotsForPortfolio(portfolioId);
  if (snapshots.length === 0) {
    return NextResponse.json({ error: "This Roadmap has no Program yet." }, { status: 404 });
  }

  // Unlike /view (which 500s if its single Program fails to decode), a
  // corrupt/never-compacted Program here shouldn't take down the merged
  // view for every other Program in the Portfolio — skip it and keep going.
  const programs = snapshots.map((row) => decodeProgramSnapshot(row.snapshot)).filter((p) => p !== null);
  if (programs.length === 0) {
    return NextResponse.json({ error: "This Roadmap's Program data is unreadable." }, { status: 500 });
  }

  return NextResponse.json({ role, portfolio: content, programs });
}
