"use client";

// Owns which of the two shipped correction-box UI shapes is showing (issue
// #9: Variant A default, Variant B kept as a togglable alternate). Mode is
// controlled (wayframe#31) — the toggle itself now lives in OptionsMenu,
// not inline here, so RoadmapWorkspace owns the state as the single source
// of truth.
import { CorrectionBox } from "./CorrectionBox";
import { CorrectionSidebar } from "./CorrectionSidebar";
import type { UseCorrectionBoxResult } from "./use-correction-box";

export type CorrectionBoxMode = "bar" | "sidebar";

export function CorrectionBoxSwitcher({
  box,
  mode,
  onMilestonesNeedEditor,
}: {
  box: UseCorrectionBoxResult;
  mode: CorrectionBoxMode;
  /** Ids of milestones the AI added without a resolved date — open the editor for them, mirroring the manual "+" button. */
  onMilestonesNeedEditor?: (ids: string[]) => void;
}) {
  return mode === "sidebar" ? (
    <CorrectionSidebar box={box} onMilestonesNeedEditor={onMilestonesNeedEditor} />
  ) : (
    <CorrectionBox box={box} onMilestonesNeedEditor={onMilestonesNeedEditor} />
  );
}
