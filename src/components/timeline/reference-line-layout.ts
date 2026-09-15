// Collision-avoidance for reference-line chips (Today + any milestone/
// top-level-item flagged showReferenceLine, wayframe#15) — decided in
// wayframe#51 after prototyping three approaches live (stagger, suppress,
// tiered) against an engineered collision-stress fixture. Tiered won:
//
// Today is fixed centered over its triangle, `topMarginExtra` above the
// dynamic axis boundary (RoadmapTimeline grows its top margin by exactly
// that much, so Today's chip always lands at the same absolute y regardless
// of how many rows are in use, and the triangle stays visible below it
// rather than the chip painting over it). Every other colliding reference
// line packs into one of two rows between Today and the axis, greedily
// left-to-right the same way label-layout.ts tiers marker labels — a 3-way
// (or more) collision within one row nudges the overflow chip right with a
// leader line rather than fully overlapping. The chart's top margin grows
// only as far as the tallest row actually used (plus Today's fixed triangle
// clearance), so a chart with no colliding reference lines pays almost
// nothing.
//
// The one case this layout doesn't resolve on its own — a reference line
// whose date sits so close to Today's that its row-1 chip runs into Today's
// triangle horizontally, not just vertically — is left to the manual
// drag-to-reposition affordance RoadmapTimeline wires on top of this
// module's placements (see beginRefDrag/refOverrides there), a deliberate
// call made when resolving #51 rather than special-casing it here.
//
// The "others" packing loop is migrated onto the shared tier-allocator
// primitive (t24). It uses a left-anchored placement convention (chips draw
// to the right of their anchor x), unlike the primitive's centered math —
// see the `naturalLeft + chipW / 2` shift below, which makes the centered
// math land on the same real left edge. NOTE: `RefLineItem.priority` is a
// real, populated field at the real call site (RoadmapTimeline.tsx) but is
// deliberately NOT wired into `Demand.priority` here — only a constant 0 is
// used — to keep this migration byte-identical to the pre-migration
// behavior, which never read `it.priority` either. Wiring it in would be a
// real behavior change, out of scope for this consolidation.

import { allocate, type Demand } from "@/lib/layout/tier-allocator";

export interface RefLineItem {
  id: string;
  x: number;
  label: string;
  /** Lower number = higher priority. Today is 0. */
  priority: number;
  movable: boolean;
}

export interface RefLinePlacement {
  dx: number;
  dy: number;
  chipW: number;
  hidden: boolean;
}

export const REF_LINE_TIER_ROW_H = 18;
/** Triangle height (9) + a gap (7) — keeps Today's triangle clear of both its own chip and a close row-1 label below it. */
export const REF_LINE_TRIANGLE_CLEARANCE = 16;

function chipWidth(label: string, charWidth: number): number {
  return Math.max(40, label.length * charWidth + 10);
}

export function layoutReferenceLines(items: RefLineItem[], charWidth: number, gap = 6): { placements: Map<string, RefLinePlacement>; topMarginExtra: number } {
  const result = new Map<string, RefLinePlacement>();
  const today = items.find((it) => !it.movable);
  const others = items.filter((it) => it.movable);

  // Two rows available between Today and the axis. "nudge" reproduces the
  // old fallback of dropping a 3rd colliding chip into whichever row has
  // more room and shoving it right past the already-placed chip.
  const demands: Demand[] = others.map((it) => {
    const chipW = chipWidth(it.label, charWidth);
    const naturalLeft = it.x + 8;
    return { id: it.id, x: naturalLeft + chipW / 2, priority: 0, variants: [{ key: "chip", width: chipW }] };
  });
  const { results } = allocate(demands, { tierCount: 2, gap, onExhausted: "nudge" });

  let maxTier = -1;
  for (const it of others) {
    const chipW = chipWidth(it.label, charWidth);
    const naturalLeft = it.x + 8;
    const placement = results.get(it.id)!;
    const dx = placement.left! - naturalLeft;
    maxTier = Math.max(maxTier, placement.tier);
    result.set(it.id, { dx, dy: -placement.tier * REF_LINE_TIER_ROW_H, chipW, hidden: false });
  }

  const otherRowsUsed = maxTier + 1; // 0, 1, or 2
  const topMarginExtra = (today ? REF_LINE_TRIANGLE_CLEARANCE : 0) + otherRowsUsed * REF_LINE_TIER_ROW_H;

  if (today) {
    const chipW = chipWidth(today.label, charWidth);
    const naturalLeft = today.x + 8;
    const centeredLeft = today.x - chipW / 2;
    result.set(today.id, { dx: centeredLeft - naturalLeft, dy: -topMarginExtra, chipW, hidden: false });
  }

  return { placements: result, topMarginExtra };
}
