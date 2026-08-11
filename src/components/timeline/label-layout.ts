// Label-collision-avoidance for milestone markers. Two independent tiered
// rows per lane: dates below the marker (layoutDateLabels) and ghost badges
// above it (layoutGhostBadges, wayframe#47 — titles themselves moved to the
// wrap-aware alternating layout in title-layout.ts). Each escalates through:
// tier 0 (closest) -> tier 1 (staggered further) -> tier 2 (pulled out
// further still, connected back to its marker with a thin leader line,
// drawn by the caller). Dates additionally shrink to a compact "8/4" format
// before resorting to tier 2.

export const DATE_TIER_DY = [20, 32, 44] as const; // below marker center
/**
 * Above marker center — tier 0 sits roughly where the fixed cx+12/cy-18
 * offset used to. Tier 2's long reach clears a neighboring tier-1 title
 * (title-layout.ts's LABEL_TIER_LIFT can put one as high as ~cy-52) since
 * blockers aren't tier-checked at tier 2 — it's the unconditional pull-out,
 * same as layoutDateLabels'/layoutReferenceLines' tier 2 (wayframe#47,
 * caught live against the collision-stress fixture: tier 1's shorter reach
 * still landed on a neighbor's tier-1 title).
 */
export const GHOST_TIER_DY = [-18, -30, -70] as const;

const GHOST_CHAR_W = 6;
export const DATE_CHAR_W = 5;
const MIN_GAP = 4;

export interface TierPlacement {
  text: string;
  tier: 0 | 1 | 2;
}

export interface GhostBadgeItem {
  id: string;
  x: number;
  text: string;
}

/** A fixed obstacle a ghost badge must route around — a lane's already-placed tier-0 title block (wayframe#47). */
export interface GhostBlocker {
  x: number;
  w: number;
}

/**
 * Folds ghost badges into the same tiered-escalation idiom layoutDateLabels
 * uses, seeded with `blockers` (each lane's tier-0 title occupancy) so a
 * badge competes for the same collision-free slots titles already claimed
 * instead of landing on one — the fold-in half of wayframe#47. Blockers are
 * checked at both candidate tiers: a wrapped two-line title's block is tall
 * enough to reach past tier 0 into tier 1's row too, so a badge that
 * collides with one skips straight to tier 2, clear of either.
 */
export function layoutGhostBadges(items: GhostBadgeItem[], blockers: GhostBlocker[], charWidth = GHOST_CHAR_W): Map<string, TierPlacement> {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const lastRight = [-Infinity, -Infinity];
  const result = new Map<string, TierPlacement>();
  const collidesBlocker = (left: number, right: number) => blockers.some((b) => left < b.x + b.w / 2 + MIN_GAP && right > b.x - b.w / 2 - MIN_GAP);
  for (const it of sorted) {
    const w = it.text.length * charWidth + 8;
    let placed = false;
    for (const t of [0, 1] as const) {
      const left = it.x - w / 2;
      const right = it.x + w / 2;
      if (left > lastRight[t] + MIN_GAP && !collidesBlocker(left, right)) {
        lastRight[t] = right;
        result.set(it.id, { text: it.text, tier: t });
        placed = true;
        break;
      }
    }
    if (!placed) result.set(it.id, { text: it.text, tier: 2 });
  }
  return result;
}

/** `charWidth` takes fontScale's `metricsScale` when the viewer scales text up — see layoutTitleLabels (wayframe#42/#50). */
export function layoutDateLabels(
  items: { id: string; x: number; full: string; compact: string }[],
  charWidth = DATE_CHAR_W,
): Map<string, TierPlacement> {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const lastRight = [-Infinity, -Infinity];
  const result = new Map<string, TierPlacement>();
  for (const it of sorted) {
    let placed = false;
    for (const mode of ["full", "compact"] as const) {
      const text = mode === "full" ? it.full : it.compact;
      const w = text.length * charWidth + 6;
      for (const t of [0, 1] as const) {
        const left = it.x - w / 2;
        if (left > lastRight[t] + MIN_GAP) {
          lastRight[t] = it.x + w / 2;
          result.set(it.id, { text, tier: t });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) result.set(it.id, { text: it.compact, tier: 2 });
  }
  return result;
}
