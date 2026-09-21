"use client";

// PROTOTYPE — throwaway. Variant A: one dense, sorted table. Optimized for a
// user with many Roadmaps who wants to scan and click through fast, not
// browse. wayframe#122.
import { useState } from "react";
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

export function VariantA() {
  const [roadmaps, setRoadmaps] = useState<MockRoadmap[]>(INITIAL_ROADMAPS);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const now = new Date();
  const sorted = sortRoadmaps(roadmaps);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8 dark:bg-black">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <WayframeLogo accent="#7c3aed" caption="My Roadmaps" />
          <button
            type="button"
            onClick={() => setRoadmaps((prev) => [makeNewRoadmap(now), ...prev])}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
          >
            + New Roadmap
          </button>
        </div>

        {openedId && (
          <div className="mb-3 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-800">
            Would navigate to <code>/p/{openedId}</code> (stubbed — no real routing in this prototype).
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Programs</th>
                <th className="px-4 py-2 font-medium">Members</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpenedId(r.id)}
                  className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900">{r.title}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASS[r.role]}`}>
                      {ROLE_LABEL[r.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{r.programCount}</td>
                  <td className="px-4 py-3 text-zinc-600">{r.memberCount}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatRelative(r.updatedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <p className="mt-6 text-center text-sm text-zinc-500">No Roadmaps yet — create one to get started.</p>
        )}
      </div>
    </div>
  );
}
