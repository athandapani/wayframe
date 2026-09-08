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
import { PresenceSwitcher, presenceVariantComponent } from "./presence-variants";

// ?presence=a|b|c (wayframe#112 prototype, throwaway) switches this page
// into the presence-UX comparison instead of the default static QA view.
function PresencePrototypePage({ variantKey, onChange }: { variantKey: string; onChange: (k: string) => void }) {
  const Variant = presenceVariantComponent(variantKey);
  return (
    <div className="min-h-screen bg-zinc-50 p-8 pb-24 dark:bg-black">
      <div className="mx-auto max-w-[1400px]">
        <h1 className="mb-1 text-lg font-semibold">Presence UX prototype (wayframe#112)</h1>
        <p className="mb-3 text-xs text-zinc-500">Throwaway — see prototype/presence-ux-112 branch. Two fake peers, simulated cursor/selection state.</p>
        <Variant />
      </div>
      <PresenceSwitcher current={variantKey} onChange={onChange} />
    </div>
  );
}

export default function RoadmapTimelineDevPreview() {
  const [blufOpen, setBlufOpen] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();

  if (process.env.NODE_ENV === "production") notFound();

  const presenceVariant = searchParams.get("presence");
  if (presenceVariant) {
    return <PresencePrototypePage variantKey={presenceVariant} onChange={(k) => router.replace(`/dev/roadmap-timeline?presence=${k}`)} />;
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
