// PROTOTYPE (wayframe#70) — throwaway. Top-level switcher for the
// configurable-axis-hierarchy UI question. Mounted on the existing
// /dev/roadmap-timeline visual-QA page (sub-shape A: adjustment to an
// existing page) rather than a new route, so it renders next to the real
// RoadmapTimeline for context. Uses useSearchParams, so the caller must
// wrap this in <Suspense>.

"use client";

import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";
import { VariantD } from "./VariantD";
import { VariantE } from "./VariantE";

export function AxisHierarchyPrototype() {
  const searchParams = useSearchParams();
  const variant = searchParams.get("variant") ?? "A";

  return (
    <div className="mt-10 rounded-xl border p-6 pb-24" style={{ borderColor: "#2b3542", background: "#12161c" }}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: "#cdd9e5" }}>
        Prototype — wayframe#70: configurable axis hierarchy
      </h2>
      <p className="mb-4 text-xs" style={{ color: "#8b949e" }}>
        Variants for the level-count / per-level-unit / per-level-color control (1–3 levels; Level 1 is always Year). Switch with the bar
        below, ←/→, or <code>?variant=A|B|C|D|E</code>.
      </p>
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      {variant === "D" && <VariantD />}
      {variant === "E" && <VariantE />}
      <PrototypeSwitcher current={variant} />
    </div>
  );
}
