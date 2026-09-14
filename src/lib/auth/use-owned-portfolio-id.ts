"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

/**
 * wayframe#t35: the signed-in user's owned Portfolio id, if any — lets
 * ImportPanel's AI-extraction tab offer "add as a new Program in my
 * Portfolio" only when one genuinely exists to target. Null covers both
 * "not signed in" and "signed in but owns no Portfolio yet" (e.g. never had
 * local content to migrate, per t17's migrate-local trigger) — both cases
 * correctly hide the toggle rather than erroring.
 */
export function useOwnedPortfolioId(): string | null {
  const { status } = useSession();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/portfolios/mine")
      .then((res) => res.json())
      .then((body: { portfolioId: string | null }) => {
        if (!cancelled) setPortfolioId(body.portfolioId);
      })
      .catch(() => {
        if (!cancelled) setPortfolioId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Derived, not reset in the effect above: a stale fetched id from a prior
  // signed-in session must never leak into the "not authenticated" case.
  return status === "authenticated" ? portfolioId : null;
}
