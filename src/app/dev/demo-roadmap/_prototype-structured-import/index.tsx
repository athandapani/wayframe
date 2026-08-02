"use client";

// PROTOTYPE — throwaway. wayframe#13: structured-data import (file upload +
// Smartsheet one-way live pull) design. Three structurally different
// layouts, switchable via ?importVariant=.
import { Suspense } from "react";
import { ImportSwitcher, useImportVariant } from "./Switcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";

function StructuredImportHost() {
  const variant = useImportVariant();
  return (
    <>
      {variant === "a" && <VariantA />}
      {variant === "b" && <VariantB />}
      {variant === "c" && <VariantC />}
      <ImportSwitcher />
    </>
  );
}

export function StructuredImportPrototype() {
  return (
    <Suspense fallback={null}>
      <StructuredImportHost />
    </Suspense>
  );
}
