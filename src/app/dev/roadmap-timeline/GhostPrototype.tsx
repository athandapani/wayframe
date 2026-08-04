// PROTOTYPE — wayframe#29. Variant switcher for the ghost-rendering
// exploration. Delete alongside RoadmapTimelineGhostPrototype.tsx and
// prototype-ghost-fixture.ts once a variant wins and gets folded in.
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { RoadmapTimelineGhostPrototype, type GhostVariant } from "./RoadmapTimelineGhostPrototype";
import { prototypeGhostRoadmap } from "./prototype-ghost-fixture";

const VARIANTS: { key: GhostVariant; label: string }[] = [
  { key: "A", label: "A — faded ghost + dotted connector" },
  { key: "B", label: "B — dashed outline, no connector" },
  { key: "C", label: "C — slip badge, no mark at old date" },
];

export function GhostPrototype() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("variant");
  const idx = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === requested),
  );
  const current = VARIANTS[idx];

  function go(delta: number) {
    const next = VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length];
    router.replace(`?variant=${next.key}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="min-h-screen bg-zinc-50 p-8 pb-24 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px]">
        <BlufCallout bluf={prototypeGhostRoadmap.bluf} />
        <RoadmapTimelineGhostPrototype data={prototypeGhostRoadmap} today={new Date("2026-01-20T00:00:00Z")} ghostVariant={current.key} />
      </div>

      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border-2 border-fuchsia-500 bg-white px-4 py-2 text-sm font-mono shadow-lg dark:bg-zinc-900">
        <button onClick={() => go(-1)} aria-label="Previous variant" className="px-1 text-lg">
          ←
        </button>
        <span className="font-semibold">{current.label}</span>
        <button onClick={() => go(1)} aria-label="Next variant" className="px-1 text-lg">
          →
        </button>
      </div>
    </div>
  );
}
