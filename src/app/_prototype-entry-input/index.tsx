"use client";

// PROTOTYPE — throwaway. wayframe#23: the real `/` entry page's input
// surface (text + photo form, loading/error states, sample affordance).
// Three structurally different layouts, switchable via ?variant=.
import { Suspense } from "react";
import { EntrySwitcher, useEntryVariant } from "./Switcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";

function EntryInputHost() {
  const variant = useEntryVariant();
  return (
    <>
      {variant === "a" && <VariantA />}
      {variant === "b" && <VariantB />}
      {variant === "c" && <VariantC />}
      <EntrySwitcher />
    </>
  );
}

export function EntryInputPrototype() {
  return (
    <Suspense fallback={null}>
      <EntryInputHost />
    </Suspense>
  );
}
