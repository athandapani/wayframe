import { describe, expect, it } from "vitest";
import { bucketRows, computeFitToScreenRatio, computeLaneRowModel, computeRowHeight, ROW_GAP } from "./lane-rows";

const BASE_OPTS = { baseSlotHeight: 18, row1Floor: 49 };

describe("bucketRows", () => {
  it("puts items with no laneRow into Row 1", () => {
    const buckets = bucketRows([{ laneRow: undefined }, { laneRow: undefined }]);
    expect(buckets).toEqual([{ row: 1, items: [{ laneRow: undefined }, { laneRow: undefined }] }]);
  });

  it("groups explicit rows and sorts by row number regardless of input order", () => {
    const buckets = bucketRows([{ id: "c", laneRow: 5 }, { id: "a", laneRow: undefined }, { id: "b", laneRow: 2 }]);
    expect(buckets.map((b) => b.row)).toEqual([1, 2, 5]);
  });

  it("never emits a row nothing is assigned to — no dead space for skipped numbers", () => {
    const buckets = bucketRows([{ laneRow: 1 }, { laneRow: 5 }]);
    expect(buckets.map((b) => b.row)).toEqual([1, 5]);
  });
});

describe("computeRowHeight", () => {
  it("floors Row 1 at row1Floor even for a single small item — the content-derived floor, not a flat constant", () => {
    const row = computeRowHeight(1, [{ id: "a", start: 0, end: 6 }], BASE_OPTS);
    expect(row.subRowCount).toBe(1);
    expect(row.height).toBe(49);
  });

  it("gives rows 2+ no floor — cost is exactly what's stacked into them", () => {
    const row = computeRowHeight(2, [{ id: "a", start: 0, end: 6 }], BASE_OPTS);
    expect(row.height).toBe(18); // one sub-row at baseSlotHeight, no row1Floor applied
  });

  it("composes a taller sizeFloor as a per-sub-row floor, not a multiply-down by baseSlotHeight", () => {
    // A "lean" lane (small baseSlotHeight) with one tall item still reads tall.
    const leanOpts = { baseSlotHeight: 13.5, row1Floor: 36.75 };
    const row = computeRowHeight(2, [{ id: "a", start: 0, end: 6, sizeFloor: 26 }], leanOpts);
    expect(row.height).toBe(26); // the tall floor wins over the lean baseSlotHeight
  });

  it("still runs the greedy stacker inside an explicit row — assignment overrides which row, never disables collision safety", () => {
    const row = computeRowHeight(2, [
      { id: "a", start: 4, end: 14 },
      { id: "b", start: 4, end: 14 },
    ], BASE_OPTS);
    expect(row.subRowCount).toBe(2);
    expect(row.height).toBe(36); // two stacked sub-rows, each at baseSlotHeight
  });
});

describe("computeLaneRowModel", () => {
  it("moving items to Row 2 pulls them out of Row 1's own collision computation", () => {
    const allInRow1 = computeLaneRowModel(
      [
        { id: "a", start: 0, end: 10 },
        { id: "b", start: 0, end: 10 },
        { id: "c", start: 0, end: 10 },
        { id: "d", start: 0, end: 10 },
      ],
      BASE_OPTS,
    );
    expect(allInRow1.rows).toHaveLength(1);
    expect(allInRow1.rows[0].subRowCount).toBe(4);

    const splitAcrossRows = computeLaneRowModel(
      [
        { id: "a", start: 0, end: 10 },
        { id: "b", start: 0, end: 10 },
        { id: "c", start: 0, end: 10, laneRow: 2 },
        { id: "d", start: 0, end: 10, laneRow: 2 },
      ],
      BASE_OPTS,
    );
    expect(splitAcrossRows.rows).toHaveLength(2);
    expect(splitAcrossRows.rows[0].subRowCount).toBe(2); // Row 1: back down to 2
    expect(splitAcrossRows.rows[1].subRowCount).toBe(2); // Row 2: its own 2
  });

  it("sums row heights plus one ROW_GAP per gap between rows", () => {
    const model = computeLaneRowModel(
      [
        { id: "a", start: 0, end: 5 },
        { id: "b", start: 0, end: 5, laneRow: 2 },
      ],
      BASE_OPTS,
    );
    expect(model.naturalHeight).toBe(49 + 18 + ROW_GAP);
  });

  it("a single-row lane's natural height has no gap added", () => {
    const model = computeLaneRowModel([{ id: "a", start: 0, end: 5 }], BASE_OPTS);
    expect(model.naturalHeight).toBe(49);
  });

  it("a lone item on Row 2 still reserves Row 1's floor, not just Row 2's own height", () => {
    const model = computeLaneRowModel([{ id: "a", start: 0, end: 5, laneRow: 2 }], BASE_OPTS);
    expect(model.rows.map((r) => r.row)).toEqual([1, 2]);
    expect(model.rows[0].height).toBe(49); // synthesized empty Row 1, still floored
    expect(model.rows[0].items).toHaveLength(0);
    expect(model.naturalHeight).toBe(49 + 18 + ROW_GAP);
  });
});

describe("computeFitToScreenRatio", () => {
  it("never shrinks — returns 1 when content already meets or exceeds the viewport", () => {
    expect(computeFitToScreenRatio(500, 400)).toBe(1);
    expect(computeFitToScreenRatio(500, 500)).toBe(1);
  });

  it("expands proportionally into real surplus room", () => {
    expect(computeFitToScreenRatio(200, 400)).toBe(2);
  });

  it("is a no-op (1) with no viewport budget or no content", () => {
    expect(computeFitToScreenRatio(200, 0)).toBe(1);
    expect(computeFitToScreenRatio(0, 400)).toBe(1);
  });
});
