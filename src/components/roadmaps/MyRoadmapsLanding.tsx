"use client";

// wayframe#123: the real "My Roadmaps" landing page — every Roadmap the
// signed-in identity has a role on, owner-first, plus "+ New Roadmap".
// Layout is #122's resolved prototype verdict (Option C: sidebar list with
// an All/Owned/Shared filter + a detail pane for the selected Roadmap),
// folded in against real data from GET/POST /api/roadmaps. Replaces the
// old hard-coded "Open my hosted Portfolio" link entirely for a signed-in
// visitor — see page.tsx.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WayframeLogo } from "@/components/brand/WayframeLogo";
import type { RoadmapSummary } from "@/app/api/roadmaps/route";

type Role = RoadmapSummary["role"];
type Filter = "all" | "owner" | "shared";

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };
const ROLE_BADGE_CLASS: Record<Role, string> = {
  owner: "bg-violet-100 text-violet-700",
  editor: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-600",
};

function formatRelative(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

type LoadState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; roadmaps: RoadmapSummary[] };

export function MyRoadmapsLanding() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/roadmaps")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", error: body?.error ?? "Couldn't load your Roadmaps." });
          return;
        }
        const roadmaps = body.roadmaps as RoadmapSummary[];
        setState({ status: "ready", roadmaps });
        setSelectedId((prev) => prev ?? roadmaps[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", error: "Couldn't load your Roadmaps." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleNew() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/roadmaps", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(body?.error ?? "Couldn't create a new Roadmap.");
        return;
      }
      router.push(`/p/${body.id}`);
    } catch {
      setCreateError("Couldn't create a new Roadmap.");
    } finally {
      setCreating(false);
    }
  }

  if (state.status === "loading") return null;

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-sm text-gray-700">
        <p>{state.error}</p>
      </div>
    );
  }

  const roadmaps = state.roadmaps;
  const visible = roadmaps.filter((r) => {
    if (filter === "all") return true;
    if (filter === "owner") return r.role === "owner";
    return r.role !== "owner";
  });
  const selected = roadmaps.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-4">
          <WayframeLogo accent="#7c3aed" caption="My Roadmaps" />
        </div>

        <div className="flex gap-1 border-b border-zinc-200 px-3 py-2">
          {(["all", "owner", "shared"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                filter === f ? "bg-violet-100 text-violet-700" : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {f === "all" ? "All" : f === "owner" ? "Owned" : "Shared"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleNew}
          disabled={creating}
          className="mx-3 mt-3 flex items-center justify-center gap-1 rounded-md border border-dashed border-zinc-300 py-2 text-sm text-zinc-500 hover:border-violet-400 hover:text-violet-600 disabled:opacity-50"
        >
          <span className="text-base leading-none">+</span> {creating ? "Creating…" : "New Roadmap"}
        </button>
        {createError && <p className="mx-3 mt-2 text-xs text-red-600">{createError}</p>}

        <nav className="mt-2 flex-1 overflow-y-auto px-2 pb-4">
          {visible.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={`mt-1 flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left ${
                r.id === selectedId ? "bg-violet-50" : "hover:bg-zinc-50"
              }`}
            >
              <span className="truncate text-sm font-medium text-zinc-900">{r.title}</span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className={`rounded-full px-1.5 py-0.5 font-medium ${ROLE_BADGE_CLASS[r.role]}`}>{ROLE_LABEL[r.role]}</span>
                {formatRelative(r.updatedAt, now)}
              </span>
            </button>
          ))}
          {visible.length === 0 && roadmaps.length > 0 && (
            <p className="px-2.5 py-2 text-xs text-zinc-400">No Roadmaps in this filter.</p>
          )}
          {roadmaps.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-zinc-400">No Roadmaps yet — create one to get started.</p>
          )}
        </nav>
      </aside>

      <main className="flex-1 px-8 py-8">
        {selected ? (
          <div className="mx-auto max-w-xl">
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-xl font-semibold text-zinc-900">{selected.title}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASS[selected.role]}`}>
                {ROLE_LABEL[selected.role]}
              </span>
            </div>
            <p className="mb-6 text-sm text-zinc-500">Updated {formatRelative(selected.updatedAt, now)}</p>

            <dl className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm">
              <div>
                <dt className="text-zinc-400">Programs</dt>
                <dd className="text-lg font-medium text-zinc-900">{selected.programCount}</dd>
              </div>
              <div>
                <dt className="text-zinc-400">Members</dt>
                <dd className="text-lg font-medium text-zinc-900">{selected.memberCount}</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => router.push(`/p/${selected.id}`)}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
            >
              Open Roadmap &rarr;
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Select a Roadmap from the list, or create a new one.</p>
        )}
      </main>
    </div>
  );
}
