"use client";

// Vertical lane-row virtualization (t41: performance budget & virtualization
// strategy). RoadmapTimeline's SVG is one continuous absolutely-positioned
// canvas with no scroll container of its own below the 50-lane budget (see
// docs/research/t41-performance-budget.md) — the page/window scrolls. Above
// that budget, RoadmapTimeline gives its own container a fixed height and
// scrollbar, and this hook tracks that container's own scroll position so
// off-budget lanes can skip their (real) layout/render cost while still
// reserving their row's height, keeping scroll math correct.
//
// Split into pure, DOM-free logic (computeVisibleRange/isRowInRange) and a
// thin DOM-measurement hook, since vitest.setup.ts stubs ResizeObserver as a
// no-op — clientHeight is always 0 under jsdom, so the DOM half can't be
// meaningfully exercised in a unit test. The pure functions carry the real
// correctness proof; the hook's own "fail open when unmeasured/disabled"
// contract mirrors RoadmapTimeline's existing measuredWidth/MIN_CHART_WIDTH
// fallback for exactly the same reason (~RoadmapTimeline.tsx's containerRef
// ResizeObserver effect).
import { useLayoutEffect, useState, type RefObject } from "react";

export interface VisibleRange {
  top: number;
  bottom: number;
}

/** The scrolled-into-view range, padded by `bufferPx` on both edges so a row doesn't pop in right as it crosses the viewport edge. */
export function computeVisibleRange(scrollTop: number, containerHeight: number, bufferPx: number): VisibleRange {
  return { top: scrollTop - bufferPx, bottom: scrollTop + containerHeight + bufferPx };
}

/** Whether a row spanning [relY, relY + height) overlaps the given range at all. */
export function isRowInRange(relY: number, height: number, range: VisibleRange): boolean {
  return relY + height >= range.top && relY <= range.bottom;
}

/** Generous enough that a fast scroll or a drag-reflow doesn't visibly pop rows in/out. */
export const ROW_VIRTUALIZATION_BUFFER_PX = 400;

export interface UseRowVirtualizationResult {
  /** False whenever virtualization is disabled OR the container hasn't been measured yet (jsdom, or a not-yet-laid-out real DOM node) — the caller must treat this as "render everything," never "render nothing." */
  isActive: boolean;
  /** Fails open to `true` (visible) whenever `isActive` is false. */
  isRowVisible: (relY: number, height: number) => boolean;
}

export function useRowVirtualization(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  bufferPx: number = ROW_VIRTUALIZATION_BUFFER_PX,
): UseRowVirtualizationResult {
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;
    const applyHeight = () => setContainerHeight(el.clientHeight);
    const applyScroll = () => setScrollTop(el.scrollTop);
    applyHeight();
    applyScroll();
    const ro = new ResizeObserver(applyHeight);
    ro.observe(el);
    el.addEventListener("scroll", applyScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", applyScroll);
    };
  }, [enabled, containerRef]);

  const isActive = enabled && containerHeight > 0;
  const range = computeVisibleRange(scrollTop, containerHeight, bufferPx);

  return {
    isActive,
    isRowVisible: (relY: number, height: number) => !isActive || isRowInRange(relY, height, range),
  };
}
