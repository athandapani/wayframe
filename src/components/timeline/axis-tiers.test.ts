import { describe, expect, it } from "vitest";

import { monthSegments, quarterSegments, segmentsForTier, weekSegments, yearSegments } from "./axis-tiers";

const JAN_2026 = Date.UTC(2026, 0, 1);
const APR_2026 = Date.UTC(2026, 3, 1);

describe("axis segment builders over a normal domain", () => {
  it("covers the domain with year, quarter and month segments", () => {
    expect(yearSegments(JAN_2026, APR_2026).map((s) => s.label)).toEqual(["2026"]);
    expect(quarterSegments(JAN_2026, APR_2026).map((s) => s.label)).toEqual(["Q1 '26", "Q2 '26"]);
    expect(monthSegments(JAN_2026, APR_2026).map((s) => s.label)).toEqual(["Jan", "Feb", "Mar", "Apr"]);
    expect(weekSegments(JAN_2026, APR_2026).length).toBeGreaterThan(10);
  });
});

/**
 * wayframe#134's hardening half. Each builder walks a cursor forward until it
 * passes `domainMax`, and every comparison against `NaN` is `false` — so a
 * non-finite domain used to turn those loops unbounded, pushing a segment per
 * iteration until the heap gave out, with nothing thrown to catch.
 *
 * Nothing produces a non-finite domain today (computeDomain is bounded on
 * both branches), so this guards a state that should stay unreachable rather
 * than one that is currently reached. Note that a regression here fails as a
 * *hang*, not an assertion — CI's `timeout-minutes: 10` (added in #133) is
 * what keeps that bounded and loud.
 */
describe("axis segment builders on a non-finite domain (wayframe#134)", () => {
  const nonFinite: [string, number, number][] = [
    ["NaN max", JAN_2026, Number.NaN],
    ["NaN min", Number.NaN, APR_2026],
    ["both NaN", Number.NaN, Number.NaN],
    ["infinite max", JAN_2026, Number.POSITIVE_INFINITY],
  ];

  for (const [label, min, max] of nonFinite) {
    it(`returns no segments rather than looping forever — ${label}`, () => {
      expect(yearSegments(min, max)).toEqual([]);
      expect(quarterSegments(min, max)).toEqual([]);
      expect(monthSegments(min, max)).toEqual([]);
      expect(weekSegments(min, max)).toEqual([]);
      expect(segmentsForTier("quarter", min, max)).toEqual([]);
      expect(segmentsForTier("month", min, max)).toEqual([]);
      expect(segmentsForTier("week", min, max)).toEqual([]);
    });
  }
});
