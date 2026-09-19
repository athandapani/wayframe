"use client";

// The hosted Portfolio landing route (wayframe#t37) — a one-shot REST
// snapshot read of GET /api/portfolios/[portfolioId]/view, not live Yjs
// sync (connectProgramRoom/the realtime bridge stays out of scope; editing
// here is ordinary uncommitted React state, see the banner below). Handles
// three visitor shapes: a signed-in member/owner, a signed-in stranger with
// nothing but a share link, and a signed-out guest following a share link
// (name-prompted once per Portfolio per browser session) or a signed-out
// invite-email recipient (nothing to fetch yet — just a sign-in prompt).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { nanoid } from "nanoid";
import type { Portfolio, Program } from "@/components/timeline/types";
import { RoadmapWorkspace } from "@/components/workspace/RoadmapWorkspace";
import { AuthControls } from "@/components/auth/AuthControls";
import { GuestNamePrompt } from "./GuestNamePrompt";
import type { RoomAccess } from "@/lib/realtime/provider";
import type { ProgramRoomIdentity } from "@/lib/realtime/use-program-room";

interface ViewSuccess {
  role: "owner" | "editor" | "viewer";
  portfolio: Portfolio;
  program: Program;
}

interface GuestIdentity {
  name: string;
  guestId: string;
}

function guestStorageKey(portfolioId: string): string {
  return `wayframe:guest-name:${portfolioId}`;
}

