"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

/**
 * wayframe#t37's background "keep pending invites resolved" hook — fires
 * once per authenticated session (a `useRef` guard against refiring on
 * every re-render while still authenticated, same shape as
 * useMigrateLocalPortfolioOnSignIn) and POSTs to
 * /api/portfolios/accept-invites. No localStorage idempotency flag is
 * needed here, unlike that hook: acceptPendingInvites is naturally
 * idempotent server-side, so a redundant call after everything's already
 * resolved is just a cheap no-op. This is the general "keep this resolved
 * everywhere in the app" background hook — the landing page
 * (`/p/[portfolioId]`) builds its own more careful sequencing separately.
 */
export function useAcceptInvitesOnSignIn(): void {
  const { status } = useSession();
  const attempted = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (attempted.current) return;
    attempted.current = true;

    fetch("/api/portfolios/accept-invites", { method: "POST" }).then(async (res) => {
      if (!res.ok) {
        console.error("Wayframe: accepting pending invites failed", await res.text());
      }
    }).catch((err) => {
      console.error("Wayframe: accepting pending invites failed", err);
    });
  }, [status]);
}
