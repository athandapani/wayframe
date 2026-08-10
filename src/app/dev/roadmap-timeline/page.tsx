// Dev-only visual QA page for RoadmapTimeline — not part of the product
// nav. Renders the same fixture the unit tests use. Gated so it can't ship
// to production even if this route survives a merge.
//
// PROTOTYPE (wayframe#42) — "Design a selectable font theme (family + size)
// with app-wide scaling". Three variants of the scaling mechanism, switchable
// via ?variant=, per the /prototype skill. All three route through the same
// real fontScale/fontFamily/metricsScale/boxScale props now threaded through
// RoadmapTimeline (see that file's "PROTOTYPE (wayframe#42)" markers) — they
// differ only in *which* scales get wired to the slider, which is exactly the
// ticket's question. Drag the slider past ~1.2 in each variant and watch what
// breaks first.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { notFound } from "next/navigation";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { defaultTheme, THEME_LIST, type ThemeId } from "@/components/timeline/theme";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";

const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];

const VARIANT_META: Record<Variant, { name: string; blurb: string }> = {
  A: {
    name: "Text-only scale",
    blurb:
      "fontScale changes rendered text size; nothing else moves. Family is an independent curated picker, layered over the active theme. Cheapest to build — watch labels clip and overlap as the slider climbs.",
  },
  B: {
    name: "Full scale (text + layout)",
    blurb:
      "fontScale drives text size, the collision-math constants, AND every row/pill/axis/band box height. Family becomes a true per-theme token — no independent override, pick a theme to pick a family. Most robust, touches the most surface.",
  },
  C: {
    name: "Text + collision-aware",
    blurb:
      "fontScale drives text size and the text-width-estimate constants that feed label/chip/badge/tooltip sizing, so collision-avoidance still holds at any size — but row/pill/axis box heights stay fixed. Family stays independent of theme.",
  },
};

// PROTOTYPE-only demo font stacks — NOT a change to the real theme tokens.
// Exists only to make Variant B's "family is theme-locked" claim visible:
// switching theme is how you switch family in that variant, so each shipped
// theme gets a distinct demo stack here rather than sharing SYSTEM_SANS.
const B_THEME_FONTS: Record<ThemeId, string> = {
  blueprint: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  graphite: "'Consolas', 'SF Mono', 'Cascadia Code', monospace",
  press: "'Georgia', 'Iowan Old Style', serif",
};

// Curated family choices for Variants A/C — independent of theme.
const FAMILY_CHOICES = [
  { id: "system", label: "System sans", stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: "serif", label: "Editorial serif", stack: "'Georgia', 'Iowan Old Style', serif" },
  { id: "mono", label: "Technical mono", stack: "'Consolas', 'SF Mono', 'Cascadia Code', monospace" },
  { id: "rounded", label: "Rounded humanist", stack: "'Nunito', 'Segoe UI Rounded', 'Segoe UI', sans-serif" },
  { id: "condensed", label: "Condensed", stack: "'Bahnschrift', 'Arial Narrow', sans-serif" },
] as const;

function Chrome({ fontScale, setFontScale, children }: { fontScale: number; setFontScale: (n: number) => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 p-8 pb-28 dark:bg-black">
      <div className="relative mx-auto max-w-[1600px]">{children}</div>
      <div className="fixed bottom-32 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs text-white shadow-lg">
        <label htmlFor="font-scale" className="whitespace-nowrap font-mono">
          fontScale {fontScale.toFixed(2)}
        </label>
        <input
          id="font-scale"
          type="range"
          min={0.7}
          max={1.6}
          step={0.05}
          value={fontScale}
          onChange={(e) => setFontScale(parseFloat(e.target.value))}
          className="w-40"
        />
      </div>
    </div>
  );
}

