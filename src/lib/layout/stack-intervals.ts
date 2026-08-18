/**
 * Phase & pill vertical stacking — when a lane has
 * duration pills whose date ranges overlap, RoadmapTimeline needs to know
 * which vertical sub-row to draw each one on so overlapping pills don't
 * render on top of each other. Classic interval-partitioning: sort by
 * start, greedily assign each interval to the lowest-numbered sub-row whose
 * last-placed end is on or before this interval's start; open a new
 * sub-row only when every existing one is still occupied.
 *
 * Point milestones aren't intervals and never participate — only same-lane
 * pill/pill overlap triggers stacking (see RoadmapTimeline.tsx).
 */
export interface Interval {
  id: string;
  start: number;
  end: number;
}

export interface StackResult {
  /** Sub-row index (0-based) assigned to each interval id. */
  subRowById: Map<string, number>;
  /** How many sub-rows this lane needs — drives how much extra height to reserve. */
  subRowCount: number;
}

export function stackIntervals(intervals: readonly Interval[]): StackResult {
  const subRowById = new Map<string, number>();
  if (intervals.length === 0) return { subRowById, subRowCount: 0 };

  const ordered = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  // lastEndBySubRow[i] = the end timestamp of the most recently placed
  // interval on sub-row i — the next candidate for that row must start on
  // or after it.
  const lastEndBySubRow: number[] = [];

  for (const interval of ordered) {
    let row = lastEndBySubRow.findIndex((end) => end <= interval.start);
    if (row === -1) {
      row = lastEndBySubRow.length;
      lastEndBySubRow.push(interval.end);
    } else {
      lastEndBySubRow[row] = interval.end;
    }
    subRowById.set(interval.id, row);
  }

  return { subRowById, subRowCount: lastEndBySubRow.length };
}
