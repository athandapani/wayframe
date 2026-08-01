// Dev-only visual QA page for RoadmapTimeline — not part of the product
// nav. Renders the same fixture the unit tests use. Gated so it can't ship
// to production even if this route survives a merge.
import { notFound } from "next/navigation";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";

export default function RoadmapTimelineDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px]">
        <BlufCallout bluf={sampleRoadmap.bluf} />
        <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />
      </div>
    </div>
  );
}
