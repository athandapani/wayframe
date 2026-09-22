import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useZoomWindow, type ZoomWindow } from "./use-zoom-window";
import { sampleRoadmap } from "./__fixtures__/sample-roadmap";
import type { RenderableProgram } from "./types";

const emptyProgram: RenderableProgram = { ...sampleRoadmap, milestones: [], topLevelItems: [] };

/** Records the `fullDomain` this hook produced on each render it went through. */
function Probe({ data, seen }: { data: RenderableProgram; seen: ZoomWindow[] }) {
  seen.push(useZoomWindow(data).fullDomain);
  return null;
}

function spinPastAMillisecond(): void {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 3) {
    /* deliberate busy-wait — see the test below */
  }
}

/**
 * wayframe#134. `useZoomWindow` keeps an effect that snaps the visible window
 * back out whenever the document's own full domain changes (a milestone added
 * past either edge). That effect is only safe because the same document
 * always yields the same domain — otherwise it re-fires on every render,
 * setting state, which renders again, forever.
 *
 * An empty Program broke exactly that: its fallback domain was derived from
 * `Date.now()`, so it moved every millisecond, and the loop had no fixed
 * point. It terminated only by luck, when two consecutive renders happened to
 * land in the same millisecond — near-always true for a trivial tree on a fast
 * machine (which is why the suite passed locally), and near-never true for the
 * real workspace tree on CI, where it spun for hours and then heap-OOMed.
 *
 * So the invariant under test is identity, not render count: re-rendering the
 * same data at a later wall-clock time must produce the very same `fullDomain`
 * object. A render-count assertion would not do — it passes on a fast machine
 * even with the bug present, for the same reason CI and local disagreed.
 */
describe("useZoomWindow fullDomain stability (wayframe#134)", () => {
  it("yields the identical fullDomain across renders at different wall-clock times, on a genuinely empty Program", () => {
    const seen: ZoomWindow[] = [];
    const { rerender } = render(<Probe data={emptyProgram} seen={seen} />);
    spinPastAMillisecond();
    rerender(<Probe data={emptyProgram} seen={seen} />);

    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.at(-1)).toBe(seen[0]);
  });

  it("does the same on a Program with real content", () => {
    const seen: ZoomWindow[] = [];
    const { rerender } = render(<Probe data={sampleRoadmap} seen={seen} />);
    spinPastAMillisecond();
    rerender(<Probe data={sampleRoadmap} seen={seen} />);

    expect(seen.at(-1)).toBe(seen[0]);
  });
});
