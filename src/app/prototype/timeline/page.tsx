// PROTOTYPE route — wayframe issue #7: "Design the swimlane and milestone
// timeline visual component." Three variants of the core rendering approach,
// switchable via ?variant=, thrown away once a direction is picked.
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import VariantA from "./VariantA";
import VariantB from "./VariantB";
import VariantC from "./VariantC";
import { PrototypeSwitcher, type VariantMeta } from "./PrototypeSwitcher";
import { ThemeAxisControls } from "./ThemeAxisControls";
import { THEMES } from "./theme";
import { AXIS_PRESETS } from "./axis-tiers";

const VARIANTS: VariantMeta[] = [
  { key: "A", label: "Hand-rolled SVG" },
  { key: "B", label: "D3 scales + SVG" },
  { key: "C", label: "Canvas, imperative" },
];

function TimelinePrototype() {
  const searchParams = useSearchParams();
  const variant = searchParams.get("variant") ?? "A";
  const [theme, setTheme] = useState(THEMES[0]);
  const [axisTiers, setAxisTiers] = useState(AXIS_PRESETS[1]); // Year / Quarter default

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 dark:bg-black">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <h1 className="mb-1 text-xl font-semibold text-black dark:text-zinc-50">
          Swimlane &amp; milestone timeline — rendering approach prototype
        </h1>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Fictional warehouse-robotics platform launch program. Diamonds = milestones, pill = top-level
          phase, purple dashed = annotation, red outline/stroke = flagged critical path.
        </p>
        <ThemeAxisControls theme={theme} onThemeChange={setTheme} axisTiers={axisTiers} onAxisTiersChange={setAxisTiers} />
        {variant === "A" && <VariantA theme={theme} axisTiers={axisTiers} />}
        {variant === "B" && <VariantB theme={theme} axisTiers={axisTiers} />}
        {variant === "C" && <VariantC theme={theme} axisTiers={axisTiers} />}
      </div>
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TimelinePrototype />
    </Suspense>
  );
}
