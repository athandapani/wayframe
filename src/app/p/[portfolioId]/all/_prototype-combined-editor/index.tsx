"use client";

// PROTOTYPE — throwaway. wayframe#125: what should the combined
// multi-Program editor look like?
//
// Three structurally different answers to #118's resolved shape (one shared
// time axis, independently-collapsible Program bands, a Program-tabbed
// structure editor under a canvas that always shows every Program, and
// field-driven cross-Program move in both the milestone and swimlane
// editors), switchable via ?variant=a|b|c on the real
// /p/[portfolioId]/all route. Mock data only (mock-data.ts) — no auth, no
// fetch, no Yjs, no mutation; a "move" appends to an in-memory log instead
// of dispatching #124's real primitive. That wiring is #126's job once a
// variant is picked.
//
//   A — canvas over docked structure tabs (spreadsheet-style bottom dock)
//   B — left Program rail, canvas right (no tabs; rail card = tab)
//   C — band chip strip + structure drawer (editor over canvas, not beside)
import { Suspense } from "react";
import { EditorSwitcher, useEditorVariant } from "./Switcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";
import { useProtoState } from "./shared";

function CombinedEditorHost() {
  const variant = useEditorVariant();
  // One state instance above the switch, so flipping variants keeps the
  // collapse/selection/move-log you just built up — the comparison is
  // between layouts, not between two different states.
  const state = useProtoState();
  return (
    <>
      {variant === "a" && <VariantA state={state} />}
      {variant === "b" && <VariantB state={state} />}
      {variant === "c" && <VariantC state={state} />}
      <EditorSwitcher />
    </>
  );
}

export function CombinedEditorPrototype() {
  return (
    <Suspense fallback={null}>
      <CombinedEditorHost />
    </Suspense>
  );
}
