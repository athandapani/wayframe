import { describe, expect, it, vi } from "vitest";
import { createZone } from "@/lib/layout/tier-allocator";
import { sweepMidX, SWEEP_STEP, SWEEP_MAX_TRIES } from "./connector-router";

describe("sweepMidX (t25)", () => {
  it("leaves the naive midpoint unchanged when no intervening lane has anything near it", () => {
    const laneBetween = createZone({ tierCount: 1, gap: 4, onExhausted: "overflow" });
    // Nothing placed in laneBetween — genuinely clear.
    const result = sweepMidX(20, 10, [laneBetween], 8, 8);
    expect(result).toEqual({ midX: 20, tries: 0, dodged: true, sameLane: false });
  });

  it("sweeps outward toward the side with more slack until it clears an occupied naive midpoint", () => {
    const laneMid = createZone({ tierCount: 1, gap: 4, onExhausted: "overflow" });
    laneMid.place({ id: "mid1", x: 20, priority: 0, variants: [{ key: "only", width: 34 }] }); // occupies roughly [3, 37]

    // slackRight (20) > slackLeft (4) — sweeps right.
    const result = sweepMidX(20, 10, [laneMid], 4, 20);
    expect(result.dodged).toBe(true);
    expect(result.sameLane).toBe(false);
    expect(result.tries).toBeGreaterThan(0);
    expect(result.tries).toBeLessThanOrEqual(SWEEP_MAX_TRIES);
    expect(result.midX).toBe(20 + result.tries * SWEEP_STEP);
    expect(laneMid.occupiesX(result.midX, 10)).toBe(false);
  });

  it("falls back to the naive midpoint when a wide blocker spans every column within the sweep cap", () => {
    const laneMid = createZone({ tierCount: 1, gap: 4, onExhausted: "overflow" });
    // Wide enough (130) to still cover every candidate within SWEEP_MAX_TRIES * SWEEP_STEP either direction.
    laneMid.place({ id: "wide1", x: 20, priority: 0, variants: [{ key: "only", width: 130 }] });

    const result = sweepMidX(20, 10, [laneMid], 30, 30);
    expect(result).toEqual({ midX: 20, tries: SWEEP_MAX_TRIES, dodged: false, sameLane: false });
  });

  it("never calls occupiesX at all for a same-lane connector (empty interveningZones)", () => {
    const spyZone = { occupiesX: vi.fn(() => true) };
    // Same-lane connectors pass an empty interveningZones list — this test
    // proves the function short-circuits before ever touching a zone, not
    // just that it happens to return a clear result.
    const result = sweepMidX(18, 10, [], 6, 6);
    expect(spyZone.occupiesX).not.toHaveBeenCalled();
    expect(result).toEqual({ midX: 18, tries: 0, dodged: null, sameLane: true });
  });
});
