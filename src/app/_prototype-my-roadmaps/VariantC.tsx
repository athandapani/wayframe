"use client";

// PROTOTYPE — throwaway. Variant C: master-detail — a compact sidebar list
// (with an All/Owned/Shared filter) plus a detail pane for the selected
// Roadmap. Most different from A/B: primary affordance is "select then
// open" rather than "click a row/card to go straight there," and "+ New
// Roadmap" lives inline in the list rather than as a page-level button.
// wayframe#122.
import { useMemo, useState } from "react";
import { WayframeLogo } from "@/components/brand/WayframeLogo";
import {
  INITIAL_ROADMAPS,
  ROLE_BADGE_CLASS,
  ROLE_LABEL,
  formatRelative,
  makeNewRoadmap,
  sortRoadmaps,
  type MockRoadmap,
} from "./shared";

type Filter = "all" | "owner" | "shared";

export function VariantC() {
  const [roadmaps, setRoadmaps] = useState<MockRoadmap[]>(INITIAL_ROADMAPS);
  const [filter, setFilter] = useState<Filter>("all");
  const now = new Date();
  const sorted = sortRoadmaps(roadmaps);
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);

  const visible = useMemo(
    () =>
      sorted.filter((r) => {
        if (filter === "all") return true;
        if (filter === "owner") return r.role === "owner";
        return r.role !== "owner";
      }),
    [sorted, filter],
  );

  const selected = roadmaps.find((r) => r.id === selectedId) ?? null;

  const handleNew = () => {
    const created = makeNewRoadmap(now);
    setRoadmaps((prev) => [created, ...prev]);
    setSelectedId(created.id);
    setFilter("all");
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
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
          className="mx-3 mt-3 flex items-center justify-center gap-1 rounded-md border border-dashed border-zinc-300 py-2 text-sm text-zinc-500 hover:border-violet-400 hover:text-violet-600"
        >
          <span className="text-base leading-none">+</span> New Roadmap
        </button>

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
                <span className={`rounded-full px-1.5 py-0.5 font-medium ${ROLE_BADGE_CLASS[r.role]}`}>
                  {ROLE_LABEL[r.role]}
                </span>
                {formatRelative(r.updatedAt, now)}
              </span>
            </button>
          ))}
          {visible.length === 0 && <p className="px-2.5 py-2 text-xs text-zinc-400">No Roadmaps in this filter.</p>}
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
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
            >
              Open Roadmap &rarr;
            </button>
            <p className="mt-2 text-xs text-zinc-400">
              Would navigate to <code>/p/{selected.id}</code> (stubbed — no real routing in this prototype).
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Select a Roadmap from the list.</p>
        )}
      </main>
    </div>
  );
}
