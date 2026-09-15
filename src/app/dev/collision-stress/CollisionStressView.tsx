"use client";

// Dev-only collision QA route. Renders the engineered
// collision-stress-roadmap fixture (see
// src/components/timeline/__fixtures__/collision-stress-roadmap.ts) with
// delta annotations forced on, so every text-collision category is visible
// on one screen without hunting for it in the real demo data:
//   - dense tiered milestone-label collisions (label-layout.ts, resolved)
//   - a delta-ghost badge landing on a title (resolved in wayframe#47 —
//     tiered fold-in + generalized drag-to-reposition-with-connector —
//     unified under t23's single DeltaGhostMarker primitive)
//   - reference-line chips overlapping each other (reference-line-layout.ts,
//     resolved in wayframe#51 — tiered layout + drag-to-reposition)
//
// A standing tool, not a throwaway prototype route: kept around for
// spotting future label/collision regressions at a glance.
import { useState } from "react";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { THEME_LIST } from "@/components/timeline/theme";
import { collisionStressRoadmap, collisionStressToday } from "@/components/timeline/__fixtures__/collision-stress-roadmap";

export function CollisionStressView() {
  const [themeIndex, setThemeIndex] = useState(0);
  const [deltaAnnotationsEnabled, setDeltaAnnotationsEnabled] = useState(true);
  const theme = THEME_LIST[themeIndex];

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px] space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <h1 className="text-base font-semibold">Collision stress view</h1>
          <button className="rounded border px-2 py-1" onClick={() => setThemeIndex((i) => (i + 1) % THEME_LIST.length)}>
            Theme: {theme.name}
          </button>
          <button className="rounded border px-2 py-1" onClick={() => setDeltaAnnotationsEnabled((v) => !v)}>
            Delta annotations: {deltaAnnotationsEnabled ? "on" : "off"}
          </button>
        </div>
        <RoadmapTimeline data={collisionStressRoadmap} today={collisionStressToday} theme={theme} deltaAnnotationsEnabled={deltaAnnotationsEnabled} />
      </div>
    </div>
  );
}
