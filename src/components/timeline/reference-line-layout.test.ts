import { describe, expect, it } from "vitest";
import { layoutReferenceLines, REF_LINE_TIER_ROW_H, REF_LINE_TRIANGLE_CLEARANCE } from "./reference-line-layout";

// chipWidth(label, charWidth) = Math.max(40, label.length * charWidth + 10).
// With charWidth=5 and a 1-char label, label.length*5+10=15, so every chip
// below is clamped to the 40 floor — keeps the arithmetic simple and
// uniform across fixtures. naturalLeft = x + 8. Default gap = 6.

describe("layoutReferenceLines", () => {
  it("places Today fixed and centered, with topMarginExtra covering the triangle clearance alone when there are no others", () => {
    const { placements, topMarginExtra } = layoutReferenceLines(
      [{ id: "today", x: 100, label: "Today", priority: 0, movable: false }],
      5,
    );
    // chipW = max(40, 5*5+10=35) = 40. naturalLeft = 108. centeredLeft = 100-20=80.
    // dx = centeredLeft - naturalLeft = 80-108 = -28. No others -> topMarginExtra
    // is just the triangle clearance (16), so dy = -16.
    expect(placements.get("today")).toEqual({ dx: -28, dy: -16, chipW: 40, hidden: false });
    expect(topMarginExtra).toBe(REF_LINE_TRIANGLE_CLEARANCE);
  });

  it("lands two well-separated others both on tier 0 with dx: 0", () => {
    const { placements, topMarginExtra } = layoutReferenceLines(
      [
        { id: "o1", x: 0, label: "A", priority: 1, movable: true },
        { id: "o2", x: 200, label: "B", priority: 2, movable: true },
      ],
      5,
    );
    // o1: naturalLeft=8, claims tier0, lastRight[0] becomes 48 (8+40).
    // o2: naturalLeft=208, left=208 > lastRight[0]+gap (48+6=54), so it fits
    // tier0 too, cleanly — no collision, so dx stays 0 for both.
    expect(placements.get("o1")).toEqual({ dx: 0, dy: -0, chipW: 40, hidden: false });
    expect(placements.get("o2")).toEqual({ dx: 0, dy: -0, chipW: 40, hidden: false });
    expect(topMarginExtra).toBe(1 * REF_LINE_TIER_ROW_H);
  });

  it("escalates a colliding second item to tier 1, both still landing cleanly with dx: 0", () => {
    const { placements, topMarginExtra } = layoutReferenceLines(
      [
        { id: "o1", x: 0, label: "A", priority: 1, movable: true },
        { id: "o2", x: 10, label: "B", priority: 2, movable: true },
      ],
      5,
    );
    // o1: naturalLeft=8, tier0, lastRight[0]=48.
    // o2: naturalLeft=18, left=18 <= lastRight[0]+gap=54 -> tier0 collides;
    // tier1 is empty, so o2 escalates there cleanly (left=18=naturalLeft, dx=0).
    expect(placements.get("o1")).toEqual({ dx: 0, dy: -0, chipW: 40, hidden: false });
    expect(placements.get("o2")).toEqual({ dx: 0, dy: -REF_LINE_TIER_ROW_H, chipW: 40, hidden: false });
    expect(topMarginExtra).toBe(2 * REF_LINE_TIER_ROW_H);
  });

  it("nudges a third item colliding at the same x rightward past both occupied tiers, with a hand-computed positive dx", () => {
    const { placements, topMarginExtra } = layoutReferenceLines(
      [
        { id: "o1", x: 0, label: "A", priority: 1, movable: true },
        { id: "o2", x: 0, label: "B", priority: 2, movable: true },
        { id: "o3", x: 0, label: "C", priority: 3, movable: true },
      ],
      5,
    );
    // o1 claims tier0 (lastRight[0]=48), o2 claims tier1 (lastRight[1]=48) —
    // both computed exactly as in the previous test's o1. o3's naturalLeft=8
    // collides with both (8 <= 48+6=54), so it's nudged into the tie-break
    // winner, tier0 (equal lastRight favors the lower index): dx =
    // lastRight[0] (48) + gap (6) - naturalLeft (8) = 46.
    expect(placements.get("o1")).toEqual({ dx: 0, dy: -0, chipW: 40, hidden: false });
    expect(placements.get("o2")).toEqual({ dx: 0, dy: -REF_LINE_TIER_ROW_H, chipW: 40, hidden: false });
    expect(placements.get("o3")).toEqual({ dx: 46, dy: -0, chipW: 40, hidden: false });
    expect(topMarginExtra).toBe(2 * REF_LINE_TIER_ROW_H);
  });

  it("does not read RefLineItem.priority when ordering others — processing order follows array/x order only", () => {
    // o1 is listed first with the numerically LOWER-priority value (5 =
    // lower priority per the field's own doc comment: "Lower number = higher
    // priority"), o2 is listed second with priority 1 (higher priority, were
    // it honored). Both share x=0. If priority were wired into the demand,
    // o2 (priority 1) would be processed first and win tier0. It is not
    // wired — processing follows array order (both x tie), so o1 still wins
    // tier0 and o2 is the one pushed to tier1.
    const { placements } = layoutReferenceLines(
      [
        { id: "o1", x: 0, label: "A", priority: 5, movable: true },
        { id: "o2", x: 0, label: "B", priority: 1, movable: true },
      ],
      5,
    );
    expect(placements.get("o1")).toEqual({ dx: 0, dy: -0, chipW: 40, hidden: false });
    expect(placements.get("o2")).toEqual({ dx: 0, dy: -REF_LINE_TIER_ROW_H, chipW: 40, hidden: false });
  });
});
