// Dev-only visual QA page for RoadmapTimeline — not part of the product
// nav. Renders the same fixture the unit tests use. Gated so it can't ship
// to production even if this route survives a merge.
"use client";

import { Suspense, useState } from "react";
import { notFound } from "next/navigation";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { defaultTheme } from "@/components/timeline/theme";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";
import { AxisHierarchyPrototype } from "./axis-hierarchy/AxisHierarchyPrototype";

export default function RoadmapTimelineDevPreview() {
  const [blufOpen, setBlufOpen] = useState(true);

  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px]">
        <BlufCallout bluf={sampleRoadmap.bluf} open={blufOpen} onOpenChange={setBlufOpen} theme={defaultTheme} />
        <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />
        <Suspense fallback={null}>
          <AxisHierarchyPrototype />
        </Suspense>
      </div>
    </div>
  );
}
