// Dev-only visual QA page for the official demo dataset (wayframe issue
// #10) — not part of the product nav. Gated so it can't ship to production
// even if this route survives a merge.
import { notFound } from "next/navigation";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { demoRoadmap, demoToday } from "@/data/demo-roadmap";

export default function DemoRoadmapDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px]">
        <BlufCallout bluf={demoRoadmap.bluf} />
        <RoadmapTimeline data={demoRoadmap} today={demoToday} width={1600} />
      </div>
    </div>
  );
}
