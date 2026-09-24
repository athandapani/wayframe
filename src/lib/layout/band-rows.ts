import { stackIntervals } from "./stack-intervals";

/**
 * PROGRAM-band vertical allocation (wayframe#142) — the band's answer to
 * what `lane-rows.ts` + `stack-intervals.ts` already do for a Swimlane.
 *
 * Before this, every `TopLevelItem` in the band was drawn on one shared
 * centreline (`topBandY + topBandHeight / 2`), with no awareness of its
 * neighbours at all — so two phases covering overlapping date ranges
 * painted straight over each other, and their labels rendered as
 * unreadable overstrike. Lanes never had that problem because t20/#94 gave
 * them two layers, and this deliberately mirrors both rather than
 * inventing a third model:
 *
 *  1. **Explicit `bandRow`** (document content, 1-based, row 1 implicit) —
 *     the author's own grouping call, exactly like `Milestone.laneRow`.
 *     Assignment decides *which* row an item belongs to and nothing else.
 *  2. **Automatic stacking inside each row** via the same `stackIntervals`
 *     partitioning in-lane duration pills use — so overlap is safe even in
 *     a document where nobody has ever set a `bandRow`, and assignment
 *     never switches collision safety off. This is t20's rule verbatim:
 *     "assignment overrides which row, never turns off automatic collision
 *     safety there."
 *
 * Items are separated by the span they OCCUPY, in whatever unit the caller
 * measures in — the caller decides what "occupied" means for each kind, and
 * this module never looks at dates, pixels or titles itself. Since
 * wayframe#148 the caller (RoadmapTimeline) measures in pixels precisely so
 * that a point item can take part: a top-level milestone's glyph is a dot
 * with no interval, but its floating title is an interval, and the titles
 * were what piled up into unreadable overstrike. An item with `end: null`
 * occupies nothing and still sits on its row's first sub-row (an
 * annotation, whose own label is laid out by the reference-line pass
 * instead).
 */
export interface BandLayoutItem {
  id: string;
  /** Explicit row assignment; `undefined` means row 1, never written explicitly (mirrors Milestone.laneRow). */
  bandRow?: number;
  /** Start of the span this item occupies, in the caller's own unit (RoadmapTimeline measures pixels — see wayframe#148). */
  start: number;
  /** End of that span, or `null` for an item that occupies nothing and so can never collide — it takes its row's first sub-row without opening one. */
  end: number | null;
}

export interface BandLayout {
  /** Vertical offset from the band's first sub-row, in sub-row units — multiply by the caller's row height. */
  subRowById: Map<string, number>;
  /** Total sub-rows the band needs, across every explicit row. Always at least 1. */
  subRowCount: number;
}

export function layoutBandRows(items: readonly BandLayoutItem[]): BandLayout {
  const subRowById = new Map<string, number>();
  if (items.length === 0) return { subRowById, subRowCount: 1 };

  // Grouped by explicit row, then walked in row order, so a higher
  // `bandRow` always renders below a lower one no matter what order the
  // items array happens to be in. Rows are NOT renumbered to be
  // contiguous: a document using rows 1 and 5 gets two rows, not five —
  // same treatment t21's migration gives a grouped lane's `order`, where
  // the original numbers stay a correct relative ordering even once
  // they're no longer contiguous from 0.
  const byRow = new Map<number, BandLayoutItem[]>();
  for (const item of items) {
    const row = item.bandRow !== undefined && Number.isFinite(item.bandRow) ? Math.max(1, Math.trunc(item.bandRow)) : 1;
    const bucket = byRow.get(row);
    if (bucket) bucket.push(item);
    else byRow.set(row, [item]);
  }

  let nextSubRow = 0;
  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const inRow = byRow.get(row)!;
    const ranges = inRow.filter((i) => i.end !== null).map((i) => ({ id: i.id, start: i.start, end: i.end! }));
    const stacked = stackIntervals(ranges);

    // An item that occupies no span at all (end: null) falls back to the
    // row's first sub-row: it can't overlap anything, and pushing it down
    // would make a band taller for no reason.
    for (const item of inRow) subRowById.set(item.id, nextSubRow + (stacked.subRowById.get(item.id) ?? 0));
    nextSubRow += Math.max(1, stacked.subRowCount);
  }

  return { subRowById, subRowCount: Math.max(1, nextSubRow) };
}
