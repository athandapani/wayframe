/**
 * Shared tier allocator — a single, configurable primitive for "pack
 * horizontal demands into N vertical tiers, degrade content before
 * escalating tiers, escalate tiers before giving up" packing.
 *
 * Four+ places in `src/components/timeline/` each grew their own bespoke
 * version of this loop: `layoutDateLabels`/`layoutGhostBadges`
 * (`label-layout.ts`), `layoutReferenceLines` (`reference-line-layout.ts`),
 * and phase-band ghost collision (a gap identified but not yet built). See
 * `docs/research/t9-ghost-tier-inventory.md` for the inventory that
 * surfaced the duplication. This module is the extracted primitive all of
 * those should eventually be migrated onto — that migration is separate,
 * later work; this module has no consumers yet.
 *
 * The design was validated against 6 real scenarios pulled from this
 * codebase's own behavior in a throwaway prototype
 * (`prototype/shared-tier-allocator-101` branch,
 * `prototypes/shared-tier-allocator-101.html`). This is a faithful,
 * typed port of that validated algorithm — not a redesign.
 *
 * ## The doctrine: degrade → escalate → policy
 *
 * Every placement follows the same three-step ladder, tried in order:
 *
 *   1. **Degrade** — try each of the item's content variants (e.g. full
 *      date text, then compact date text) against the tiers that already
 *      exist. Shrinking content is cheaper, visually, than losing
 *      position, so every variant is tried before any tier is escalated.
 *   2. **Escalate** — only once every variant has failed on every real
 *      tier does the search widen; but escalation here just means "the
 *      real tiers are exhausted," not a specific action.
 *   3. **Policy** — what happens once real tiers are exhausted is a
 *      property of the *zone* (its `onExhausted` policy: overflow into an
 *      unconditional outer slot, collapse into a "+N more" budget, nudge
 *      into the least-crowded tier, or hide outright), never a property
 *      of the individual item.
 *
 * Nothing in this codebase stated this as a unified rule before t24 — the
 * four independent implementations each encoded it implicitly and
 * inconsistently. This module is the first place it's said explicitly.
 */

export type OnExhaustedPolicy = "overflow" | "collapse" | "nudge" | "hide";

export interface ZoneConfig {
  tierCount: number;
  gap: number;
  onExhausted: OnExhaustedPolicy;
  /** Only meaningful when onExhausted === "collapse". Defaults to tierCount when omitted. */
  collapseAfter?: number;
}

export interface Variant {
  key: string;
  width: number;
}

export interface Demand {
  id: string;
  x: number;
  /** Lower number = higher priority = placed first (contests fewer already-claimed slots). */
  priority: number;
  /**
   * Present only for demands whose siblings should compete for a shared
   * collapse budget under a "collapse" zone (e.g. every ghost belonging
   * to one milestone shares an anchorId). Demands with no anchorId are
   * never collapse-eligible even in a "collapse" zone — they always fall
   * through to the unconditional overflow tier instead once real tiers
   * are exhausted.
   */
  anchorId?: string;
  /**
   * Tried in order — content degrades (e.g. full date text → compact
   * date text) before the zone ever escalates tiers or invokes its
   * onExhausted policy. Must be non-empty; the LAST variant is always
   * what a starved/overflowed/collapsed/hidden placement is labeled
   * with (the narrowest one).
   */
  variants: Variant[];
}

export interface Placement {
  id: string;
  /**
   * -1 when hidden (collapsed under "collapse", or dropped under
   * "hide"). config.tierCount when overflowed to the unconditional outer
   * slot (only reachable under "overflow" or "collapse" policies).
   * Otherwise 0..tierCount-1, a real tier.
   */
  tier: number;
  variantKey: string;
  overflowed: boolean;
  hidden: boolean;
  /**
   * Set only when onExhausted === "nudge" and this item was shoved right
   * within an already-claimed tier rather than cleanly fitting a fresh
   * spot.
   */
  nudged?: boolean;
  /**
   * Set only when this placement is hidden AND onExhausted === "collapse"
   * (never set for a "hide"-policy hidden placement) — this item's
   * 1-based rank past collapseAfter among its own anchorId's siblings,
   * e.g. 1 for the first sibling that didn't fit, for a caller building
   * a "+N more" badge.
   */
  collapsedRank?: number;
  /**
   * The actual chosen left edge (`item.x - variant.width / 2` for a clean
   * fit; the shoved-right edge for a "nudge" placement) — set only when
   * `tier` is a real tier (0..tierCount-1), undefined for a hidden or
   * overflowed/unconditional-slot placement, where "left edge" isn't a
   * meaningful concept (those render at a fixed offset keyed by `tier`
   * alone, same as every existing production caller does today). Exists
   * so a caller whose rendering needs an explicit horizontal shift amount
   * (e.g. reference-line-layout.ts's `dx`, which is 0 for a clean fit and
   * the shove amount for a nudge) can compute
   * `placement.left! - item.x + variant.width / 2` without re-deriving
   * the zone's internal shelf state itself.
   */
  left?: number;
}

