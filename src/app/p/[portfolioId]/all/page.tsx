"use client";

// The read-only All-Programs merged view (wayframe t26) — a one-shot REST
// snapshot read of GET /api/portfolios/[portfolioId]/all-programs, mirroring
// the single-Program landing page's own fetch shape but much simpler: no
// guest/share-link/realtime branch to handle at all.
//
// Deliberate scope cut: editing is out of scope for this ticket, and so is
// share-link/guest access (see the route's own comment for why) — this page
// is scoped to signed-in Portfolio members only (owner/editor/viewer role
// via getRole), and prompts sign-in otherwise. No mutation callbacks get
// wired into RoadmapTimeline below, same "omit on* props to keep it
// non-interactive" convention this component already uses for its
// off-screen export capture.
//
// wayframe t32 adds one section and one real mutation on top of that
// otherwise-still-read-only shape: a browsable Outline tree across every
// Program (src/lib/outline-tree/tree.ts's buildMultiProgramOutlineTree —
// deliberately NOT merge-programs.ts's id-namespaced merge, since this is
// read-only browsing, never fed into mergeForRender), and a real
// Program-vs-Program reorder (the already-built
// POST .../programs/[programId]/reorder route) gated to owner/editor —
// still no structural mutation *within* any one Program from this page,
// matching t26's original "no mutation callbacks wired in" cut.
//
// wayframe t33 (fork 3) adds the first structural mutation *within*
// Programs from this page: a "Select mode" toggle wires real
// selectionModeEnabled/selectedIds/onToggleSelect/onMarqueeSelect into the
// merged RoadmapTimeline canvas below (mirrors RoadmapWorkspace.tsx's own
// selectMode/useSelection pattern), and CrossProgramSelectionToolbar
// (src/components/workspace/CrossProgramSelectionToolbar.tsx) turns that
// selection into a real cross-Program bulk edit via the new
// POST .../programs/bulk-patch route — still gated to owner/editor like the
// reorder mutation above it. The Outline section itself remains completely
// untouched (still read-only, still not selectable — wrong data shape for
// this, see buildMultiProgramOutlineTree's own doc).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Portfolio, Program } from "@/components/timeline/types";
import { mergeForRender } from "@/components/timeline/types";
import { mergeProgramsForAllView } from "@/lib/portfolio/merge-programs";
import { resolvePortfolioTheme, defaultPortfolioTheme } from "@/components/timeline/theme";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { ChartLegend } from "@/components/timeline/ChartLegend";
import { AuthControls } from "@/components/auth/AuthControls";
import { buildMultiProgramOutlineTree, isLeafKind, type OutlineNode } from "@/lib/outline-tree/tree";
import { PortfolioRollupBar } from "@/components/executive-view/PortfolioRollupBar";
import { useSelection } from "@/components/timeline/use-selection";
import { CrossProgramSelectionToolbar } from "@/components/workspace/CrossProgramSelectionToolbar";
// PROTOTYPE wiring — throwaway, wayframe#125. Dev-only: `next dev` serves
// the combined multi-Program editor prototype (?variant=a|b|c) on this
// route in place of the real read-only merged view below, with mock
// Programs and no auth. Production build and the vitest run are untouched.
import { CombinedEditorPrototype } from "./_prototype-combined-editor";

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
    if (!res.ok) return { ok: false, error: body.error ?? "Something went wrong loading this Portfolio." };
    return { ok: true, data: { role: body.role, portfolio: { ...body.portfolio, id: portfolioId }, programs: body.programs } };
  } catch {
    return { ok: false, error: "Something went wrong loading this Portfolio." };
  }
}

const KIND_LABEL: Record<OutlineNode["kind"], string> = {
  program: "prog",
  "program-band": "band",
  group: "grp",
  lane: "lane",
  row: "row",
  milestone: "mile",
  phase: "phase",
  annotation: "note",
};