function VariantA({ fontScale, setFontScale }: { fontScale: number; setFontScale: (n: number) => void }) {
  const [family, setFamily] = useState<string>(FAMILY_CHOICES[0].stack);
  return (
    <Chrome fontScale={fontScale} setFontScale={setFontScale}>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label htmlFor="family-a">Family (independent of theme):</label>
        <select id="family-a" value={family} onChange={(e) => setFamily(e.target.value)} className="rounded border px-2 py-1">
          {FAMILY_CHOICES.map((f) => (
            <option key={f.id} value={f.stack}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <BlufCallout bluf={sampleRoadmap.bluf} open onOpenChange={() => {}} theme={defaultTheme} />
      <RoadmapTimeline data={sampleRoadmap} today={new Date("2026-01-20T00:00:00Z")} fontScale={fontScale} fontFamily={family} />
    </Chrome>
  );
}

function VariantB({ fontScale, setFontScale }: { fontScale: number; setFontScale: (n: number) => void }) {
  const [themeId, setThemeId] = useState<ThemeId>("blueprint");
  const theme = THEME_LIST.find((t) => t.id === themeId)!;
  return (
    <Chrome fontScale={fontScale} setFontScale={setFontScale}>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span>Family is theme-locked — pick a theme to pick a family:</span>
        {THEME_LIST.map((t) => (
          <button
            key={t.id}
            onClick={() => setThemeId(t.id)}
            className={`rounded border px-2 py-1 ${themeId === t.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : ""}`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <BlufCallout bluf={sampleRoadmap.bluf} open onOpenChange={() => {}} theme={theme} />
      <RoadmapTimeline
        data={sampleRoadmap}
        today={new Date("2026-01-20T00:00:00Z")}
        theme={theme}
        fontScale={fontScale}
        fontFamily={B_THEME_FONTS[themeId]}
        metricsScale={fontScale}
        boxScale={fontScale}
      />
    </Chrome>
  );
}

function VariantC({ fontScale, setFontScale }: { fontScale: number; setFontScale: (n: number) => void }) {
  const [family, setFamily] = useState<string>(FAMILY_CHOICES[0].stack);
  return (
    <Chrome fontScale={fontScale} setFontScale={setFontScale}>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label htmlFor="family-c">Family (independent of theme):</label>
        <select id="family-c" value={family} onChange={(e) => setFamily(e.target.value)} className="rounded border px-2 py-1">
          {FAMILY_CHOICES.map((f) => (
            <option key={f.id} value={f.stack}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <BlufCallout bluf={sampleRoadmap.bluf} open onOpenChange={() => {}} theme={defaultTheme} />
      <RoadmapTimeline
        data={sampleRoadmap}
        today={new Date("2026-01-20T00:00:00Z")}
        fontScale={fontScale}
        fontFamily={family}
        metricsScale={fontScale}
      />
    </Chrome>
  );
}

function PrototypeSwitcher({ current }: { current: Variant }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const goTo = useCallback(
    (v: Variant) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", v);
      router.replace(`/dev/roadmap-timeline?${params.toString()}`);
    },
    [router, searchParams],
  );

  const cycle = useCallback(
    (dir: 1 | -1) => {
      const i = VARIANTS.indexOf(current);
      goTo(VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length]);
    },
    [current, goTo],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable)) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-1">
      <div className="flex items-center gap-3 rounded-full border-2 border-amber-500 bg-white px-4 py-2 shadow-xl dark:bg-zinc-900">
        <button onClick={() => cycle(-1)} aria-label="Previous variant" className="text-lg font-bold text-amber-600">
          ←
        </button>
        <span className="text-sm font-semibold">
          {current} — {VARIANT_META[current].name}
        </span>
        <button onClick={() => cycle(1)} aria-label="Next variant" className="text-lg font-bold text-amber-600">
          →
        </button>
      </div>
      <p className="max-w-lg text-center text-xs text-zinc-500">{VARIANT_META[current].blurb}</p>
    </div>
  );
}

export default function RoadmapTimelineDevPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RoadmapTimelineDevPreviewInner />;
}

function RoadmapTimelineDevPreviewInner() {
  const searchParams = useSearchParams();
  const [fontScale, setFontScale] = useState(1);
  const raw = searchParams.get("variant");
  const variant: Variant = VARIANTS.includes(raw as Variant) ? (raw as Variant) : "A";

  return (
    <>
      {variant === "A" && <VariantA fontScale={fontScale} setFontScale={setFontScale} />}
      {variant === "B" && <VariantB fontScale={fontScale} setFontScale={setFontScale} />}
      {variant === "C" && <VariantC fontScale={fontScale} setFontScale={setFontScale} />}
      <PrototypeSwitcher current={variant} />
    </>
  );
}
