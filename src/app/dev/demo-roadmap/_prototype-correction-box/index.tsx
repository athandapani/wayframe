"use client";

// PROTOTYPE — throwaway. wayframe#9: which UI shape should the correction
// box take? Three structurally different variants, switchable via
// ?variant=. See VariantA/B/C for the shape each one bets on.
import { Suspense } from "react";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";
import { Switcher, useVariant } from "./Switcher";

function VariantHost() {
  const variant = useVariant();
  return (
    <>
      {variant === "a" && <VariantA />}
      {variant === "b" && <VariantB />}
      {variant === "c" && <VariantC />}
      <Switcher />
    </>
  );
}

export function CorrectionBoxPrototype() {
  return (
    <Suspense fallback={null}>
      <VariantHost />
    </Suspense>
  );
}
