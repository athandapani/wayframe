import { describe, expect, it } from "vitest";
import { allocate, createZone, type Demand } from "./tier-allocator";

describe("tier-allocator", () => {
  it("degrades content across all real tiers before ever accepting an escalated tier for the wider variant", () => {
    // tier0 and tier1 are both saturated at x≈-10 (by A and C respectively),
    // so B's WIDE variant fails both real tiers and only then degrades to
    // NARROW, which fits cleanly back on tier0. A naive implementation that
    // tried each variant on tier0 alone before moving to the next tier would
    // instead have escalated the wide variant onto tier1.
    const zone = createZone({ tierCount: 2, gap: 2, onExhausted: "hide" });

    zone.place({ id: "a", x: -10, priority: 1, variants: [{ key: "only", width: 10 }] });
    // C collides with A on tier0, so it's pushed to tier1 at the same x.
    zone.place({ id: "c", x: -10, priority: 1, variants: [{ key: "only", width: 10 }] });

    const b = zone.place({
      id: "b",
      x: 0,
      priority: 2,
      variants: [
        { key: "wide", width: 10 },
        { key: "narrow", width: 2 },
      ],
    });

    // b's narrow variant (width 2) fits cleanly on tier0 at x=0, so its
    // left edge (x - width/2) is a real, meaningful value here.
    expect(b).toEqual({ id: "b", tier: 0, variantKey: "narrow", overflowed: false, hidden: false, left: -1 });
  });

  it("escalates to the zone's onExhausted policy once the narrowest variant fails every real tier", () => {
    const zone = createZone({ tierCount: 1, gap: 0, onExhausted: "overflow" });

    zone.place({ id: "blocker", x: 0, priority: 1, variants: [{ key: "only", width: 1000 }] });

    const b = zone.place({
      id: "b",
      x: 0,
      priority: 2,
      variants: [
        { key: "wide", width: 10 },
        { key: "narrow", width: 2 },
      ],
    });

    expect(b).toEqual({ id: "b", tier: 1, variantKey: "narrow", overflowed: true, hidden: false });
  });

  describe("onExhausted policies", () => {
    it('"overflow" sends an exhausted demand to the unconditional outer tier', () => {
      const zone = createZone({ tierCount: 1, gap: 0, onExhausted: "overflow" });
      zone.place({ id: "blocker", x: 0, priority: 1, variants: [{ key: "only", width: 1000 }] });

      const result = zone.place({ id: "b", x: 0, priority: 2, variants: [{ key: "only", width: 2 }] });

      expect(result.tier).toBe(1);
      expect(result.overflowed).toBe(true);
      expect(result.hidden).toBe(false);
    });

    it('"collapse" with collapseAfter hides an anchor\'s demands beyond the cap with incrementing collapsedRank, and a demand with no anchorId falls through to the unconditional overflow tier instead', () => {
      const zone = createZone({ tierCount: 1, gap: 0, onExhausted: "collapse", collapseAfter: 1 });

      const d1 = zone.place({ id: "d1", x: 0, priority: 1, anchorId: "m1", variants: [{ key: "only", width: 2 }] });
      const d2 = zone.place({ id: "d2", x: 0, priority: 2, anchorId: "m1", variants: [{ key: "only", width: 2 }] });
      const d3 = zone.place({ id: "d3", x: 0, priority: 3, anchorId: "m1", variants: [{ key: "only", width: 2 }] });

      // d1 is a real, uncontested fit at x=0 (width 2), so left = -1.
      expect(d1).toEqual({ id: "d1", tier: 0, variantKey: "only", overflowed: false, hidden: false, left: -1 });
      expect(d2).toEqual({ id: "d2", tier: -1, variantKey: "only", overflowed: true, hidden: true, collapsedRank: 1 });
      expect(d3).toEqual({ id: "d3", tier: -1, variantKey: "only", overflowed: true, hidden: true, collapsedRank: 2 });

      // No anchorId at all: tier0 is still occupied by d1, so this demand's
      // real tiers are exhausted, but with no anchorId it is never
      // collapse-eligible — it must land at the unconditional overflow tier.
      const noAnchor = zone.place({ id: "no-anchor", x: 0, priority: 4, variants: [{ key: "only", width: 2 }] });
      expect(noAnchor).toEqual({ id: "no-anchor", tier: 1, variantKey: "only", overflowed: true, hidden: false });
    });

    it('"nudge" shoves an exhausted demand into whichever real tier has the smaller lastRight', () => {
      const zone = createZone({ tierCount: 2, gap: 2, onExhausted: "nudge" });

      // tier0 ends up with lastRight = 5, tier1 with lastRight = 10.
      zone.place({ id: "a", x: 0, priority: 1, variants: [{ key: "only", width: 10 }] });
      zone.place({ id: "b", x: 0, priority: 2, variants: [{ key: "only", width: 20 }] });

      const result = zone.place({ id: "c", x: 0, priority: 3, variants: [{ key: "only", width: 2 }] });

      expect(result.nudged).toBe(true);
      expect(result.hidden).toBe(false);
      expect(result.overflowed).toBe(false);
      // tier0 had the smaller lastRight (5 < 10), so it's the nudge target —
      // a real tier, not the hidden (-1) or overflow (tierCount) sentinels.
      expect(result.tier).toBe(0);
      // Nudged left edge = lastRight[0] (5) + gap (2) = 7 — NOT its natural
      // x-2=-2 — proving `left` reflects the actual shoved-right position a
      // caller (e.g. reference-line-layout.ts's dx) needs, not the demand's
      // raw natural position.
      expect(result.left).toBe(7);
    });

    it('"hide" drops an exhausted demand with tier -1 and no collapsedRank', () => {
      const zone = createZone({ tierCount: 1, gap: 0, onExhausted: "hide" });
      zone.place({ id: "blocker", x: 0, priority: 1, variants: [{ key: "only", width: 1000 }] });

      const result = zone.place({ id: "b", x: 0, priority: 2, variants: [{ key: "only", width: 2 }] });

      expect(result).toEqual({ id: "b", tier: -1, variantKey: "only", overflowed: true, hidden: true });
      expect(result.collapsedRank).toBeUndefined();
    });
  });

  it("counts collapse eligibility by the anchor's full placement history, not only by calls that exhausted real tiers", () => {
    // Anchor m1 has 4 siblings, spread far apart in x so none of them would
    // ever collide with each other. collapseAfter caps the anchor at 2. The
    // first two go through cleanly (no collision, real placement) — but the
    // 3rd and 4th must STILL collapse purely because the anchor's running
    // count has exceeded the cap, even though (ignoring the anchor budget)
    // they would have fit a real tier with room to spare. A buggy
    // implementation that only incremented its counter on the
    // tier-exhaustion branch would let d3/d4 place normally instead.
    const zone = createZone({ tierCount: 2, gap: 2, onExhausted: "collapse", collapseAfter: 2 });

    const d1 = zone.place({ id: "d1", x: 0, priority: 1, anchorId: "m1", variants: [{ key: "only", width: 2 }] });
    const d2 = zone.place({ id: "d2", x: 100, priority: 2, anchorId: "m1", variants: [{ key: "only", width: 2 }] });
    const d3 = zone.place({ id: "d3", x: 200, priority: 3, anchorId: "m1", variants: [{ key: "only", width: 2 }] });
    const d4 = zone.place({ id: "d4", x: 300, priority: 4, anchorId: "m1", variants: [{ key: "only", width: 2 }] });

    expect(d1.hidden).toBe(false);
    expect(d2.hidden).toBe(false);
    expect(d3).toEqual({ id: "d3", tier: -1, variantKey: "only", overflowed: true, hidden: true, collapsedRank: 1 });
    expect(d4).toEqual({ id: "d4", tier: -1, variantKey: "only", overflowed: true, hidden: true, collapsedRank: 2 });
  });

  it("a registered blocker on a real tier prevents a placement lastRight alone would have allowed, forcing escalation", () => {
    const zone = createZone({ tierCount: 2, gap: 2, onExhausted: "overflow" });
    // Nothing has been placed yet, so lastRight alone would let anything
    // through on either tier — only the blocker stands in the way of tier0.
    zone.registerBlocker(0, 10, { tier: 0 });

    const result = zone.place({ id: "b", x: 0, priority: 1, variants: [{ key: "only", width: 2 }] });

    expect(result.tier).toBe(1);
    expect(result.overflowed).toBe(false);
    expect(result.hidden).toBe(false);
  });

  it("blockers never gate the unconditional overflow tier", () => {
    const zone = createZone({ tierCount: 1, gap: 0, onExhausted: "overflow" });
    zone.registerBlocker(0, 1000, { tier: 0 });

    const result = zone.place({ id: "b", x: 0, priority: 1, variants: [{ key: "only", width: 2 }] });

    expect(result).toEqual({ id: "b", tier: 1, variantKey: "only", overflowed: true, hidden: false });
  });

  it("a tier-scoped blocker only blocks that tier; an unscoped blocker blocks every real tier", () => {
    const scoped = createZone({ tierCount: 2, gap: 2, onExhausted: "hide" });
    scoped.registerBlocker(0, 10, { tier: 0 });
    const scopedResult = scoped.place({ id: "b", x: 0, priority: 1, variants: [{ key: "only", width: 2 }] });
    // tier0 is blocked, but tier1 is untouched by a tier-scoped blocker.
    expect(scopedResult.tier).toBe(1);
    expect(scopedResult.hidden).toBe(false);

    const unscoped = createZone({ tierCount: 2, gap: 2, onExhausted: "hide" });
    unscoped.registerBlocker(0, 10);
    const unscopedResult = unscoped.place({ id: "b", x: 0, priority: 1, variants: [{ key: "only", width: 2 }] });
    // No opts.tier means the blocker reaches every real tier.
    expect(unscopedResult).toEqual({ id: "b", tier: -1, variantKey: "only", overflowed: true, hidden: true });
  });

  describe("allocate()", () => {
    it("orders placement by (priority, x): a lower priority number is processed first regardless of x, winning its own slot when it doesn't actually contest, and winning a shared slot outright when it does", () => {
      // Group 1 (uncontested): "a" (priority 1, x=100) sorts before "b"
      // (priority 2, x=0) even though "b" sits at the lower x. Because tier0
      // is a single left-to-right shelf, "a" being processed first still
      // pushes tier0's claimed edge past x=100 before "b" is ever
      // considered — so "b", despite never spatially overlapping "a", can't
      // reclaim tier0 and instead wins a real (non-hidden) placement on
      // tier1. Both come away with a genuine slot; neither is defeated.
      const uncontested: Demand[] = [
        { id: "a", x: 100, priority: 1, variants: [{ key: "only", width: 2 }] },
        { id: "b", x: 0, priority: 2, variants: [{ key: "only", width: 2 }] },
      ];
      const { results: uncontestedResults } = allocate(uncontested, { tierCount: 2, gap: 2, onExhausted: "hide" });
      expect(uncontestedResults.get("a")).toMatchObject({ tier: 0, hidden: false });
      expect(uncontestedResults.get("b")).toMatchObject({ tier: 1, hidden: false });

      // Group 2 (contested): only one real tier exists, and "d" sits at a
      // LOWER x than "c" (so an x-only sort would process "d" first) — but
      // "c" has the lower priority number, so priority wins the sort and
      // "c" is processed first, claiming the zone's only tier. "d" is
      // processed second, collides with what "c" already claimed, and is
      // left with nothing.
      const contested: Demand[] = [
        { id: "d", x: 599.5, priority: 2, variants: [{ key: "only", width: 2 }] },
        { id: "c", x: 600, priority: 1, variants: [{ key: "only", width: 2 }] },
      ];
      const { results: contestedResults } = allocate(contested, { tierCount: 1, gap: 2, onExhausted: "hide" });
      expect(contestedResults.get("c")).toMatchObject({ tier: 0, hidden: false });
      expect(contestedResults.get("d")).toMatchObject({ tier: -1, hidden: true });
    });

    it("returns the same zone it built internally, so further place() calls contest the state allocate() already created", () => {
      const demands: Demand[] = [{ id: "a", x: 0, priority: 1, variants: [{ key: "only", width: 10 }] }];
      const { zone } = allocate(demands, { tierCount: 1, gap: 2, onExhausted: "overflow" });

      // "a" occupies tier0 up to x=5 (width 10 centered on x=0). A fresh
      // demand at x=0 should collide with that state and overflow — proving
      // the returned zone isn't a disconnected throwaway.
      const result = zone.place({ id: "b", x: 0, priority: 2, variants: [{ key: "only", width: 2 }] });

      expect(result).toEqual({ id: "b", tier: 1, variantKey: "only", overflowed: true, hidden: false });
    });
  });

  describe("occupiesX() (t25)", () => {
    it("is true when a query interval overlaps a placed item's claimed interval, respecting gap", () => {
      const zone = createZone({ tierCount: 1, gap: 2, onExhausted: "hide" });
      zone.place({ id: "a", x: 0, priority: 1, variants: [{ key: "only", width: 10 }] }); // claims [-5, 5]

      expect(zone.occupiesX(6, 1)).toBe(true); // [5,7] — right at the gap-padded edge (5+2=7)
      expect(zone.occupiesX(20, 1)).toBe(false); // far clear
    });

    it("is false over a genuinely clear column", () => {
      const zone = createZone({ tierCount: 2, gap: 2, onExhausted: "hide" });
      zone.place({ id: "a", x: -100, priority: 1, variants: [{ key: "only", width: 10 }] });

      expect(zone.occupiesX(0, 5)).toBe(false);
    });

    it("is true over a tier-scoped registered blocker even though nothing was ever placed there", () => {
      const zone = createZone({ tierCount: 2, gap: 2, onExhausted: "hide" });
      zone.registerBlocker(50, 20, { tier: 0 });

      expect(zone.occupiesX(50, 1)).toBe(true);
    });

    it("is true over an any-tier registered blocker", () => {
      const zone = createZone({ tierCount: 2, gap: 2, onExhausted: "hide" });
      zone.registerBlocker(50, 20);

      expect(zone.occupiesX(50, 1)).toBe(true);
    });

    it("does not mutate zone state — a later place() at the queried column is unaffected by intervening occupiesX calls", () => {
      const zone = createZone({ tierCount: 1, gap: 2, onExhausted: "hide" });

      // Repeated read-only queries over an empty zone.
      expect(zone.occupiesX(0, 5)).toBe(false);
      expect(zone.occupiesX(0, 5)).toBe(false);

      // The zone is still pristine: a fresh placement at x=0 gets a clean fit.
      const result = zone.place({ id: "a", x: 0, priority: 1, variants: [{ key: "only", width: 4 }] });
      expect(result).toEqual({ id: "a", tier: 0, variantKey: "only", overflowed: false, hidden: false, left: -2 });
    });
  });
});
