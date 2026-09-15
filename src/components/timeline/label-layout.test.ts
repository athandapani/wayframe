import { describe, expect, it } from "vitest";
import { layoutDateLabels, layoutGhostBadges, DATE_CHAR_W } from "./label-layout";

// Width formula: text.length * charWidth + 6. MIN_GAP (internal, unexported) is 4.

describe("layoutDateLabels", () => {
  it("places a solo item at tier 0 with the full text", () => {
    const out = layoutDateLabels([{ id: "a", x: 0, full: "Jan 1", compact: "1/1" }]);
    expect(out.get("a")).toEqual({ text: "Jan 1", tier: 0 });
  });

  it("escalates the full variant across both real tiers before ever trying the compact variant", () => {
    // charWidth=5 (default). "Jan N" (5 chars) -> width 31, half 15.5.
    // a and b both sit at x=0. a claims tier0 (lastRight[0]=15.5). b's full
    // variant fails tier0 (left=-15.5 <= 15.5+4=19.5) but tier1 is still
    // completely empty, so b's FULL variant fits there directly — variants
    // degrade only after every real tier has been tried for the current
    // variant, not before.
    const out = layoutDateLabels([
      { id: "a", x: 0, full: "Jan 1", compact: "1/1" },
      { id: "b", x: 0, full: "Jan 2", compact: "1/2" },
    ]);
    expect(out.get("a")).toEqual({ text: "Jan 1", tier: 0 });
    expect(out.get("b")).toEqual({ text: "Jan 2", tier: 1 });
  });

  it("degrades to the compact variant once the full variant has failed on every real tier, and lands it cleanly", () => {
    // charWidth=1 for clean arithmetic. a and c pre-occupy tier0 and tier1
    // respectively (both width 10, half 5, right edge -5), so b's full
    // variant (width 10, half 5) fails both tiers: left=-2 <= lastRight+gap
    // (-5+4=-1) on both. Only then is b's compact variant ("B", width 7,
    // half 3.5, left=-0.5) tried — and -0.5 > -1, so it fits cleanly on
    // tier0 (the first tier checked).
    const out = layoutDateLabels(
      [
        { id: "a", x: -10, full: "AAAA", compact: "AAAA" },
        { id: "c", x: -10, full: "CCCC", compact: "CCCC" },
        { id: "b", x: 3, full: "BBBB", compact: "B" },
      ],
      1,
    );
    expect(out.get("a")).toEqual({ text: "AAAA", tier: 0 });
    expect(out.get("c")).toEqual({ text: "CCCC", tier: 1 });
    expect(out.get("b")).toEqual({ text: "B", tier: 0 });
  });

  it("overflows a third, tightly-packed item to tier 2 with compact text (always the narrowest variant)", () => {
    // All three items sit at x=0. a takes tier0 (full), b's full escalates
    // cleanly to the still-empty tier1 (see previous test), so by the time
    // c arrives both real tiers are occupied by full-width siblings and even
    // c's compact variant (width 21, half 10.5, left=-10.5) fails both
    // tiers' threshold (15.5+4=19.5) — c overflows to tier 2 with compact.
    const out = layoutDateLabels([
      { id: "a", x: 0, full: "Jan 1", compact: "1/1" },
      { id: "b", x: 0, full: "Jan 2", compact: "1/2" },
      { id: "c", x: 0, full: "Jan 3", compact: "1/3" },
    ]);
    expect(out.get("a")).toEqual({ text: "Jan 1", tier: 0 });
    expect(out.get("b")).toEqual({ text: "Jan 2", tier: 1 });
    expect(out.get("c")).toEqual({ text: "1/3", tier: 2 });
  });

  it("defaults charWidth to DATE_CHAR_W", () => {
    const withDefault = layoutDateLabels([{ id: "a", x: 0, full: "Jan 1", compact: "1/1" }]);
    const withExplicit = layoutDateLabels([{ id: "a", x: 0, full: "Jan 1", compact: "1/1" }], DATE_CHAR_W);
    expect(withDefault).toEqual(withExplicit);
  });
});

// layoutGhostBadges was migrated onto the shared tier-allocator primitive
// (t24, via createZone directly — blockers must be registered before any
// placement happens, which the allocate() convenience wrapper has no hook
// for). Width formula: text.length * charWidth + 8. These cases prove the
// migration preserved exact behavior: no dedicated unit test existed for
// this function before (only indirect coverage via RoadmapTimeline.test.tsx).
describe("layoutGhostBadges", () => {
  it("places a solo item at tier 0", () => {
    const out = layoutGhostBadges([{ id: "a", x: 0, text: "OK" }], [], 1);
    expect(out.get("a")).toEqual({ text: "OK", tier: 0 });
  });

  it("escalates through both real tiers before overflowing a third tightly-packed item to tier 2", () => {
    // charWidth=1: each 1-char text -> width 9, half 4.5. All three sit at
    // x=0, so each new arrival's left (-4.5) fails the previous occupant's
    // lastRight+gap threshold (4.5+4=8.5) on any tier already claimed.
    const out = layoutGhostBadges(
      [
        { id: "a", x: 0, text: "A" },
        { id: "b", x: 0, text: "B" },
        { id: "c", x: 0, text: "C" },
      ],
      [],
      1,
    );
    expect(out.get("a")).toEqual({ text: "A", tier: 0 });
    expect(out.get("b")).toEqual({ text: "B", tier: 1 });
    expect(out.get("c")).toEqual({ text: "C", tier: 2 });
  });

  it("routes around a blocker that spans both real tiers, forcing straight to tier 2 even with nothing else on screen", () => {
    // A blocker unscoped to any one tier (no opts.tier) blocks every real
    // tier — a wrapped two-line title's block reaching past tier 0 into
    // tier 1's row. Wide enough (w=100) to collide with the item's own
    // width-9 box at x=0 regardless of tier.
    const out = layoutGhostBadges([{ id: "a", x: 0, text: "A" }], [{ x: 0, w: 100 }], 1);
    expect(out.get("a")).toEqual({ text: "A", tier: 2 });
  });

  it("does not collide with a blocker far enough away", () => {
    const out = layoutGhostBadges([{ id: "a", x: 0, text: "A" }], [{ x: 1000, w: 10 }], 1);
    expect(out.get("a")).toEqual({ text: "A", tier: 0 });
  });

  it("defaults charWidth to its own internal ghost char width", () => {
    const withDefault = layoutGhostBadges([{ id: "a", x: 0, text: "OK" }], []);
    const withExplicit = layoutGhostBadges([{ id: "a", x: 0, text: "OK" }], [], 6);
    expect(withDefault).toEqual(withExplicit);
  });
});
