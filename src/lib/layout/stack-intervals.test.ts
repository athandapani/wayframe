import { describe, expect, it } from "vitest";
import { stackIntervals } from "./stack-intervals";

describe("stackIntervals", () => {
  it("returns nothing for an empty input", () => {
    const result = stackIntervals([]);
    expect(result.subRowCount).toBe(0);
    expect(result.subRowById.size).toBe(0);
  });

  it("keeps every non-overlapping interval on sub-row 0", () => {
    const result = stackIntervals([
      { id: "a", start: 0, end: 10 },
      { id: "b", start: 10, end: 20 },
      { id: "c", start: 25, end: 30 },
    ]);
    expect(result.subRowCount).toBe(1);
    expect(result.subRowById.get("a")).toBe(0);
    expect(result.subRowById.get("b")).toBe(0);
    expect(result.subRowById.get("c")).toBe(0);
  });

  it("stacks a fully-overlapping chain onto one sub-row each", () => {
    const result = stackIntervals([
      { id: "a", start: 0, end: 20 },
      { id: "b", start: 0, end: 20 },
      { id: "c", start: 0, end: 20 },
    ]);
    expect(result.subRowCount).toBe(3);
    const rows = new Set([result.subRowById.get("a"), result.subRowById.get("b"), result.subRowById.get("c")]);
    expect(rows).toEqual(new Set([0, 1, 2]));
  });

  it("reuses a freed sub-row for a partially-overlapping set", () => {
    // a: 0-10, b: 5-15 (overlaps a -> row 1), c: 12-20 (fits on row 0 once a ends)
    const result = stackIntervals([
      { id: "a", start: 0, end: 10 },
      { id: "b", start: 5, end: 15 },
      { id: "c", start: 12, end: 20 },
    ]);
    expect(result.subRowCount).toBe(2);
    expect(result.subRowById.get("a")).toBe(0);
    expect(result.subRowById.get("b")).toBe(1);
    expect(result.subRowById.get("c")).toBe(0);
  });
});
