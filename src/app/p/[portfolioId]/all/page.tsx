"use client";

// The combined multi-Program editor route (wayframe#126).
//
// This route has been the All-Programs *viewer* since t26: a one-shot REST
// read rendered read-only, with three mutations bolted on around the edges
// over time (a Program-vs-Program reorder in t32, a cross-Program bulk edit
// in t33 via a REST bulk-patch route, "+ New Program" in the 2026-09-18 UX
// pass) but no way to edit anything *inside* a Program from here at all.
// #126 replaces that with the real thing: every Program's Yjs room connected
// live, the merged canvas fully editable, and the cross-Program move
// primitive (#124) wired to the controls #125's Variant B resolution put in
// the rail and the inspector.
//
// What stays REST here, and why: this page's fetch (role + Portfolio +
// Programs) is still a one-shot read, because the room connections need a
// Program list before they can exist, and role is a server-side fact. The
// Program-vs-Program reorder also stays REST — `Program.order` is a
// Portfolio-level fact about sibling Programs, owned by no single Program's
// doc (see the reorder route), so a refetch after it succeeds is the honest
// way to pick it up. Everything *inside* a Program now goes through that
// Program's own live box instead.
//
// One deliberate removal: t33's cross-Program selection toolbar posted the
// merged selection to `/api/portfolios/[id]/programs/bulk-patch`. That route
// writes correctly (it appends a real Yjs update), but a connected room
// holds its own in-memory doc and would not see the write until a reload —
// so on a live surface the edit would appear to do nothing. The same bulk
// edit now runs through the live boxes (`buildMergedBulkEdit`), which reach
// the very documents the canvas is rendering. The route itself is left in
// place; nothing in the app calls it any more.
//
// Scope unchanged from t26: signed-in Portfolio members only. Share-link
// guests have never been able to reach this route, and #126 doesn't widen
// that — every room here would need a per-Program share-token grant, which
// the share-link model doesn't currently mint.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Portfolio, Program } from "@/components/timeline/types";
import { AuthControls } from "@/components/auth/AuthControls";
import { CombinedProgramEditor } from "@/components/workspace/combined/CombinedProgramEditor";
import { ALL_PROGRAMS, ProgramsPicker } from "@/components/workspace/ProgramsPicker";
import type { RoomAccess } from "@/lib/realtime/provider";

interface AllProgramsSuccess {
  role: "owner" | "editor" | "viewer";
  portfolio: Portfolio;
  programs: Program[];
}

type FetchState = { status: "idle" | "loading" } | { status: "success"; data: AllProgramsSuccess } | { status: "error"; error: string };

type FetchOutcome = { ok: true; data: AllProgramsSuccess } | { ok: false; error: string };

/**
 * Pure fetch — deliberately does NOT call setState itself, so both the
 * mount effect and the post-reorder refresh can share this one function
 * without either of them calling a state-setting function *through* an
 * effect (that shape trips react-hooks/set-state-in-effect even when the
 * actual setState call is behind an `await`) — each caller sets its own
 * `result` state directly and inline instead, mirroring the single-Program
 * landing page's own fetch effect shape exactly.
 */
async function fetchAllProgramsData(portfolioId: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(`/api/portfolios/${portfolioId}/all-programs`);
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.error ?? "Something went wrong loading this Roadmap." };
    return { ok: true, data: { role: body.role, portfolio: { ...body.portfolio, id: portfolioId }, programs: body.programs } };
  } catch {
    return { ok: false, error: "Something went wrong loading this Roadmap." };
  }
}

