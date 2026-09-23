// The right-hand editor dock's one declaration of how wide it is and what
// its shell looks like (wayframe#126), shared by MilestoneEditorInspector
// and TopLevelItemEditorInspector so the two can never drift apart — they
// were deliberately built to the same shape (see TopLevelItemEditorInspector's
// own header), and a dock is much more obviously "the same panel, different
// contents" than two centered modals ever were.
//
// The number and the class are exported separately because they're read by
// different kinds of consumer: the class by the two inspectors, the number
// by whichever surface HOSTS the dock (RoadmapWorkspace.tsx, and the
// combined multi-Program editor), which publishes it as the `--wf-dock-w`
// custom property so the viewport-centered correction bar / selection
// toolbar can stay centered on the chart rather than sliding under the dock
// (see CorrectionBox.tsx's DOCK_SHIFT).

/** Width in px. Matches the `w-[380px]` in EDITOR_DOCK_CLASS below — keep the two in step. #125's prototype ran the inspector at exactly this width, which is what the single-column field re-flow was designed against. */
export const EDITOR_DOCK_WIDTH = 380;

/**
 * Sticky, full-height, its own scroll container: the canvas beside it
 * scrolls independently, so editing an item never scrolls the band it lives
 * in out of view — the reason #125 picked a dock over a modal in the first
 * place.
 */
export const EDITOR_DOCK_CLASS =
  "sticky top-0 z-30 flex h-screen w-[380px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900";