/** Read-only outline row — no reorder/reparent/hide/collapse/select controls on Group/Lane/leaf nodes at all (t26's own "no mutation callbacks wired in" cut, still true for everything except a Program root's own ▲/▼ and, since wayframe UX-2026-09-18 §7, its "Open" link). */
function OutlineRow({
  node,
  isProgramRoot,
  portfolioId,
  canReorderPrograms,
  onMoveProgram,
  reorderError,
}: {
  node: OutlineNode;
  isProgramRoot: boolean;
  /** Only needed for a Program root's own "Open" link — every other row is display-only. */
  portfolioId: string;
  canReorderPrograms: boolean;
  onMoveProgram?: (programId: string, direction: "up" | "down") => void;
  reorderError?: string;
}) {
  const isLeaf = isLeafKind(node.kind);
  return (
    <li>
      <div className="flex flex-wrap items-center gap-1.5 py-0.5 text-xs" style={{ paddingLeft: `${node.depth * 1.1}rem` }}>
        <span className="shrink-0 rounded bg-gray-100 px-1 text-[10px] uppercase tracking-wide text-gray-600">{KIND_LABEL[node.kind]}</span>
        <span className={"min-w-0 flex-1 truncate" + (isLeaf ? " text-gray-800" : " font-medium text-gray-900")} style={{ textDecoration: node.hidden ? "line-through" : undefined }}>
          {node.label}
        </span>
        {/* Open for editing (wayframe UX-2026-09-18 §7) — before this, a
            Portfolio's 2nd+ Program could only ever be viewed here,
            read-only/merged; this is the one place that can open it for
            real editing at all, since /p/[portfolioId] previously had no
            way to address anything but the first Program. */}
        {isProgramRoot && (
          <Link href={`/p/${portfolioId}?programId=${encodeURIComponent(node.id)}`} className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] text-blue-600 hover:underline">
            Open
          </Link>
        )}
        {isProgramRoot && canReorderPrograms && onMoveProgram && (
          <span className="flex shrink-0 gap-0.5">
            <button onClick={() => onMoveProgram(node.id, "up")} aria-label={`Move ${node.label} up`} className="rounded border px-1.5 py-0.5 text-[11px] text-gray-600 hover:text-gray-900">
              ▲
            </button>
            <button onClick={() => onMoveProgram(node.id, "down")} aria-label={`Move ${node.label} down`} className="rounded border px-1.5 py-0.5 text-[11px] text-gray-600 hover:text-gray-900">
              ▼
            </button>
          </span>
        )}
        {isProgramRoot && reorderError && <span className="w-full text-[11px] text-red-600">{reorderError}</span>}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OutlineRow key={child.id} node={child} isProgramRoot={false} portfolioId={portfolioId} canReorderPrograms={canReorderPrograms} onMoveProgram={onMoveProgram} reorderError={undefined} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function AllProgramsPage() {
  if (process.env.NODE_ENV === "development") {
    return <CombinedEditorPrototype />;
  }

  return <RealAllProgramsPage />;
}

function RealAllProgramsPage() {
  const params = useParams<{ portfolioId: string }>();
  const portfolioId = params.portfolioId;
  const { data: session, status } = useSession();
  const router = useRouter();
  const [today] = useState(() => new Date());

  const [result, setResult] = useState<FetchState>({ status: "idle" });
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [outlineOpen, setOutlineOpen] = useState(false);
  // Per-Program inline error from a failed reorder (this page has no
  // existing toast/error-banner mechanism for in-page actions — a minimal
  // inline text message near the failing button is the smallest thing that
  // works, not new UI infrastructure).
  const [reorderErrors, setReorderErrors] = useState<Record<string, string>>({});
  // Cross-Program bulk edit (wayframe#t33, fork 3) — mirrors
  // RoadmapWorkspace.tsx's own selectMode/useSelection pattern exactly,
  // just at the merged-canvas level: `selection` holds namespaced ids
  // (mergeProgramsForAllView already namespaces every Milestone/
  // TopLevelItem id, so this "just works" with no extra namespacing code
  // here). Gated behind `canReorderPrograms` below — a viewer shouldn't see
  // an edit toolbar they have no permission to apply.
  const selection = useSelection();
  const [selectMode, setSelectMode] = useState(false);
  // "+ New Program" (wayframe UX-2026-09-18 §7) — there was previously no
  // blank/empty-Program creation path at all, only import-only ones buried
  // in Options → Data → Import, none of them labeled "Program." Mirrors
  // handleMoveProgram's own inline-error-state pattern; the small inline
  // name form is this page's existing minimal-inline-UI convention (see
  // the reorder error message right above it), not a new modal.
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
      // Straight into editing the new (empty) Program — the whole point of
      // this button was "I can't find where to add one," so landing them
      // on an empty merged view they'd have to hunt an Open link inside is
      // the same discoverability problem one layer down.
      router.push(`/p/${portfolioId}?programId=${encodeURIComponent(body.programId)}`);
    } catch {
      setNewProgramError("Something went wrong creating this Program.");
    } finally {
      setCreatingProgram(false);
    }
  }

  /**
   * Refetch-after-success for the cross-Program bulk-edit toolbar — the
   * exact same pattern `handleMoveProgram` already uses after a successful
   * reorder. Deliberately does NOT locally re-derive/optimistically patch
   * `result.data.programs` (see CrossProgramSelectionToolbar.tsx's own doc
   * and the reorder route's own comment for why trusting a client-side
   * recompute over the server's freshly-recomputed truth is the wrong
   * tradeoff here).
   */
  async function refetchAfterBulkApply() {
    const outcome = await fetchAllProgramsData(portfolioId);
    setResult(outcome.ok ? { status: "success", data: outcome.data } : { status: "error", error: outcome.error });
  }

  if (status === "loading") return null;

  if (status === "unauthenticated") {
    return (
      <>
        <AuthControls />
        <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-sm text-gray-700">
          <p>Sign in to view every Program in this Portfolio.</p>
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
    const merged = mergeProgramsForAllView(portfolioId, result.data.programs);
    const renderable = mergeForRender(result.data.portfolio, merged);
    const theme = resolvePortfolioTheme(result.data.portfolio.theme ?? defaultPortfolioTheme);
    // Program-vs-Program reorder (t32) — mirrors how other role-gated UI in
    // this repo checks role (e.g. RoadmapWorkspace's canManageSharing), just
    // widened to "editor" too since the reorder route itself accepts either.
    const canReorderPrograms = result.data.role === "owner" || result.data.role === "editor";
    const outlineRoots = buildMultiProgramOutlineTree(result.data.programs, result.data.portfolio);

    function handleToggleGroupCollapsed(groupId: string) {
      setCollapsedGroupIds((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        return next;
      });
    }

    // Client-only, unpersisted collapse state (see this page's own doc
    // comment above) — never sent anywhere, never affects any real
    // document. RoadmapTimeline reads a group's collapsed state off
    // `data.swimlaneGroups[].collapsed`, so this is applied by overlaying
    // that viewer-local set onto the merged (already-namespaced) groups
    // rather than by mutating any persisted field. `collapsedGroupIds`
    // holds ids this viewer has FLIPPED from the document's own persisted
    // `collapsed` value — XORing against it (rather than forcing `true`)
    // lets a viewer expand a group the document itself persisted collapsed,
    // not just collapse an expanded one.
    const dataWithLocalCollapse = {
      ...renderable,
      swimlaneGroups: (renderable.swimlaneGroups ?? []).map((g) =>
        collapsedGroupIds.has(g.id) ? { ...g, collapsed: !g.collapsed } : g,
      ),
    };

    return (
      <>
        <AuthControls />
        <div className="relative mx-auto max-w-[1600px] p-8 pt-16" style={{ background: theme.ground }}>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <Link href={`/p/${portfolioId}`} className="text-blue-600 hover:underline">
              &larr; Back to Portfolio
            </Link>
            <span className="font-semibold text-gray-800">All Programs</span>
            {canReorderPrograms && (
              <button
                onClick={() => setSelectMode((v) => !v)}
                aria-pressed={selectMode}
                aria-label={`Select mode: ${selectMode ? "On" : "Off"}`}
                className={"rounded-full border px-2.5 py-1 text-xs " + (selectMode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-500")}
              >
                Select mode: {selectMode ? "On" : "Off"}
              </button>
            )}
            {canReorderPrograms && !newProgramOpen && (
              <button
                onClick={() => setNewProgramOpen(true)}
                className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:text-gray-900"
              >
                + New Program
              </button>
            )}
            {canReorderPrograms && newProgramOpen && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newProgramName.trim()) handleCreateProgram(newProgramName.trim());
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  autoFocus
                  value={newProgramName}
                  onChange={(e) => setNewProgramName(e.target.value)}
                  placeholder="Program name"
                  aria-label="New Program name"
                  disabled={creatingProgram}
                  className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
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
                  className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
                >
                  Cancel
                </button>
              </form>
            )}
            {newProgramError && <span className="text-xs text-red-600">{newProgramError}</span>}
          </div>

          <PortfolioRollupBar programs={result.data.programs} today={today} />

          <div className="mb-4 rounded-lg border border-gray-200 bg-white">
            <button
              onClick={() => setOutlineOpen((v) => !v)}
              aria-expanded={outlineOpen}
              className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-gray-800"
            >
              <span>Outline{outlineOpen ? "" : ` (${outlineRoots.length} Program${outlineRoots.length === 1 ? "" : "s"})`}</span>
              <span aria-hidden="true">{outlineOpen ? "▾" : "▸"}</span>
            </button>
            {outlineOpen && (
              <ul className="border-t border-gray-100 px-4 py-2">
                {outlineRoots.map((root) => (
                  <OutlineRow
                    key={root.id}
                    node={root}
                    isProgramRoot={true}
                    portfolioId={portfolioId}
                    canReorderPrograms={canReorderPrograms}
                    onMoveProgram={handleMoveProgram}
                    reorderError={reorderErrors[root.id]}
                  />
                ))}
              </ul>
            )}
          </div>

          <RoadmapTimeline
            data={dataWithLocalCollapse}
            today={today}
            theme={theme}
            onToggleGroupCollapsed={handleToggleGroupCollapsed}
            selectionModeEnabled={canReorderPrograms && selectMode}
            selectedIds={selection.selectedIds}
            onToggleSelect={selection.toggle}
            onMarqueeSelect={selection.addAll}
          />
          {canReorderPrograms && selectMode && (
            <CrossProgramSelectionToolbar
              portfolioId={portfolioId}
              programs={result.data.programs}
              selection={selection}
              onApplied={refetchAfterBulkApply}
            />
          )}
          {renderable.legendCategories && renderable.legendCategories.length > 0 && (
            <ChartLegend
              theme={theme}
              criticalPathStyle="solid"
              showCriticalPath={true}
              deltaAnnotationsEnabled={false}
              tracing={false}
              hasDurations={renderable.milestones.some((m) => !!m.endDate)}
              categories={renderable.legendCategories}
            />
          )}
        </div>
      </>
    );
  }

  return null;
}
