// Dev-only visual QA page for RoadmapTimeline — not part of the product
// nav. Renders the same fixture the unit tests use. Gated so it can't ship
// to production even if this route survives a merge.
"use client";

import { useState } from "react";
import { notFound, useSearchParams, useRouter } from "next/navigation";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { defaultTheme } from "@/components/timeline/theme";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";
import { ZoomControls, PrototypeSwitcher, useZoomState, zoomVariantComponent } from "./zoom-variants";

// ?zoom=a|b|c (wayframe#84 prototype, throwaway) switches this page into the
// zoom-mechanism comparison instead of the default static QA view.
function ZoomPrototypePage({ variantKey, onChange }: { variantKey: string; onChange: (k: string) => void }) {
  const zoom = useZoomState();
  const Variant = zoomVariantComponent(variantKey);
  return (
    <div className="min-h-screen bg-zinc-50 p-8 pb-24 dark:bg-black">
      <div className="mx-auto max-w-[1400px]">
        <h1 className="mb-1 text-lg font-semibold">Zoom mechanism prototype (wayframe#84)</h1>
        <p className="mb-3 text-xs text-zinc-500">Throwaway — see prototype/zoom-mechanism-84 branch.</p>
        <ZoomControls state={zoom} />
        <Variant window={zoom.window} />
      </div>
      <PrototypeSwitcher current={variantKey} onChange={onChange} />
    </div>
  );
}

export default function RoadmapTimelineDevPreview() {
  const [blufOpen, setBlufOpen] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();

  if (process.env.NODE_ENV === "production") notFound();

  const zoomVariant = searchParams.get("zoom");
  if (zoomVariant) {
    return <ZoomPrototypePage variantKey={zoomVariant} onChange={(k) => router.replace(`/dev/roadmap-timeline?zoom=${k}`)} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px]">
        <BlufCallout bluf={sampleRoadmap.bluf} open={blufOpen} onOpenChange={setBlufOpen} theme={defaultTheme} />
        <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />
      </div>
    </div>
  );
}
