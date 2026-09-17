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

interface AllProgramsSuccess {
  role: "owner" | "editor" | "viewer";
  portfolio: Portfolio;
  programs: Program[];
}

type FetchState = { status: "idle" | "loading" } | { status: "success"; data: AllProgramsSuccess } | { status: "error"; error: string };

export default function AllProgramsPage() {
  const params = useParams<{ portfolioId: string }>();
  const portfolioId = params.portfolioId;
  const { status } = useSession();
  const [today] = useState(() => new Date());

  const [result, setResult] = useState<FetchState>({ status: "idle" });
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());

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
    fetch(`/api/portfolios/${portfolioId}/all-programs`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setResult({ status: "error", error: body.error ?? "Something went wrong loading this Portfolio." });
          return;
        }
        setResult({
          status: "success",
          data: { role: body.role, portfolio: { ...body.portfolio, id: portfolioId }, programs: body.programs },
        });
      })
      .catch(() => {
        if (!cancelled) setResult({ status: "error", error: "Something went wrong loading this Portfolio." });
      });
    return () => {
      cancelled = true;
    };
  }, [status, portfolioId]);

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
