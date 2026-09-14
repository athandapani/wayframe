"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { loadPersistedDocument } from "@/components/correction-box/use-correction-box";

/**
 * wayframe#t17's "triggered at first sign-in, with the signed-in identity
 * becoming owner of a new Portfolio" migration trigger. Fires once an
 * authenticated session is observed, reads whatever's in the local
 * `wayframe:document` slot, and hands it to
 * /api/portfolios/migrate-local — a signed-in visitor with nothing local yet
 * is the common case going forward, not an error, so a missing document is a
 * silent no-op.
 *
 * Idempotency is enforced twice: this key skips the network call on every
 * sign-in after the first (a per-browser optimization only), while the
 * route's own getOwnedPortfolioId check is the real guarantee — it's what
 * stops a second browser signing in with the same identity from creating a
 * second Portfolio, since this localStorage flag can't see across browsers.
 */
const MIGRATED_KEY = "wayframe:portfolio-migrated";

export function useMigrateLocalPortfolioOnSignIn(): void {
  const { status } = useSession();
  const attempted = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (attempted.current) return;
    if (window.localStorage.getItem(MIGRATED_KEY)) return;
    attempted.current = true;

    const document = loadPersistedDocument();
    if (!document) return;

    fetch("/api/portfolios/migrate-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error("Wayframe: local Portfolio migration failed", await res.text());
          return;
        }
        const result = (await res.json()) as { portfolioId: string };
        window.localStorage.setItem(MIGRATED_KEY, result.portfolioId);
      })
      .catch((err) => {
        // Never block using the app locally over a failed migration — it
        // can retry on a future sign-in since MIGRATED_KEY was never set.
        console.error("Wayframe: local Portfolio migration failed", err);
      });
  }, [status]);
}
