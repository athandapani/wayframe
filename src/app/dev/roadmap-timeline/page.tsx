// Dev-only visual QA page for RoadmapTimeline — not part of the product
// nav. Renders the same fixture the unit tests use. Gated so it can't ship
// to production even if this route survives a merge.
//
// PROTOTYPE (wayframe#44) — period-boundary gridlines. Three variants,
// switchable via ?variant=off|A|B|C, plus a theme cycle button, against the
// demo dataset (multi-year — spans 2025-06 to 2027-07, crossing three
// calendar years) rather than the single-year sample fixture, since the
// year-boundary visibility problem this ticket is about only shows up on a
// wide multi-year chart. Throwaway — capture the winning variant into real
// code, then drop this switcher and gridlineVariant from RoadmapTimeline.
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { THEME_LIST } from "@/components/timeline/theme";
import { demoRoadmap, demoToday } from "@/data/demo-roadmap";

const VARIANTS = ["off", "A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];

const VARIANT_LABELS: Record<Variant, string> = {
  off: "off — no gridlines (today's baseline)",
  A: "A — faint line at every segment (month/quarter/year)",
  B: "B — heavier line at year boundaries only",
  C: "C — alternating background band per year",
};

function isVariant(v: string | null): v is Variant {
  return !!v && (VARIANTS as readonly string[]).includes(v);
}

function GridlineSwitcher({ current, onChange, themeIdx, onThemeChange }: { current: Variant; onChange: (v: Variant) => void; themeIdx: number; onThemeChange: (i: number) => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      const i = VARIANTS.indexOf(current);
      if (e.key === "ArrowLeft") onChange(VARIANTS[(i - 1 + VARIANTS.length) % VARIANTS.length]);
      if (e.key === "ArrowRight") onChange(VARIANTS[(i + 1) % VARIANTS.length]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onChange]);

  if (process.env.NODE_ENV === "production") return null;

  const i = VARIANTS.indexOf(current);
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg">
      <button onClick={() => onChange(VARIANTS[(i - 1 + VARIANTS.length) % VARIANTS.length])} aria-label="Previous variant" className="px-1 hover:opacity-70">
        ←
      </button>
      <span className="whitespace-nowrap">{VARIANT_LABELS[current]}</span>
      <button onClick={() => onChange(VARIANTS[(i + 1) % VARIANTS.length])} aria-label="Next variant" className="px-1 hover:opacity-70">
        →
      </button>
      <span className="mx-1 opacity-40">|</span>
      <button onClick={() => onThemeChange((themeIdx + 1) % THEME_LIST.length)} className="whitespace-nowrap hover:opacity-70">
        theme: {THEME_LIST[themeIdx].name}
      </button>
    </div>
  );
}

function RoadmapTimelineDevPreviewInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [blufOpen, setBlufOpen] = useState(true);
  const [themeIdx, setThemeIdx] = useState(0);

  const variant: Variant = isVariant(searchParams.get("variant")) ? (searchParams.get("variant") as Variant) : "off";

  const setVariant = useCallback(
    (v: Variant) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", v);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const theme = THEME_LIST[themeIdx];

  return (
    <div className="min-h-screen p-8" style={{ background: theme.pageBg }}>
      <div className="relative mx-auto max-w-[1600px]">
        <BlufCallout bluf={demoRoadmap.bluf} open={blufOpen} onOpenChange={setBlufOpen} theme={theme} />
        <RoadmapTimeline data={demoRoadmap} today={demoToday} theme={theme} gridlineVariant={variant} />
      </div>
      <GridlineSwitcher current={variant} onChange={setVariant} themeIdx={themeIdx} onThemeChange={setThemeIdx} />
    </div>
  );
}

export default function RoadmapTimelineDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Suspense fallback={null}>
      <RoadmapTimelineDevPreviewInner />
    </Suspense>
  );
}