function readGuestIdentity(portfolioId: string): GuestIdentity | null {
  try {
    const raw = window.sessionStorage.getItem(guestStorageKey(portfolioId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.name === "string" && typeof parsed?.guestId === "string") return parsed as GuestIdentity;
    return null;
  } catch {
    return null;
  }
}

type FetchState = { status: "idle" | "loading" } | { status: "success"; data: ViewSuccess } | { status: "error"; error: string };

export default function PortfolioLandingPage() {
  const params = useParams<{ portfolioId: string }>();
  const portfolioId = params.portfolioId;
  const { data: session, status } = useSession();
  const [today] = useState(() => new Date());

  // Mirrors page.tsx's own "check something client-only post-mount, render
  // nothing until checked" pattern (storageCheck.checked) — avoids an
  // SSR/first-client-paint mismatch, and avoids useSearchParams' Suspense
  // boundary requirement.
  const [shareCheck, setShareCheck] = useState<{ checked: boolean; token: string | null; programId: string | null }>({ checked: false, token: null, programId: null });
  useEffect(() => {
    let token: string | null = null;
    let programId: string | null = null;
    try {
      const search = new URLSearchParams(window.location.search);
      token = search.get("share");
      // A Portfolio's 2nd+ Program (wayframe UX-2026-09-18 §7) — the
      // All-Programs page's per-Program "Open" links pass this so /view
      // knows which Program to load instead of always defaulting to the
      // first one. Omitted = today's unchanged default.
      programId = search.get("programId");
    } finally {
      setShareCheck({ checked: true, token, programId });
    }
  }, []);

  const [guestIdentity, setGuestIdentity] = useState<{ checked: boolean; identity: GuestIdentity | null }>({ checked: false, identity: null });
  useEffect(() => {
    if (!shareCheck.checked || status !== "unauthenticated" || !shareCheck.token) return;
    let identity: GuestIdentity | null = null;
    try {
      identity = readGuestIdentity(portfolioId);
    } finally {
      setGuestIdentity({ checked: true, identity });
    }
  }, [shareCheck.checked, shareCheck.token, status, portfolioId]);

  // A brand-new invite recipient has no role until accept-invites resolves
  // it — this must complete (or fail) before the /view fetch below runs.
  // Ignore its response body; /view is the real source of truth for role.
  const [acceptInvitesDone, setAcceptInvitesDone] = useState(false);
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/portfolios/accept-invites", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAcceptInvitesDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const [result, setResult] = useState<FetchState>({ status: "idle" });

  useEffect(() => {
    if (!shareCheck.checked) return;

    const authenticatedReady = status === "authenticated" && acceptInvitesDone;
    const guestReady = status === "unauthenticated" && shareCheck.token !== null && guestIdentity.checked && guestIdentity.identity !== null;
    if (!authenticatedReady && !guestReady) return;

    let cancelled = false;
    try {
      setResult({ status: "loading" });
    } finally {
      // Mirrors this file's other post-mount setState effects (see above) —
      // the try/finally shape keeps this a "sync external state on mount /
      // dependency change" effect rather than a flagged cascading-render one.
    }
    const query = new URLSearchParams();
    if (shareCheck.token) query.set("shareToken", shareCheck.token);
    if (shareCheck.programId) query.set("programId", shareCheck.programId);
    const qs = query.toString();
    const url = `/api/portfolios/${portfolioId}/view${qs ? `?${qs}` : ""}`;
    fetch(url)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setResult({ status: "error", error: body.error ?? "Something went wrong loading this Portfolio." });
          return;
        }
        setResult({
          status: "success",
          data: { role: body.role, portfolio: { ...body.portfolio, id: portfolioId }, program: body.program },
        });
      })
      .catch(() => {
        if (!cancelled) setResult({ status: "error", error: "Something went wrong loading this Portfolio." });
      });
    return () => {
      cancelled = true;
    };
  }, [shareCheck.checked, shareCheck.token, shareCheck.programId, status, acceptInvitesDone, guestIdentity.checked, guestIdentity.identity, portfolioId]);

  function handleGuestNameSubmit(name: string) {
    const identity: GuestIdentity = { name, guestId: `guest:${nanoid()}` };
    window.sessionStorage.setItem(guestStorageKey(portfolioId), JSON.stringify(identity));
    setGuestIdentity({ checked: true, identity });
  }

  if (!shareCheck.checked || status === "loading") return null;

  if (status === "unauthenticated" && !shareCheck.token) {
    return (
      <>
        <AuthControls />
        <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-sm text-gray-700">
          <p>Sign in with the Google account this Portfolio was shared with to view it.</p>
        </div>
      </>
    );
  }

  if (status === "unauthenticated" && shareCheck.token && guestIdentity.checked && !guestIdentity.identity) {
    return <GuestNamePrompt onSubmit={handleGuestNameSubmit} />;
  }

  if (result.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-sm text-gray-700">
        <p>{result.error}</p>
      </div>
    );
  }

  if (result.status === "success") {
    // Live collaborative editing (wayframe t38) — real now, so the
    // "snapshot preview" banner this route used to show unconditionally is
    // gone. `realtime` is only built once every piece it needs is actually
    // in scope: a signed-in session (token-based access) or a guest
    // identity (share-token access). The gating above this branch already
    // guarantees one of the two, but this stays defensive — RoadmapWorkspace
    // treats `realtime` as fully optional, so omitting it here is safe.
    const programId = result.data.program.id;
    const realtime: { programId: string; access: RoomAccess; identity: ProgramRoomIdentity } | undefined =
      status === "authenticated" && session?.user
        ? {
            programId,
            access: { token: () => fetch(`/api/rooms/${programId}/token`).then((r) => r.json()).then((b) => b.token) },
            identity: { name: session.user.name ?? session.user.email ?? "Signed-in user", identityKey: session.user.email ?? session.user.id ?? "" },
          }
        : shareCheck.token && guestIdentity.identity
          ? {
              programId,
              access: { shareToken: shareCheck.token },
              identity: { name: guestIdentity.identity.name, identityKey: guestIdentity.identity.guestId },
            }
          : undefined;

    return (
      <>
        <AuthControls />
        {/* wayframe t26 — unobtrusive, unconditional link to the All-Programs
            merged view. Rendered unconditionally rather than only when this
            Portfolio has more than one Program: detecting that here would
            need an extra fetch just to decide whether to show a link, and
            the /all page itself already handles the single-Program case
            gracefully (mergeProgramsForAllView works correctly for N=1). */}
        <div className="fixed top-2 left-2 z-50 rounded-md bg-white/90 px-2 py-1 text-xs shadow-sm">
          <Link href={`/p/${portfolioId}/all`} className="text-blue-600 hover:underline">
            View all Programs
          </Link>
        </div>
        <RoadmapWorkspace
          initialData={result.data.program}
          initialPortfolio={result.data.portfolio}
          today={today}
          persist={false}
          canManageSharing={result.data.role === "owner"}
          realtime={realtime}
        />
      </>
    );
  }

  return null;
}
