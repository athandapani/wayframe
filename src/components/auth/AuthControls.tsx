"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useMigrateLocalPortfolioOnSignIn } from "@/lib/auth/use-migrate-local-portfolio";
import { useAcceptInvitesOnSignIn } from "@/lib/auth/use-accept-invites";
import { Popover } from "@/components/workspace/Popover";

/**
 * Deliberately minimal plumbing (wayframe#t17's own scope decision, not a
 * designed auth surface) — its only job is to make the "triggered at first
 * sign-in" local-Portfolio migration flow real and click-through-testable,
 * since the app otherwise has no way to reach an authenticated client state
 * at all.
 *
 * Three variants, because a full email address plus a "Sign out" link is the
 * single widest thing in the top strip and it earns none of that room:
 *
 *  - `fixed` — the standalone screens (sign-in, error, empty Roadmap) that
 *    have no strip to sit in. Positions itself, as it always did.
 *  - `inline` — a caller that owns the layout (wayframe#149) places it.
 *  - `avatar` — the top strip (wayframe#144 feedback): an initials chip, with
 *    the address and Sign out behind it. One round icon instead of ~200px of
 *    text a reader already knows.
 */
export function AuthControls({ variant = "fixed" }: { variant?: "fixed" | "inline" | "avatar" } = {}) {
  useMigrateLocalPortfolioOnSignIn();
  useAcceptInvitesOnSignIn();
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (variant === "avatar" && session?.user) {
    const who = session.user.email ?? session.user.name ?? "";
    return (
      <Popover
        label={`Account: ${who}`}
        trigger={initialsFor(session.user.name, session.user.email)}
        triggerClassName="flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold shadow"
        panelClassName="w-56"
      >
        <p className="truncate text-xs opacity-70">{who}</p>
        <button
          type="button"
          onClick={() => signOut()}
          className="w-full rounded-full border px-3 py-1.5 text-xs"
          style={{ borderColor: "var(--wf-border)" }}
        >
          Sign out
        </button>
      </Popover>
    );
  }

  return (
    <div
      className={
        // "inline"/"avatar" hand this chip to a caller that owns the top
        // strip's layout — it must not also position itself, or it goes
        // straight back to overlapping whatever shares that corner.
        (variant === "fixed" ? "fixed top-2 right-2 z-50 " : "") + "flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-xs shadow-sm"
      }
    >
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

/** "Arun Thandapani" -> "AT"; "athandapani@gmail.com" -> "AT". Two characters, upper case, never empty. */
export function initialsFor(name?: string | null, email?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2).toUpperCase();
  const local = (email ?? "").split("@")[0];
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return (local || "?").slice(0, 2).toUpperCase();
}
