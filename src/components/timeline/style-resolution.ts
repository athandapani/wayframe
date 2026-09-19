// The style resolution ladder (wayframe#t19) — one shared, pure "which
// value wins" policy for every property in the locked style-override set,
// so the precedence order lives in exactly one place instead of being
// re-decided ad-hoc at each render call site.
//
// Ladder, restated per property (t19's gist, "most-specific-wins"):
//   - color: item styleOverride.color > identity-scoped color (category, if
//     the caller's legend-fill viewer-pref resolved one) > Program
//     styleDefaults.color > Theme statusColor token, with the existing
//     not-started hollow-fill special case layered on the last three rungs.
//   - markerShape / markerScale / phaseShape / phaseSize: item
//     styleOverride > Program styleDefaults > Theme token. No
//     identity-color rung — doesn't apply to a shape/scale property.
//   - fontScale / hidden: item styleOverride > Program styleDefaults >
//     hardcoded fallback (1 / false). No Theme rung — not a
//     theme-appropriate concept.
//   - titleLabelPosition / dateLabelPosition: item styleOverride only.
//     `undefined` means "existing tiered collision-avoidance layout,
//     unchanged" — a document-wide default position would fight that
//     system, and the gist doesn't ask for one.
import type { LabelPosition, LegendCategory, MarkerShape, PhaseShape, PhaseSize, Program, Status, StyleOverride } from "./types";
import type { Theme } from "./theme";

/** First non-`undefined` value, in argument order — the mechanical core of every ladder below. */
function firstDefined<T>(...values: (T | undefined)[]): T | undefined {
  for (const v of values) if (v !== undefined) return v;
  return undefined;
}

interface StyledItem {
  styleOverride?: StyleOverride;
}

export function resolveMarkerShape(item: StyledItem, program: Program, theme: Theme): MarkerShape {
  return firstDefined(item.styleOverride?.markerShape, program.styleDefaults?.markerShape, theme.markerShapeDefault) ?? theme.markerShapeDefault;
}

export function resolveMarkerScale(item: StyledItem, program: Program, theme: Theme): number {
  return firstDefined(item.styleOverride?.markerScale, program.styleDefaults?.markerScale, theme.markerScaleDefault) ?? theme.markerScaleDefault;
}

/**
 * Resolves only the per-item/Program rung of the font-scale ladder, as a
 * MULTIPLIER — not a replacement for the caller's own global viewer
 * font-scale (t19's gist: "the one property that composes multiplicatively
 * with the existing global viewer font-scale rather than substituting for
 * it"). Callers must multiply this result by their own `fontScale` prop,
 * not use it in place of that prop.
 */
export function resolveFontScale(item: StyledItem, program: Program): number {
  return firstDefined(item.styleOverride?.fontScale, program.styleDefaults?.fontScale) ?? 1;
}

/** Item-override-only ladder — `undefined` means "leave the existing tiered label layout alone." */
export function resolveTitleLabelPosition(item: StyledItem): LabelPosition | undefined {
  return item.styleOverride?.titleLabelPosition;
}

/** Item-override-only ladder — `undefined` means "leave the existing tiered label layout alone." */
export function resolveDateLabelPosition(item: StyledItem): LabelPosition | undefined {
  return item.styleOverride?.dateLabelPosition;
}

export function resolveHidden(item: StyledItem, program: Program): boolean {
  return firstDefined(item.styleOverride?.hidden, program.styleDefaults?.hidden) ?? false;
}

export function resolvePhaseShape(item: StyledItem, program: Program, theme: Theme): PhaseShape {
  return firstDefined(item.styleOverride?.phaseShape, program.styleDefaults?.phaseShape, theme.phaseShapeDefault) ?? theme.phaseShapeDefault;
}

export function resolvePhaseSize(item: StyledItem, program: Program, theme: Theme): PhaseSize {
  return firstDefined(item.styleOverride?.phaseSize, program.styleDefaults?.phaseSize, theme.phaseSizeDefault) ?? theme.phaseSizeDefault;
}

/**
 * Marker fill/stroke resolution (wayframe#t19) — supersedes the old
 * 2-rung `resolveMarkerPaint` that lived in RoadmapTimeline.tsx. Behavior is
 * BYTE-IDENTICAL to that function whenever `m.styleOverride?.color` and
 * `program.styleDefaults?.color` are both unset (see style-resolution.test.ts's
 * regression tests) — the two rules that function's own doc comment
 * describes (not-started renders hollow; legend category-fill takes over
 * the fill when on) are preserved unchanged, just as rungs 2/3 of a longer
 * ladder instead of the whole thing:
 *
 *   1. `m.styleOverride.color` — a raw color override wins outright, full
 *      stop. It has no "status" concept to put on the ring, so it always
 *      renders with a plain halo stroke, never the not-started hollow-fill
 *      treatment (that treatment is specifically about routing *status's*
 *      color to the ring instead of the fill; an explicit override has
 *      already decided the fill, there's nothing left to route).
 *   2. identity-scoped color — the `category` param (already resolved by
 *      the caller from the legend-fill viewer-pref gate, unchanged from
 *      today), else Program styleDefaults' color, else the status ramp.
 *      The not-started hollow-fill special case applies across all three of
 *      these, exactly as it did in the old 2-rung function.
 */
export function resolveMarkerColor(
  m: StyledItem & { status: Status },
  theme: Theme,
  program: Program,
  category?: LegendCategory,
): { fill: string; stroke: string; strokeWidth: number } {
  if (m.styleOverride?.color) {
    return { fill: m.styleOverride.color, stroke: theme.markerHalo, strokeWidth: 1.5 };
  }
  const notStarted = m.status === "not-started";
  const identityColor = category?.color ?? program.styleDefaults?.color;
  if (identityColor) {
    return { fill: notStarted ? theme.ground : identityColor, stroke: theme.statusColor[m.status], strokeWidth: 1.75 };
  }
  return {
    fill: notStarted ? theme.ground : theme.statusColor[m.status],
    stroke: notStarted ? theme.statusColor[m.status] : theme.markerHalo,
    strokeWidth: notStarted ? 1.75 : 1.5,
  };
}
