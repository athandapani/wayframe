"use client";

// PROTOTYPE — throwaway. wayframe#127: what should Version History look like?
//
// Three structurally different answers to #119's resolved semantics (a
// manual-only "Save a version" that captures the WHOLE Roadmap — every
// Program together — as one dated immutable record, browsable view-only in
// the same rich editor, with no restore), switchable via ?variant=a|b|c on
// the real /p/[portfolioId]/all route. Mock data only (mock-data.ts) — no
// auth, no fetch, no Yjs, no DB; saving appends to an in-memory array. #128
// builds the real table, list and read-only mode behind whichever wins.
//
//   A — Versions modal + a separate read-only route (history is a place you go)
//   B — right History dock, canvas swaps in place (history is a mode you sit in)
//   C — version ribbon above the axis (history is a position on a second time axis)
import { Suspense } from "react";
import { VersionSwitcher, useVersionVariant } from "./Switcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";
import { PROTO_THEME, useProtoState } from "./shared";

function VersionHistoryHost() {
  const variant = useVersionVariant();
  // One store above the switch, so a version you saved in A is still there
  // in B and C — the comparison is between shapes, not between three
  // different histories.
  const state = useProtoState();
  return (
    // The same --wf-* custom properties CombinedProgramEditor publishes, so
    // the mock rail is themed the way the real one is rather than falling
    // back to bare white.
    <div
      style={
        {
          "--wf-panel": PROTO_THEME.panelBg,
          "--wf-border": PROTO_THEME.panelBorder,
          "--wf-ink": PROTO_THEME.panelInk,
          "--wf-accent": PROTO_THEME.accent,
        } as React.CSSProperties
      }
    >
      {variant === "a" && <VariantA state={state} />}
      {variant === "b" && <VariantB state={state} />}
      {variant === "c" && <VariantC state={state} />}
      <VersionSwitcher />
    </div>
  );
}

export function VersionHistoryPrototype() {
  return (
    <Suspense fallback={null}>
      <VersionHistoryHost />
    </Suspense>
  );
}
