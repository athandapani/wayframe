"use client";

// PROTOTYPE — throwaway. Answers wayframe#38 item 4: what should editing
// the "So what" (BLUF) callout look like? Three structurally different
// authoring surfaces, switchable via ?variant=, mounted over the real
// chart/theme/demo data so each one is judged in real context instead of
// in a blank-page vacuum. See README.md for the question and the eventual
// answer.
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { WayframeLogo } from "@/components/brand/WayframeLogo";
import { defaultTheme } from "@/components/timeline/theme";
import { demoRoadmap, demoToday } from "@/data/demo-roadmap";
import { PrototypeSwitcher, useVariant, type Variant } from "./PrototypeSwitcher";
import { VariantA } from "./variants/VariantA";
import { VariantB } from "./variants/VariantB";
import { VariantC } from "./variants/VariantC";

const VARIANTS: Variant[] = [
  { key: "A", name: "Type the syntax" },
  { key: "B", name: "Live rich text + toolbar" },
  { key: "C", name: "Structured modal" },
];

const theme = defaultTheme;

export function BlufEditingPrototypeView() {
  const variant = useVariant(VARIANTS);

  return (
    <div className="min-h-screen" style={{ background: theme.pageBg }}>
      <div className="fixed top-3 left-4 z-40 flex items-center gap-2">
        <WayframeLogo accent={theme.accent} caption="So-what editing — prototype" />
      </div>

      <div className="relative mx-auto max-w-[1600px] p-8 pt-16">
        <RoadmapTimeline data={demoRoadmap} today={demoToday} theme={theme} />

        {variant === "A" && <VariantA initialStatement={demoRoadmap.bluf.statement} initialBullets={demoRoadmap.bluf.bullets} theme={theme} />}
        {variant === "B" && <VariantB initialStatement={demoRoadmap.bluf.statement} initialBullets={demoRoadmap.bluf.bullets} theme={theme} />}
        {variant === "C" && <VariantC initialStatement={demoRoadmap.bluf.statement} initialBullets={demoRoadmap.bluf.bullets} theme={theme} />}
      </div>

      <PrototypeSwitcher variants={VARIANTS} />
    </div>
  );
}
