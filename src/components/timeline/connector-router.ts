/**
 * Dependency-connector midpoint routing (t25, wayframe#103) — a zone-aware
 * column sweep, not general pathfinding. `buildConnectorPath`'s elbow/
 * s-curve/rounded formulas are unchanged; the only thing this module
 * decides is which x feeds them as `midX`.
 *
 * Ported faithfully from the validated `prototype/connector-line-rewrite-103`
 * throwaway prototype's pure module — not a redesign.
 *
 * The naive geometric midpoint is checked against every lane's tier-zone
 * (`createZone`'s new `occupiesX` query, t24) strictly BETWEEN the
 * connector's two endpoint lanes. If already clear (or the connector is
 * same-lane, with no "between" to cross at all), nothing changes. If
 * occupied, it sweeps outward in fixed `SWEEP_STEP` steps toward whichever
 * side has more slack, capped at `SWEEP_MAX_TRIES`; exhausting the cap
 * falls back to the naive midpoint rather than build a zigzag path — a rare
 * accepted overlap beats routing noise around every chip on the chart.
 */

import type { Zone } from "@/lib/layout/tier-allocator";

export const SWEEP_STEP = 8;
export const SWEEP_MAX_TRIES = 6;

export interface SweepResult {
  midX: number;
  tries: number;
  /**
   * null when same-lane (no intervening zone ever exists to check); true
   * when the naive midpoint was already clear or the sweep found a clear
   * column; false when the sweep exhausted every try and fell back to the
   * naive midpoint.
   */
  dodged: boolean | null;
  sameLane: boolean;
}

/**
 * `interveningZones` — the tier-zones for every lane strictly between the
 * connector's two endpoints; pass `[]` for a same-lane connector (there is
 * no "between" to cross, and this function then skips `occupiesX` entirely
 * rather than checking and finding nothing). `slackLeft`/`slackRight` bias
 * which direction the sweep tries first — whichever side has more room.
 */
export function sweepMidX(naiveMidX: number, halfWidth: number, interveningZones: Zone[], slackLeft: number, slackRight: number): SweepResult {
  const busyAt = (x: number) => interveningZones.some((z) => z.occupiesX(x, halfWidth));

  if (interveningZones.length === 0) {
    return { midX: naiveMidX, tries: 0, dodged: null, sameLane: true };
  }
  if (!busyAt(naiveMidX)) {
    return { midX: naiveMidX, tries: 0, dodged: true, sameLane: false };
  }

  const dir = slackRight >= slackLeft ? 1 : -1;
  for (let i = 1; i <= SWEEP_MAX_TRIES; i++) {
    const candidate = naiveMidX + dir * SWEEP_STEP * i;
    if (!busyAt(candidate)) {
      return { midX: candidate, tries: i, dodged: true, sameLane: false };
    }
  }
  // Exhausted every try in the biased direction — fall back to the naive
  // midpoint rather than build a zigzag path around the obstacle.
  return { midX: naiveMidX, tries: SWEEP_MAX_TRIES, dodged: false, sameLane: false };
}
