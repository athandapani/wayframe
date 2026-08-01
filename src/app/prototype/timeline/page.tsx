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
import { SettingsMenu } from "./SettingsMenu";
import { SoWhatCallout } from "./SoWhatCallout";
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

  // structural overrides for the two independently-adjustable chrome colors
  // (timeline header bar vs. swimlane separator bar) — reset to the new
  // theme's defaults on theme switch, since they're a per-theme customization.
  const [axisBgOverride, setAxisBgOverride] = useState<string | null>(null);
  const [separatorBgOverride, setSeparatorBgOverride] = useState<string | null>(null);
  const effectiveTheme = {
    ...theme,
    axisBg: axisBgOverride ?? theme.axisBg,
    separatorBg: separatorBgOverride ?? theme.separatorBg,
  };

  function handleThemeChange(next: typeof theme) {
    setTheme(next);
    setAxisBgOverride(null);
    setSeparatorBgOverride(null);
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 dark:bg-black">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
            Swimlane &amp; milestone timeline — rendering approach prototype
          </h1>
          <SettingsMenu
            theme={theme}
            onThemeChange={handleThemeChange}
            axisTiers={axisTiers}
            onAxisTiersChange={setAxisTiers}
            axisBg={effectiveTheme.axisBg}
            onAxisBgChange={setAxisBgOverride}
            separatorBg={effectiveTheme.separatorBg}
            onSeparatorBgChange={setSeparatorBgOverride}
          />
        </div>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Fictional warehouse-robotics platform launch program. Diamonds = milestones, pill = top-level
          phase, purple dashed = annotation, red outline/stroke = flagged critical path.
        </p>
        <div className="relative">
          <SoWhatCallout />
          {variant === "A" && <VariantA theme={effectiveTheme} axisTiers={axisTiers} />}
          {variant === "B" && <VariantB theme={effectiveTheme} axisTiers={axisTiers} />}
          {variant === "C" && <VariantC theme={effectiveTheme} axisTiers={axisTiers} />}
        </div>
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
