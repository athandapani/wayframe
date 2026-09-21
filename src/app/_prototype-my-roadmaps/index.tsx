"use client";

// PROTOTYPE — throwaway. wayframe#122: the post-sign-in "My Roadmaps"
// landing page — every Roadmap the user has any role on (owner/editor/
// viewer), owned-first, plus "+ New Roadmap." Three structurally different
// layouts, switchable via ?variant=. Mock data only (shared.ts) — no real
// auth/API wiring; that's wayframe#123's job once a variant is picked.
import { Suspense } from "react";
import { RoadmapsSwitcher, useRoadmapsVariant } from "./Switcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";

function MyRoadmapsHost() {
  const variant = useRoadmapsVariant();
  return (
    <>
      {variant === "a" && <VariantA />}
      {variant === "b" && <VariantB />}
      {variant === "c" && <VariantC />}
      <RoadmapsSwitcher />
    </>
  );
}

export function MyRoadmapsPrototype() {
  return (
    <Suspense fallback={null}>
      <MyRoadmapsHost />
    </Suspense>
  );
}
