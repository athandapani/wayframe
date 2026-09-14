import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth/auth";
import { appendLegendCategories, getRole } from "@/lib/db/portfolios";
import { createProgramFromData, listProgramSnapshotsForPortfolio } from "@/lib/db/program-storage";
import type { LegendCategory, Milestone, Program } from "@/components/timeline/types";

/**
 * wayframe#t35: the "apply" half of extraction targeting an existing
 * Portfolio's brand-new Program. /api/extract itself stays portfolio-
 * unaware (still just produces one Program's worth of content) — this is
 * the new write target a client calls next, instead of ImportPanel's
 * existing "replace whatever's currently open in memory" AI-extraction
 * path, which is untouched.
 *
 * A brand-new Program row is a legitimate bulk seed (no prior content, no
 * concurrent editor, no undo history to clobber) — same reasoning t17's
 * migrate-local route already uses for createProgramFromData. The one place
 * this genuinely touches live shared Portfolio state is legendCategories:
 * newly-invented ones are merged in additively (appendLegendCategories),
 * never a wholesale overwrite, so they can't stomp categories another
 * Program already references.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { portfolioId } = await params;
  const role = await getRole(portfolioId, identity);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "No edit access to this Portfolio." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const raw = body?.document;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Request body must be { document: <extracted document> }." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { schemaVersion: _schemaVersion, legendCategories, ...programFields } = raw as Record<string, unknown> & {
    legendCategories?: LegendCategory[];
  };

  const idRemap = legendCategories?.length ? await appendLegendCategories(portfolioId, legendCategories) : new Map<string, string>();

  const milestones = ((programFields.milestones as Milestone[] | undefined) ?? []).map((m) =>
    m.categoryId ? { ...m, categoryId: idRemap.get(m.categoryId) ?? m.categoryId } : m,
  );

  // Non-atomic "next order" heuristic — same single-writer assumption
  // t12's own storage primitives already make everywhere else in this file.
  const order = (await listProgramSnapshotsForPortfolio(portfolioId)).length;

  const program: Program = {
    ...(programFields as unknown as Program),
    milestones,
    id: nanoid(),
    portfolioId,
    order,
  };

  await createProgramFromData(program);
  return NextResponse.json({ programId: program.id });
}
