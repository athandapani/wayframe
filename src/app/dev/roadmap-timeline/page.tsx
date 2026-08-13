// Dev-only visual QA page for RoadmapTimeline — not part of the product
// nav. Renders the same fixture the unit tests use. Gated so it can't ship
// to production even if this route survives a merge.
"use client";

import { Suspense, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RoadmapTimeline, type SlipRiskVariant } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { defaultTheme } from "@/components/timeline/theme";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";

// PROTOTYPE (wayfinder#61) -- "second milestone" is already status
// "at-risk" in the fixture; projecting it 3 weeks past its committed date
// gives the three slip-risk variants a real slip to draw without touching
// the shared fixture (RoadmapTimeline.test.tsx reads the same file).
const SLIP_RISKS: Record<string, string> = { m2: "2026-03-08" };

const VARIANTS: { key: SlipRiskVariant; name: string }[] = [
  { key: "A", name: "Ghost sibling" },
  { key: "B", name: "Comet" },
  { key: "C", name: "Hazard zone" },
];

function SlipRiskSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = (searchParams.get("slipRiskVariant") as SlipRiskVariant) ?? "A";
  const index = VARIANTS.findIndex((v) => v.key === current);
  const safeIndex = index === -1 ? 0 : index;

  function go(delta: number) {
    const next = VARIANTS[(safeIndex + delta + VARIANTS.length) % VARIANTS.length];
    const params = new URLSearchParams(searchParams.toString());
    params.set("slipRiskVariant", next.key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
      <button onClick={() => go(-1)} className="px-1 text-zinc-400 hover:text-white" aria-label="Previous variant">
        ←
      </button>
      <span className="font-medium tabular-nums">
        {VARIANTS[safeIndex].key} — {VARIANTS[safeIndex].name}
      </span>
      <button onClick={() => go(1)} className="px-1 text-zinc-400 hover:text-white" aria-label="Next variant">
        →
      </button>
    </div>
  );
}

function SlipRiskVariantParam() {
  const searchParams = useSearchParams();
  return (searchParams.get("slipRiskVariant") as SlipRiskVariant) ?? "A";
}

export default function RoadmapTimelineDevPreview() {
  const [blufOpen, setBlufOpen] = useState(true);

  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px]">
        <BlufCallout bluf={sampleRoadmap.bluf} open={blufOpen} onOpenChange={setBlufOpen} theme={defaultTheme} />
        <Suspense fallback={<RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} />}>
          <RoadmapWithSlipRisk />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <SlipRiskSwitcher />
      </Suspense>
    </div>
  );
}

function RoadmapWithSlipRisk() {
  const variant = SlipRiskVariantParam();
  return (
    <RoadmapTimeline
      data={sampleRoadmap}
      today={new Date("2026-01-20T00:00:00Z")}
      slipRisks={SLIP_RISKS}
      slipRiskVariant={variant}
    />
  );
}
