import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getOwnedPortfolioId } from "@/lib/db/portfolios";

/**
 * wayframe#t35: lets a signed-in client discover its own owned Portfolio id
 * (or null), to decide whether to offer "add as a new Program in my
 * Portfolio" anywhere. Returns `{portfolioId: null}` (200, not 401) when
 * unauthenticated — "no Portfolio to target" is a normal UI state here, not
 * an error.
 */
export async function GET() {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ portfolioId: null });
  const portfolioId = await getOwnedPortfolioId(identity);
  return NextResponse.json({ portfolioId });
}