export interface Zone {
  place(item: Demand): Placement;
  /**
   * Publishes fixed occupancy another placement must route around (e.g.
   * a title's already-claimed block). `opts.tier` omitted blocks every
   * real tier — appropriate for an obstacle tall enough to reach into
   * more than one tier's row. Never consulted for the unconditional
   * overflow tier (config.tierCount) — matches every existing production
   * caller's behavior (a badge/date that's already given up and dumped
   * to the outer slot never re-checks blockers).
   */
  registerBlocker(x: number, w: number, opts?: { tier?: number }): void;
}

interface Blocker {
  x: number;
  w: number;
}

export function createZone(config: ZoneConfig): Zone {
  const lastRight: number[] = Array(config.tierCount).fill(-Infinity);
  const tierBlockers: Blocker[][] = Array.from({ length: config.tierCount }, () => []);
  const anyTierBlockers: Blocker[] = [];
  const anchorCounts = new Map<string, number>();

  function registerBlocker(x: number, w: number, opts?: { tier?: number }): void {
    const b: Blocker = { x, w };
    if (opts && opts.tier != null) tierBlockers[opts.tier].push(b);
    else anyTierBlockers.push(b);
  }

  function collidesBlockers(tier: number, left: number, right: number): boolean {
    const hit = (b: Blocker) => left < b.x + b.w / 2 + config.gap && right > b.x - b.w / 2 - config.gap;
    return tierBlockers[tier].some(hit) || anyTierBlockers.some(hit);
  }

  function fits(tier: number, left: number, right: number): boolean {
    if (left <= lastRight[tier] + config.gap) return false;
    return !collidesBlockers(tier, left, right);
  }

  function place(item: Demand): Placement {
    // Collapse is decided by how many demands this anchor has already put
    // through the zone, not by whether *this* call happens to exhaust the
    // real tiers — a same-x sibling always collides with every tier its
    // predecessors already claimed, so counting only the exhaustion
    // callbacks would undercount by exactly the tiers that DID fit.
    if (config.onExhausted === "collapse" && item.anchorId != null) {
      const cap = config.collapseAfter != null ? config.collapseAfter : config.tierCount;
      const count = (anchorCounts.get(item.anchorId) || 0) + 1;
      anchorCounts.set(item.anchorId, count);
      if (count > cap) {
        const narrowest = item.variants[item.variants.length - 1];
        return {
          id: item.id,
          tier: -1,
          variantKey: narrowest.key,
          overflowed: true,
          hidden: true,
          collapsedRank: count - cap,
        };
      }
    }
    // Content degradation is tried across ALL real tiers before the zone
    // ever escalates to its starvation policy — shrinking is cheaper
    // (visually) than losing position.
    for (const variant of item.variants) {
      for (let t = 0; t < config.tierCount; t++) {
        const left = item.x - variant.width / 2;
        const right = item.x + variant.width / 2;
        if (fits(t, left, right)) {
          lastRight[t] = right;
          return { id: item.id, tier: t, variantKey: variant.key, overflowed: false, hidden: false, left };
        }
      }
    }
    // Real tiers exhausted for every variant — what happens next is a
    // property of the ZONE (its onExhausted policy), never the item.
    const narrowest = item.variants[item.variants.length - 1];
    switch (config.onExhausted) {
      case "overflow":
      case "collapse":
        return { id: item.id, tier: config.tierCount, variantKey: narrowest.key, overflowed: true, hidden: false };
      case "nudge": {
        let best = 0;
        for (let t = 1; t < config.tierCount; t++) if (lastRight[t] < lastRight[best]) best = t;
        const nudgedLeft = lastRight[best] + config.gap;
        lastRight[best] = nudgedLeft + narrowest.width;
        return { id: item.id, tier: best, variantKey: narrowest.key, overflowed: false, hidden: false, nudged: true, left: nudgedLeft };
      }
      case "hide":
        return { id: item.id, tier: -1, variantKey: narrowest.key, overflowed: true, hidden: true };
      default: {
        const exhaustive: never = config.onExhausted;
        throw new Error("unknown onExhausted policy: " + exhaustive);
      }
    }
  }

  return { place, registerBlocker };
}

/**
 * The shared entry point every consumer uses for the common case: sort
 * demands by (priority, x) ascending, feed them one-by-one into a fresh
 * zone. Returns the zone too (not just results) so a caller can keep
 * placing more demands into the SAME zone afterward, or register more
 * blockers before/after — e.g. a caller that needs to interleave
 * title-blocker-registration with ghost-placement across two different
 * demand sets sharing one zone.
 */
export function allocate(demands: Demand[], config: ZoneConfig): { results: Map<string, Placement>; zone: Zone } {
  const zone = createZone(config);
  const sorted = [...demands].sort((a, b) => a.priority - b.priority || a.x - b.x);
  const results = new Map<string, Placement>();
  for (const d of sorted) results.set(d.id, zone.place(d));
  return { results, zone };
}
