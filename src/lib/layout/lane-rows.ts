import { stackIntervals, type Interval } from "./stack-intervals";

/**
 * Lane Rows & vertical allocation (wayframe#94/t20) — two allocators
 * layered, not one. Level 1 (this module's own `bucketRows`) is explicit,
 * document-content bucketing by `laneRow` (`?? 1`) — pure grouping, zero
 * collision logic. Level 2 is the existing stack-intervals.ts greedy
 * stacker, run unchanged *within* whichever row an item lands in: an
 * item's explicit row assignment overrides which row it collides inside,
 * never turns off collision safety there.
 *
 * Row 1 is a lane's always-present home row, so it keeps a floor — but a
 * content-derived one (LANE_ROW1_FLOOR, see its own doc), not RoadmapTimeline
 * .tsx's old flat, content-blind `LANE_HEIGHT=132`. That floor holds even
 * when Row 1 is currently empty (everything moved to row 2+) —
 * `computeLaneRowModel` synthesizes an empty Row 1 to reserve it. Rows 2+
 * are opt-in space the caller explicitly created for this content, so they
 * get no floor at all: cost is exactly what's stacked into them, and *those*
 * rows disappear the moment they're empty again (bucketRows only ever emits
 * rows something is actually assigned to; row 1 is the one exception,
 * synthesized back in by computeLaneRowModel when absent).
 *
 * Deliberately generic over what an item's own per-sub-row height floor
 * (`sizeFloor`) means — this module has no idea what a "phase size" is,
 * same separation of concerns stack-intervals.ts itself keeps from
 * RoadmapTimeline.tsx's Milestone-specific rendering. The caller resolves
 * `sizeFloor` from whatever size vocabulary applies (RoadmapTimeline.tsx's
 * PILL_PHASE_HEIGHT for an in-lane duration pill's resolved PhaseSize) and
 * hands it over already in pixels.
 */
export interface RowItem extends Interval {
  /** Which Lane Row this item belongs to — `undefined` means Row 1, the implicit default. Document content (Milestone.laneRow), not computed here. */
  laneRow?: number;
  /** This item's own minimum sub-row height, in pixels — e.g. a resolved PhaseSize's floor. Omit to take whatever `baseSlotHeight` the row itself uses. */
  sizeFloor?: number;
}

export interface RowLayout {
  row: number;
  items: readonly RowItem[];
  subRowById: Map<string, number>;
  subRowCount: number;
  /** Height of each sub-row within this row, tallest item wins (never less than `baseSlotHeight`). */
  slotHeights: number[];
  height: number;
}

export interface LaneRowModel {
  rows: RowLayout[];
  /** Sum of every row's height plus one `ROW_GAP` between each pair of rows — the lane's own natural (unfitted) height contribution from its Lane Rows. */
  naturalHeight: number;
}

/** Gap between two explicit Lane Rows when a lane has more than one. */
export const ROW_GAP = 6;

/**
 * Explicit, coarse bucketing by Lane Row — zero collision logic, pure
 * grouping. Row 1 is the implicit default (an item with no `laneRow`
 * assigned); explicit rows start at 2 and only exist in the output when at
 * least one item is currently assigned to them — "start at 2, grow as
 * needed," per the ticket's own framing.
 */
export function bucketRows<T extends { laneRow?: number }>(items: readonly T[]): Array<{ row: number; items: T[] }> {
  const byRow = new Map<number, T[]>();
  for (const item of items) {
    const row = item.laneRow ?? 1;
    const bucket = byRow.get(row);
    if (bucket) bucket.push(item);
    else byRow.set(row, [item]);
  }
  return [...byRow.keys()].sort((a, b) => a - b).map((row) => ({ row, items: byRow.get(row)! }));
}

export interface RowHeightOptions {
  /** A sub-row's height floor absent any taller item in it — RoadmapTimeline.tsx's density-scaled PILL_ROW_HEIGHT. */
  baseSlotHeight: number;
  /** Row 1's own floor, regardless of how little is stacked into it — see LANE_ROW1_FLOOR's doc for where this ticket's 49px figure comes from. Ignored for rows 2+, which have no floor of their own. */
  row1Floor: number;
}

/**
 * One Lane Row's height = the existing greedy stacker's result, run within
 * this row's own bucket, with each sub-row's slot height floored by the
 * tallest item's `sizeFloor` present in it — composing as a floor, not a
 * multiply-down by lane density, so an item with a taller `sizeFloor`
 * still reads taller than its row-mates regardless of how compressed the
 * lane's own baseline slot is.
 */
export function computeRowHeight(rowNumber: number, items: readonly RowItem[], opts: RowHeightOptions): RowLayout {
  const { subRowById, subRowCount } = stackIntervals(items);
  const bySubRow: RowItem[][] = Array.from({ length: subRowCount }, () => []);
  for (const item of items) bySubRow[subRowById.get(item.id)!].push(item);
  const slotHeights = bySubRow.map((subItems) => Math.max(opts.baseSlotHeight, ...subItems.map((i) => i.sizeFloor ?? 0)));
  const contentHeight = slotHeights.reduce((sum, h) => sum + h, 0);
  const floor = rowNumber === 1 ? opts.row1Floor : opts.baseSlotHeight;
  return { row: rowNumber, items, subRowById, subRowCount, slotHeights, height: Math.max(floor, contentHeight) };
}

/** Composes both allocator levels for one lane's worth of Lane-Row-bucketed items. */
export function computeLaneRowModel(items: readonly RowItem[], opts: RowHeightOptions): LaneRowModel {
  const buckets = bucketRows(items);
  const rows = buckets.map(({ row, items: rowItems }) => computeRowHeight(row, rowItems, opts));
  // Row 1 is a lane's always-present home row (see this module's own doc):
  // its row1Floor reservation must hold even when everything currently
  // assigned to the lane has moved to row 2+, so an empty Row 1 still gets
  // a synthetic, empty-`items` entry rather than vanishing along with its
  // floor.
  if (rows.length > 0 && rows[0].row !== 1) {
    rows.unshift(computeRowHeight(1, [], opts));
  }
  const naturalHeight = rows.reduce((sum, r) => sum + r.height, 0) + Math.max(0, rows.length - 1) * ROW_GAP;
  return { rows, naturalHeight };
}

/**
 * Expand-only "fit to screen" (wayframe#94/t20) — the vertical sibling to
 * #84/t10's horizontal zoom/fit-to-screen, replacing the old shrink-based
 * "Auto lane height" viewer toggle entirely. Content is never forced
 * smaller than `totalNaturalHeight` (over-budget content just scrolls);
 * only when there's real surplus room in `viewportBudget` does this
 * stretch every lane proportionally to help fill it. Returns a single
 * ratio (>= 1) meant to multiply every lane's own natural height uniformly
 * — proportional distribution of the same surplus, not a per-lane
 * computation, so it's derived once per render, not once per lane.
 */
export function computeFitToScreenRatio(totalNaturalHeight: number, viewportBudget: number): number {
  if (!viewportBudget || totalNaturalHeight <= 0) return 1;
  return Math.max(1, viewportBudget / totalNaturalHeight);
}
