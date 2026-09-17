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
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Portfolio, Program } from "@/components/timeline/types";
import { mergeForRender } from "@/components/timeline/types";
import { mergeProgramsForAllView } from "@/lib/portfolio/merge-programs";
import { resolvePortfolioTheme, defaultPortfolioTheme } from "@/components/timeline/theme";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { ChartLegend } from "@/components/timeline/ChartLegend";
import { AuthControls } from "@/components/auth/AuthControls";
import { buildMultiProgramOutlineTree, isLeafKind, type OutlineNode } from "@/lib/outline-tree/tree";

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
  group: "grp",
  lane: "lane",
  row: "row",
  milestone: "mile",
  phase: "phase",
  annotation: "note",
};

/** Read-only outline row — no reorder/reparent/hide/collapse/select controls on Group/Lane/leaf nodes at all (t26's own "no mutation callbacks wired in" cut, still true for everything except a Program root's own ▲/▼). */
function OutlineRow({
  node,
  isProgramRoot,
  canReorderPrograms,
  onMoveProgram,
  reorderError,
}: {
  node: OutlineNode;
  isProgramRoot: boolean;
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
            <OutlineRow key={child.id} node={child} isProgramRoot={false} canReorderPrograms={canReorderPrograms} onMoveProgram={onMoveProgram} reorderError={undefined} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function AllProgramsPage() {
  const params = useParams<{ portfolioId: string }>();
  const portfolioId = params.portfolioId;
  const { status } = useSession();
  const [today] = useState(() => new Date());

  const [result, setResult] = useState<FetchState>({ status: "idle" });
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [outlineOpen, setOutlineOpen] = useState(false);
  // Per-Program inline error from a failed reorder (this page has no
  // existing toast/error-banner mechanism for in-page actions — a minimal
  // inline text message near the failing button is the smallest thing that
  // works, not new UI infrastructure).
  const [reorderErrors, setReorderErrors] = useState<Record<string, string>>({});

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
          <div className="mb-4 text-sm text-gray-600">
            <Link href={`/p/${portfolioId}`} className="text-blue-600 hover:underline">
              &larr; Back to Portfolio
            </Link>
            <span className="ml-2 font-semibold text-gray-800">All Programs</span>
          </div>

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
                    canReorderPrograms={canReorderPrograms}
                    onMoveProgram={handleMoveProgram}
                    reorderError={reorderErrors[root.id]}
                  />
                ))}
              </ul>
            )}
          </div>

          <RoadmapTimeline data={dataWithLocalCollapse} today={today} theme={theme} onToggleGroupCollapsed={handleToggleGroupCollapsed} />
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
