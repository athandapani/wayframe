import { describe, expect, it } from "vitest";
import { layoutBandRows, type BandLayoutItem } from "./band-rows";

function phase(id: string, start: number, end: number, bandRow?: number): BandLayoutItem {
  return { id, start, end, bandRow };
}
function point(id: string, start: number, bandRow?: number): BandLayoutItem {
  return { id, start, end: null, bandRow };
}

describe("layoutBandRows (wayframe#142)", () => {
  it("keeps a band that needs only one row at one sub-row, so nothing moves in an unaffected document", () => {
    const layout = layoutBandRows([phase("a", 0, 10), phase("b", 20, 30)]);
    expect(layout.subRowCount).toBe(1);
    expect(layout.subRowById.get("a")).toBe(0);
    expect(layout.subRowById.get("b")).toBe(0);
  });

  it("stacks overlapping phases automatically, with no bandRow assigned anywhere — the collision this ticket exists to fix", () => {
    const layout = layoutBandRows([phase("a", 0, 30), phase("b", 10, 40), phase("c", 20, 50)]);
    expect(layout.subRowCount).toBe(3);
    expect(new Set([layout.subRowById.get("a"), layout.subRowById.get("b"), layout.subRowById.get("c")]).size).toBe(3);
  });

  it("honours explicit bandRow, and still stacks within a row — assignment picks the row, it never disables collision safety", () => {
    const layout = layoutBandRows([phase("a", 0, 30, 1), phase("b", 10, 40, 1), phase("c", 0, 30, 2)]);
    // Row 1 needs two sub-rows for its overlap; row 2 starts after them.
    expect(layout.subRowById.get("a")).toBe(0);
    expect(layout.subRowById.get("b")).toBe(1);
    expect(layout.subRowById.get("c")).toBe(2);
    expect(layout.subRowCount).toBe(3);
  });

  it("orders by bandRow, not by array order", () => {
    const layout = layoutBandRows([phase("late", 0, 10, 3), phase("early", 0, 10, 1)]);
    expect(layout.subRowById.get("early")!).toBeLessThan(layout.subRowById.get("late")!);
  });

  it("does not renumber sparse rows into contiguous ones — rows 1 and 5 make two rows, not five", () => {
    const layout = layoutBandRows([phase("a", 0, 10, 1), phase("b", 0, 10, 5)]);
    expect(layout.subRowCount).toBe(2);
    expect(layout.subRowById.get("b")).toBe(1);
  });

  it("never stacks point items — they have no interval to overlap by, same as a lane's point milestones", () => {
    const layout = layoutBandRows([point("a", 10), point("b", 10), point("c", 10)]);
    expect(layout.subRowCount).toBe(1);
    expect(layout.subRowById.get("a")).toBe(0);
    expect(layout.subRowById.get("c")).toBe(0);
  });

  it("puts a point item on its assigned row's first sub-row, under the phases that pushed that row down", () => {
    const layout = layoutBandRows([phase("p1", 0, 30, 1), phase("p2", 10, 40, 1), point("pt", 5, 2)]);
    expect(layout.subRowById.get("pt")).toBe(2);
  });

  it("treats an out-of-range bandRow as row 1 rather than opening phantom rows", () => {
    const layout = layoutBandRows([phase("a", 0, 10, 0), phase("b", 20, 30, -4), phase("c", 40, 50, 1.6)]);
    expect(layout.subRowCount).toBe(1);
  });

  it("returns one row for an empty band, so the caller never computes a zero-height strip", () => {
    expect(layoutBandRows([]).subRowCount).toBe(1);
  });

  it("touching phases don't stack — an end exactly on the next start is not an overlap", () => {
    const layout = layoutBandRows([phase("a", 0, 10), phase("b", 10, 20)]);
    expect(layout.subRowCount).toBe(1);
  });
});
