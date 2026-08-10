"use client";

// PROTOTYPE — throwaway. Answers the follow-up to wayframe#38 item 1: when
// the correction box can't confidently resolve a request, how should that
// moment look so it reads as a capable assistant asking a clarifying
// question, not a dead end? Today's real UX (use-correction-box.ts) is a
// flat "No milestones matched X" error with no way to act on it. This
// mounts three structurally different presentations of the same
// already-validated refuse-ambiguous resolution over the real demo chart,
// switchable via ?variant=. See README.md.
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { WayframeLogo } from "@/components/brand/WayframeLogo";
import { defaultTheme } from "@/components/timeline/theme";
import { demoRoadmap, demoToday } from "@/data/demo-roadmap";
import { useCorrectionPrototype } from "./use-correction-prototype";
import { PrototypeSwitcher, useVariant, type Variant } from "./PrototypeSwitcher";
import { InlineChipsBar } from "./variants/InlineChipsBar";
import { EvolvedPreviewCard } from "./variants/EvolvedPreviewCard";
import { ConversationalBubble } from "./variants/ConversationalBubble";

const VARIANTS: Variant[] = [
  { key: "1", name: "Inline chips" },
  { key: "2", name: "Evolved preview card" },
  { key: "3", name: "Conversational bubble" },
];

const theme = defaultTheme;

export function CorrectionClarifyView() {
  const variant = useVariant(VARIANTS);
  const box = useCorrectionPrototype(demoRoadmap);

  return (
    <div className="min-h-screen pb-56" style={{ background: theme.pageBg }}>
      <div className="fixed top-3 left-4 z-40 flex items-center gap-2">
        <WayframeLogo accent={theme.accent} caption="Correction clarify — prototype" />
      </div>

      <div className="relative mx-auto max-w-[1600px] p-8 pt-16">
        <RoadmapTimeline data={box.data} today={demoToday} theme={theme} />
      </div>

      {variant === "1" && <InlineChipsBar box={box} theme={theme} />}
      {variant === "2" && <EvolvedPreviewCard box={box} theme={theme} />}
      {variant === "3" && <ConversationalBubble box={box} theme={theme} />}

      <PrototypeSwitcher variants={VARIANTS} />
    </div>
  );
}
