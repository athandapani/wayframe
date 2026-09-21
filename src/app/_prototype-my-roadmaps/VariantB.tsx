"use client";

// PROTOTYPE — throwaway. Variant B: card grid, split into "Owned by you" /
// "Shared with you" sections rather than one flat sorted list — the
// owned-first requirement expressed structurally, not just by sort order.
// wayframe#122.
import { useState } from "react";
import { WayframeLogo } from "@/components/brand/WayframeLogo";
import {
  INITIAL_ROADMAPS,
  ROLE_BADGE_CLASS,
  ROLE_LABEL,
  formatRelative,
  makeNewRoadmap,
  type MockRoadmap,
} from "./shared";

function RoadmapCard({ r, now, onOpen }: { r: MockRoadmap; now: Date; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(r.id)}
      className="flex flex-col items-start gap-2 rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm hover:border-violet-300 hover:shadow-md"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="font-medium text-zinc-900">{r.title}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASS[r.role]}`}>
          {ROLE_LABEL[r.role]}
        </span>
      </div>
      <div className="text-xs text-zinc-500">
        {r.programCount} program{r.programCount === 1 ? "" : "s"} · {r.memberCount} member
        {r.memberCount === 1 ? "" : "s"}
      </div>
      <div className="text-xs text-zinc-400">Updated {formatRelative(r.updatedAt, now)}</div>
    </button>
  );
}

export function VariantB() {
  const [roadmaps, setRoadmaps] = useState<MockRoadmap[]>(INITIAL_ROADMAPS);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const now = new Date();

  const owned = roadmaps.filter((r) => r.role === "owner");
  const shared = roadmaps.filter((r) => r.role !== "owner");

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8 dark:bg-black">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <WayframeLogo accent="#7c3aed" caption="My Roadmaps" />
        </div>

        {openedId && (
          <div className="mb-4 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-800">
            Would navigate to <code>/p/{openedId}</code> (stubbed — no real routing in this prototype).
          </div>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Owned by you</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {owned.map((r) => (
              <RoadmapCard key={r.id} r={r} now={now} onOpen={setOpenedId} />
            ))}
            <button
              type="button"
              onClick={() => setRoadmaps((prev) => [makeNewRoadmap(now), ...prev])}
              className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-violet-400 hover:text-violet-600"
            >
              <span className="text-xl leading-none">+</span>
              <span className="text-sm font-medium">New Roadmap</span>
            </button>
          </div>
        </section>

        {shared.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Shared with you</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {shared.map((r) => (
                <RoadmapCard key={r.id} r={r} now={now} onOpen={setOpenedId} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
