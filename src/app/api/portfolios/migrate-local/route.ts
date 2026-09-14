import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { validatePortfolioDocument } from "@/lib/document-file/schema";
import { createPortfolioWithOwner, getOwnedPortfolioId, setPortfolioContent } from "@/lib/db/portfolios";
import { createProgramFromData } from "@/lib/db/program-storage";

/**
 * wayframe#t17's "triggered at first sign-in, with the signed-in identity
 * becoming owner" migration trigger — the server half of
 * src/lib/auth/use-migrate-local-portfolio.ts's client hook, which POSTs the
 * caller's local `wayframe:document` PortfolioDocument here the first time
 * it sees an authenticated session.
 *
 * Idempotent by identity, not by request: getOwnedPortfolioId is the real
 * correctness guarantee (the client's own `wayframe:portfolio-migrated`
 * localStorage flag is just an optimization to skip the network call, since
 * it's per-browser and not trustworthy alone — a second browser signing in
 * with the same identity must land on the same Portfolio, not create a
 * second one).
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

  const result = validatePortfolioDocument(raw);
  if (!result.ok) return NextResponse.json({ error: result.message, issues: result.issues }, { status: 400 });
  const { document } = result;

  const existing = await getOwnedPortfolioId(identity);
  if (existing) return NextResponse.json({ portfolioId: existing, migrated: false });

  const portfolioId = crypto.randomUUID();
  await createPortfolioWithOwner(portfolioId, identity);
  await setPortfolioContent(portfolioId, {
    schemaVersion: document.portfolio.schemaVersion,
    companyLogo: document.portfolio.companyLogo,
    legendCategories: document.portfolio.legendCategories,
    theme: document.portfolio.theme,
    scenarios: document.portfolio.scenarios,
  });
  for (const program of document.programs) {
    await createProgramFromData({ ...program, portfolioId });
  }

  return NextResponse.json({ portfolioId, migrated: true });
}
