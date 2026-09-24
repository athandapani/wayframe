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
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { nanoid } from "nanoid";
import type { Portfolio, PortfolioDocument, Program } from "@/components/timeline/types";
import { RoadmapWorkspace } from "@/components/workspace/RoadmapWorkspace";
import { EntryForm } from "@/components/entry-form/EntryForm";
import { AuthControls } from "@/components/auth/AuthControls";
import { ProgramsPicker } from "@/components/workspace/ProgramsPicker";
import { GuestNamePrompt } from "./GuestNamePrompt";
import type { RoomAccess } from "@/lib/realtime/provider";
import type { ProgramRoomIdentity } from "@/lib/realtime/use-program-room";

type MemberRole = "owner" | "editor" | "viewer";

interface ViewSuccess {
  role: MemberRole;
  portfolio: Portfolio;
  program: Program;
  /** Every Program in this Roadmap, id + name only (wayframe#144) — what the Programs picker offers. Absent from an older response body, which the picker reads as "nothing to choose between". */
  programs?: { id: string; programName: string }[];
}

/**
 * wayframe#123: a brand-new "+ New Roadmap" Portfolio has no Program yet —
 * /view 404s with { error, role }. An owner/editor sees this inline
 * EntryForm instead of the plain error text below; a viewer (or a
 * share-link guest, whose role is never "owner"/"editor" here) still gets
 * the plain message, since they have nothing to create.
 *
 * Reshapes EntryForm's wrapped PortfolioDocument (portfolio + programs[0])
 * back into the flat { ...programFields, legendCategories } shape
 * /api/portfolios/[id]/programs/extract expects — the same shape
 * /api/extract's raw response has before EntryForm's own wrapExtractedDocument
 * redistributes it, so newly-invented legend categories still reach
 * appendLegendCategories instead of silently being dropped.
 */
function EmptyPortfolioEntry({ portfolioId, onCreated }: { portfolioId: string; onCreated: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handleExtracted(document: PortfolioDocument) {
    setError(null);
    const flatDocument = { ...document.programs[0], legendCategories: document.portfolio.legendCategories };
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/programs/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: flatDocument }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Couldn't create the first Program.");
        return;
      }
      onCreated();
    } catch {
      setError("Couldn't create the first Program.");
    }
  }

  return (
    <>
      {error && (
        <div className="fixed top-2 left-1/2 z-50 -translate-x-1/2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700 shadow-sm">
          {error}
        </div>
      )}
      <EntryForm onExtracted={handleExtracted} />
    </>
  );
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

type FetchState =
  | { status: "idle" | "loading" }
  | { status: "success"; data: ViewSuccess }
  | { status: "error"; error: string; role?: MemberRole };

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
  // Bumped after EmptyPortfolioEntry successfully creates the first Program
  // (wayframe#123), to re-run the /view fetch below without duplicating its
  // fetch logic in a separate callback.
  const [refetchNonce, setRefetchNonce] = useState(0);

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
          setResult({ status: "error", error: body.error ?? "Something went wrong loading this Roadmap.", role: body.role });
          return;
        }
        setResult({
          status: "success",
          data: { role: body.role, portfolio: { ...body.portfolio, id: portfolioId }, program: body.program, programs: body.programs },
        });
      })
      .catch(() => {
        if (!cancelled) setResult({ status: "error", error: "Something went wrong loading this Roadmap." });
      });
    return () => {
      cancelled = true;
    };
  }, [shareCheck.checked, shareCheck.token, shareCheck.programId, status, acceptInvitesDone, guestIdentity.checked, guestIdentity.identity, portfolioId, refetchNonce]);

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
          <p>Sign in with the Google account this Roadmap was shared with to view it.</p>
        </div>
      </>
    );
  }

  if (status === "unauthenticated" && shareCheck.token && guestIdentity.checked && !guestIdentity.identity) {
    return <GuestNamePrompt onSubmit={handleGuestNameSubmit} />;
  }

  if (result.status === "error") {
    const canAddFirstProgram =
      result.error === "This Roadmap has no Program yet." && (result.role === "owner" || result.role === "editor");
    if (canAddFirstProgram) {
      return (
        <>
          <AuthControls />
          <EmptyPortfolioEntry portfolioId={portfolioId} onCreated={() => setRefetchNonce((n) => n + 1)} />
        </>
      );
    }
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
        {/* t26's "View all Programs" link is gone (wayframe#150): it framed
            the combined canvas as a special mode of this page, when a
            Roadmap is the container and this page is one Program inside it.
            The Programs picker in the top strip says that instead — and it
            names where it goes, which the link never did. */}
        <RoadmapWorkspace
          initialData={result.data.program}
          initialPortfolio={result.data.portfolio}
          today={today}
          persist={false}
          canManageSharing={result.data.role === "owner"}
          realtime={realtime}
          // Inside the workspace's own top strip (wayframe#149) rather than a
          // fourth `fixed` island in the same corner, which is what made
          // "Updated … · Syncing…" overlap it.
          accountSlot={<AuthControls variant="inline" />}
          // The Roadmap's own Program picker (wayframe#144), beside the
          // Executive/Program toggle. Renders nothing for a single-Program
          // Roadmap, which is why it can be passed unconditionally.
          navigationSlot={
            <ProgramsPicker
              portfolioId={portfolioId}
              programs={(result.data.programs ?? []).map((p) => ({ id: p.id, name: p.programName }))}
              selected={result.data.program.id}
            />
          }
        />
      </>
    );
  }

  return null;
}
