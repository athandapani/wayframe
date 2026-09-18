import { describe, expect, it } from "vitest";
import { computeVisibleRange, isRowInRange } from "./use-row-virtualization";

describe("computeVisibleRange", () => {
  it("pads scrollTop..scrollTop+containerHeight by bufferPx on both edges", () => {
    expect(computeVisibleRange(1000, 800, 400)).toEqual({ top: 600, bottom: 2200 });
  });

  it("supports a zero buffer", () => {
    expect(computeVisibleRange(1000, 800, 0)).toEqual({ top: 1000, bottom: 1800 });
  });

  it("clamps to a negative top when scrollTop is near zero (no special-casing needed by callers)", () => {
    expect(computeVisibleRange(0, 800, 400)).toEqual({ top: -400, bottom: 1200 });
  });
});

describe("isRowInRange", () => {
  const range = { top: 600, bottom: 2200 };

  it("is true for a row fully inside the range", () => {
    expect(isRowInRange(1000, 100, range)).toBe(true);
  });

  it("is false for a row fully above the range", () => {
    expect(isRowInRange(0, 100, range)).toBe(false);
  });

  it("is false for a row fully below the range", () => {
    expect(isRowInRange(2300, 100, range)).toBe(false);
  });

  it("is true for a row straddling the top edge", () => {
    expect(isRowInRange(550, 100, range)).toBe(true); // 550..650 overlaps 600..2200
  });

  it("is true for a row straddling the bottom edge", () => {
    expect(isRowInRange(2150, 100, range)).toBe(true); // 2150..2250 overlaps 600..2200
  });

  it("is true when a row's bottom edge lands exactly on the range's top boundary", () => {
    expect(isRowInRange(500, 100, range)).toBe(true); // relY+height === range.top (600)
  });

  it("is false when a row starts just past the range's top boundary minus its own height", () => {
    expect(isRowInRange(499, 100, range)).toBe(false); // relY+height === 599 < 600
  });

  it("is true when a row's top edge lands exactly on the range's bottom boundary", () => {
    expect(isRowInRange(2200, 100, range)).toBe(true); // relY === range.bottom (2200)
  });

  it("is false when a row starts just past the range's bottom boundary", () => {
    expect(isRowInRange(2201, 100, range)).toBe(false);
  });

  it("is true for a zero-height row exactly at either boundary", () => {
    expect(isRowInRange(600, 0, range)).toBe(true);
    expect(isRowInRange(2200, 0, range)).toBe(true);
  });
});
