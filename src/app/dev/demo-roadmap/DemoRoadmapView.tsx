"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { demoRoadmap, demoToday } from "@/data/demo-roadmap";
import { CorrectionBoxPrototype } from "./_prototype-correction-box";

function DemoRoadmapViewInner() {
  const searchParams = useSearchParams();
  if (searchParams.has("correction-box")) return <CorrectionBoxPrototype />;

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px]">
        <BlufCallout bluf={demoRoadmap.bluf} />
        <RoadmapTimeline data={demoRoadmap} today={demoToday} width={1600} />
      </div>
    </div>
  );
}

export function DemoRoadmapView() {
  return (
    <Suspense fallback={null}>
      <DemoRoadmapViewInner />
    </Suspense>
  );
}