export default function AllProgramsPage() {
  const params = useParams<{ portfolioId: string }>();
  const portfolioId = params.portfolioId;
  const { data: session, status } = useSession();
  const [today] = useState(() => new Date());

  const [result, setResult] = useState<FetchState>({ status: "idle" });
  // Per-Program inline error from a failed reorder (this page has no
  // existing toast/error-banner mechanism for in-page actions — a minimal
  // inline message on the failing rail card is the smallest thing that
  // works, not new UI infrastructure).
  const [reorderErrors, setReorderErrors] = useState<Record<string, string>>({});
  const [newProgramOpen, setNewProgramOpen] = useState(false);
  const [newProgramName, setNewProgramName] = useState("");
  const [creatingProgram, setCreatingProgram] = useState(false);
  const [newProgramError, setNewProgramError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    try {
      setResult({ status: "loading" });
    } finally {
      // Mirrors the single-Program landing page's own fetch effect (see
      // src/app/p/[portfolioId]/page.tsx) — the try/finally shape keeps
      // this a "sync external state on mount/dependency change" effect
      // rather than a flagged cascading-render one.
    }
    fetchAllProgramsData(portfolioId).then((outcome) => {
      if (cancelled) return;
      setResult(outcome.ok ? { status: "success", data: outcome.data } : { status: "error", error: outcome.error });
    });
    return () => {
      cancelled = true;
    };
  }, [status, portfolioId]);

  async function handleMoveProgram(programId: string, direction: "up" | "down") {
    setReorderErrors((prev) => {
      const next = { ...prev };
      delete next[programId];
      return next;
    });
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/programs/${programId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setReorderErrors((prev) => ({ ...prev, [programId]: body?.error ?? `Couldn't reorder (${res.status}).` }));
        return;
      }
      // {ok:true, moved:false} at a boundary — nothing to refetch, and not an error either.
      if (body?.moved) {
        const outcome = await fetchAllProgramsData(portfolioId);
        setResult(outcome.ok ? { status: "success", data: outcome.data } : { status: "error", error: outcome.error });
      }
    } catch {
      setReorderErrors((prev) => ({ ...prev, [programId]: "Something went wrong reordering this Program." }));
    }
  }

  /**
   * "+ New Program" (wayframe UX-2026-09-18 §7) — reuses the existing
   * extract route with an empty-but-schema-complete document rather than
   * a new backend endpoint (its own doc comment already describes this as
   * a legitimate bulk seed, the same pattern the AI-extraction "Add as a
   * new Program" checkbox already uses). Every `Program` field the route's
   * `...(programFields as unknown as Program)` spread does NOT get from
   * the request body needs a real value here — that cast bypasses
   * structural checking, so an omitted required field would land as a
   * literal `undefined` a downstream reader (BlufCallout, etc.) isn't
   * guarded against, not a caught error.
   *
   * Unlike the read-only version of this page, a successful create no
   * longer navigates away to the single-Program editor: the new Program
   * appears in the rail with its own live room, and its lanes can be built
   * right here, which is the whole point of #126.
   */
  async function handleCreateProgram(name: string) {
    setCreatingProgram(true);
    setNewProgramError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/programs/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: {
            programName: name,
            generatedAt: new Date().toISOString(),
            owner: session?.user?.name ?? session?.user?.email ?? "",
            bluf: { statement: "", bullets: [] },
            actionItems: [],
            swimlanes: [],
            topLevelItems: [],
            milestones: [],
          },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNewProgramError(body?.error ?? `Couldn't create this Program (${res.status}).`);
        return;
      }
      const outcome = await fetchAllProgramsData(portfolioId);
      setResult(outcome.ok ? { status: "success", data: outcome.data } : { status: "error", error: outcome.error });
      setNewProgramOpen(false);
      setNewProgramName("");
    } catch {
      setNewProgramError("Something went wrong creating this Program.");
    } finally {
      setCreatingProgram(false);
    }
  }

  // One room-access factory for every Program — each room mints its own
  // short-lived token from `/api/rooms/[programId]/token`, exactly as the
  // single-Program page does; only the id varies.
  const roomAccess = useCallback((programId: string): RoomAccess => ({ token: () => fetch(`/api/rooms/${programId}/token`).then((r) => r.json()).then((b) => b.token) }), []);

  if (status === "loading") return null;

  if (status === "unauthenticated") {
    return (
      <>
        <AuthControls />
        <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-sm text-gray-700">
          <p>Sign in to view every Program in this Roadmap.</p>
        </div>
      </>
    );
  }

  if (result.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-sm text-gray-700">
        <p>{result.error}</p>
      </div>
    );
  }

  if (result.status === "success") {
    const canEdit = result.data.role === "owner" || result.data.role === "editor";

    return (
      <>
        <CombinedProgramEditor
          portfolio={result.data.portfolio}
          programs={result.data.programs}
          today={today}
          canEdit={canEdit}
          roomAccess={roomAccess}
          identity={{
            name: session?.user?.name ?? session?.user?.email ?? "Signed-in user",
            identityKey: session?.user?.email ?? session?.user?.id ?? "",
          }}
          realtimeEnabled={status === "authenticated" && Boolean(session?.user)}
          onReorderProgram={canEdit ? handleMoveProgram : undefined}
          reorderErrors={reorderErrors}
          // The account chip and the Programs picker both live in this
          // surface's own top strip now (#149/#144). The picker replaces the
          // old "← Back to Roadmap" link, which went to a single Program —
          // this route IS the Roadmap (#150).
          accountSlot={<AuthControls variant="avatar" />}
          navigationSlot={
            <ProgramsPicker
              portfolioId={portfolioId}
              programs={result.data.programs.map((p) => ({ id: p.id, name: p.programName }))}
              selected={ALL_PROGRAMS}
            />
          }
          railFooter={
            canEdit ? (
              <div className="p-3">
                {!newProgramOpen ? (
                  <button onClick={() => setNewProgramOpen(true)} className="rounded border border-dashed border-zinc-300 px-2 py-1.5 text-xs text-zinc-500 dark:border-zinc-700">
                    + New Program
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newProgramName.trim()) handleCreateProgram(newProgramName.trim());
                    }}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <input
                      autoFocus
                      value={newProgramName}
                      onChange={(e) => setNewProgramName(e.target.value)}
                      placeholder="Program name"
                      aria-label="New Program name"
                      disabled={creatingProgram}
                      className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
                    />
                    <button
                      type="submit"
                      disabled={creatingProgram || !newProgramName.trim()}
                      className="rounded-full border border-blue-500 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 disabled:opacity-50"
                    >
                      {creatingProgram ? "Creating…" : "Create"}
                    </button>
                    <button
                      type="button"
                      disabled={creatingProgram}
                      onClick={() => {
                        setNewProgramOpen(false);
                        setNewProgramName("");
                        setNewProgramError(null);
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </form>
                )}
                {newProgramError && <p className="mt-1 text-[11px] text-red-600">{newProgramError}</p>}
              </div>
            ) : null
          }
        />
      </>
    );
  }

  return null;
}
