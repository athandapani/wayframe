"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useMigrateLocalPortfolioOnSignIn } from "@/lib/auth/use-migrate-local-portfolio";

/**
 * Deliberately minimal plumbing (wayframe#t17's own scope decision, not a
 * designed auth surface) — its only job is to make the "triggered at first
 * sign-in" local-Portfolio migration flow real and click-through-testable,
 * since the app otherwise has no way to reach an authenticated client state
 * at all. A future ticket is free to replace this with something more
 * polished.
 */
export function AuthControls() {
  useMigrateLocalPortfolioOnSignIn();
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  return (
    <div className="fixed top-2 right-2 z-50 flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-xs shadow-sm">
      {session?.user ? (
        <>
          <span className="text-gray-600">{session.user.email ?? session.user.name}</span>
          <button type="button" onClick={() => signOut()} className="text-blue-600 hover:underline">
            Sign out
          </button>
        </>
      ) : (
        <button type="button" onClick={() => signIn("google")} className="text-blue-600 hover:underline">
          Sign in with Google
        </button>
      )}
    </div>
  );
}
