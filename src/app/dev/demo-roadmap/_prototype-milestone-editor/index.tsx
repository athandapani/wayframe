"use client";

// PROTOTYPE — throwaway. wayframe#17: which UI surface should direct
// (non-AI) field editing use — slide-in side panel, popover-on-marker, or
// modal dialog — and which Milestone fields belong in v1? Three
// structurally different variants, switchable via ?editorVariant=a|b|c. See
// VariantA/B/C for the shape each one bets on.
//
// Click a milestone marker on the timeline to open the current variant's
// editor for it. Top-level phase/milestone band items are not wired to an
// editor in this prototype — the field list under discussion (#17's
// options) is specific to Milestone; scope stayed there.
import { Suspense } from "react";
import type { MilestoneEditorResult } from "./use-milestone-editor";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";
import { Switcher, useVariant } from "./Switcher";

function VariantHost({ editor }: { editor: MilestoneEditorResult }) {
  const variant = useVariant();
  const selectedMilestone =
    editor.selected?.kind === "milestone" ? (editor.data.milestones.find((m) => m.id === editor.selected!.id) ?? null) : null;

  return (
    <>
      {variant === "a" && <VariantA data={editor.data} milestone={selectedMilestone} onSave={editor.saveMilestone} onClose={editor.close} />}
      {variant === "b" && (
        <VariantB
          milestone={selectedMilestone}
          anchor={editor.selected?.kind === "milestone" ? editor.selected : null}
          onSave={editor.saveMilestone}
          onClose={editor.close}
        />
      )}
      {variant === "c" && <VariantC data={editor.data} milestone={selectedMilestone} onSave={editor.saveMilestone} onClose={editor.close} />}
      <Switcher />
    </>
  );
}

export function MilestoneEditorPrototype({ editor }: { editor: MilestoneEditorResult }) {
  return (
    <Suspense fallback={null}>
      <VariantHost editor={editor} />
    </Suspense>
  );
}
