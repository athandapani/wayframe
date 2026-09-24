import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth/auth";
import { validatePortfolioDocument } from "@/lib/document-file/schema";
import { createPortfolioWithOwner, setPortfolioContent } from "@/lib/db/portfolios";
import { createProgramFromData } from "@/lib/db/program-storage";

/**
 * wayframe#140: bring an exported roadmap FILE into a hosted Roadmap, with
 * every Program it holds — the front door a multi-Program export previously
 * had no way through.
 *
 * Deliberately close to `portfolios/migrate-local`, which already does the
 * same Portfolio-plus-N-Programs write, with two differences that are the
 * whole reason this is its own route rather than a flag on that one:
 *
 *  - **No ownership gate.** migrate-local is idempotent *by identity*
 *    (`getOwnedPortfolioId` short-circuits it) because it models a
 *    once-per-person event: the local `wayframe:document` becoming that
 *    person's first hosted Roadmap. Importing a file is the opposite — a
 *    deliberate, repeatable act, and someone who already owns Roadmaps is
 *    exactly who does it. Sharing one route would mean either breaking
 *    migrate-local's idempotency or refusing every import from an existing
 *    account, which is the bug this ticket exists to fix.
 *  - **Fresh Program ids.** `programs.id` is a PRIMARY KEY across the whole
 *    table, not scoped per Portfolio, so a file exported from another
 *    account (or re-imported twice) can collide with rows that already
 *    exist — `createProgramFromData`'s INSERT would fail partway through,
 *    leaving a half-imported Roadmap. Nothing inside a Program's document
 *    references its own Program id (lane/milestone/top-level ids are all
 *    Program-local and travel unchanged), so re-minting is free of
 *    referential consequences. The Portfolio id is minted for the same
 *    reason, and every Program's `portfolioId` is re-pointed at it.
 *
 * Always creates a NEW Roadmap. Merging a file's Programs into a Roadmap
 * that already has some is explicitly out of scope (#140) — it raises
 * ordering and id-collision questions this doesn't have to answer.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body isn't valid JSON." }, { status: 400 });
  }

  // The same pipeline file-open and localStorage rehydration go through, so
  // an imported file is held to exactly the standard an opened one is —
  // including the migration ladder, which means an older export imports
  // without the caller having to upgrade it first.
  const result = validatePortfolioDocument(raw);
  if (!result.ok) return NextResponse.json({ error: result.message, issues: result.issues }, { status: 400 });
  const { document } = result;

  const portfolioId = crypto.randomUUID();
  await createPortfolioWithOwner(portfolioId, identity);
  await setPortfolioContent(portfolioId, {
    schemaVersion: document.portfolio.schemaVersion,
    companyLogo: document.portfolio.companyLogo,
    legendCategories: document.portfolio.legendCategories,
    theme: document.portfolio.theme,
    scenarios: document.portfolio.scenarios,
  });

  // `order` is rewritten to the file's own array order rather than trusted
  // from each Program's stored value: a file assembled by hand (or by an
  // exporter that never had to keep them contiguous) can carry duplicate or
  // gapped orders, which would render as an arbitrary band sequence.
  for (const [index, program] of document.programs.entries()) {
    await createProgramFromData({ ...program, id: nanoid(), portfolioId, order: index });
  }

  return NextResponse.json({ id: portfolioId, programCount: document.programs.length });
}
