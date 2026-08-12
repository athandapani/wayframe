"use client";

// Owns which of the two shipped correction-box UI shapes is showing (issue
// #9: Variant A default, Variant B kept as a togglable alternate). Mode is
// controlled (wayframe#31) — the toggle itself now lives in OptionsMenu,
// not inline here, so RoadmapWorkspace owns the state as the single source
// of truth.
import { CorrectionBox } from "./CorrectionBox";
import { CorrectionSidebar } from "./CorrectionSidebar";
import type { AppliedIds, UseCorrectionBoxResult } from "./use-correction-box";

export type CorrectionBoxMode = "bar" | "sidebar";

export function CorrectionBoxSwitcher({
  box,
  mode,
  onNeedsEditor,
}: {
  box: UseCorrectionBoxResult;
  mode: CorrectionBoxMode;
  /** Ids of entities the AI added without a resolved date — open the right editor for them, mirroring the manual "+" buttons (wayframe#41/#59). */
  onNeedsEditor?: (ids: AppliedIds) => void;
}) {
  return mode === "sidebar" ? (
    <CorrectionSidebar box={box} onNeedsEditor={onNeedsEditor} />
  ) : (
    <CorrectionBox box={box} onNeedsEditor={onNeedsEditor} />
  );
}
