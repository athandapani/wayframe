"use client";

// Zoom & fit-to-screen mechanism (wayframe t10, prototyped on
// prototype/zoom-mechanism-84 as wayframe#84 — see that ticket's gist for the
// three variants compared). Winning approach is the hybrid: a requested
// window updates immediately as a live CSS scaleX()/translateX() preview
// (cheap, approximate — markers distort slightly), then 300ms after the last
// change it "settles" into a real recompute — RoadmapTimeline re-renders with
// `domainOverride` forcing the render domain to exactly the requested window
// (bypassing computeDomain's own ±14-day content-derived pad, which would
// otherwise silently floor how tight a window can render) plus the data
// filtered down to that window so the collision/label passes only ever see
// what's actually in view.
//
// Session-only state, not a persisted viewer preference like the other
// use-*.ts hooks here (see CONTEXT.md's document-content-vs-viewer-preference
// doctrine) — a zoom window is closer to scroll position than to a display
// setting, and resets whenever the underlying document identity changes.
import { useEffect, useMemo, useRef, useState } from "react";

import { computeDomain } from "./RoadmapTimeline";
import type { RenderableProgram, TopLevelItem } from "./types";
import { parseDate } from "./date-utils";

const DAY_MS = 86400000;
const MIN_SPAN_MS = 7 * DAY_MS;
const COMMIT_DEBOUNCE_MS = 300;

export interface ZoomWindow {
  min: number;
  max: number;
}

function clampWindow(full: ZoomWindow, w: ZoomWindow): ZoomWindow {
  let { min, max } = w;
  if (max - min < MIN_SPAN_MS) max = min + MIN_SPAN_MS;
  if (min < full.min) {
    max += full.min - min;
    min = full.min;
  }
  if (max > full.max) {
    min -= max - full.max;
    max = full.max;
  }
  return { min: Math.max(full.min, min), max: Math.min(full.max, max) };
}

function windowsEqual(a: ZoomWindow, b: ZoomWindow): boolean {
  return a.min === b.min && a.max === b.max;
}

/**
 * Data filtered down to a zoom window, for the settled/committed render —
 * dependency connectors to a filtered-out predecessor are already drawn
 * defensively (RoadmapTimeline skips an edge whose `from` milestone isn't
 * found), so dropping items outside the window is safe.
 */
export function filterToWindow(data: RenderableProgram, w: ZoomWindow): RenderableProgram {
  const inRange = (iso: string) => {
    const t = parseDate(iso);
    return t >= w.min && t <= w.max;
  };
  const milestones = data.milestones.filter((m) => inRange(m.date) || (m.endDate && inRange(m.endDate)));
  const topLevelItems = data.topLevelItems.filter((t: TopLevelItem) => {
    if (t.type === "phase") return inRange(t.startDate) || inRange(t.endDate) || (parseDate(t.startDate) <= w.min && parseDate(t.endDate) >= w.max);
    return inRange(t.date);
  });
  return { ...data, milestones, topLevelItems };
}

export interface UseZoomWindowResult {
  /** Full document domain (computeDomain's own ±14-day pad included) — what "Reset" zooms back out to. */
  fullDomain: ZoomWindow;
  /** True once the requested window is narrower than the full domain — RoadmapView only needs to filter/override when this is true. */
  active: boolean;
  /** Live requested window — drives the slider UI immediately, before it settles. */
  window: ZoomWindow;
  /** Debounced-settled window — what domainOverride/filterToWindow actually render. */
  committedWindow: ZoomWindow;
  /** True for COMMIT_DEBOUNCE_MS after the last change, while the live CSS preview stands in for the not-yet-recomputed committed render. */
  previewing: boolean;
  /**
   * Ratio of committed span to requested span, and where the requested
   * window's start sits within the committed one (0-1) — a consumer with a
   * measured pixel width turns these into `translateX(px) scaleX(scale)`,
   * same math as the wayframe#84 prototype's Variant C. Identity (1, 0) once
   * settled.
   */
  previewScale: number;
  previewOffsetFraction: number;
  setWindow: (w: ZoomWindow) => void;
  setStart: (min: number) => void;
  setEnd: (max: number) => void;
  zoomBy: (factor: number) => void;
  pan: (dir: 1 | -1) => void;
  reset: () => void;
}

export function useZoomWindow(data: RenderableProgram): UseZoomWindowResult {
  const { domainMin, domainMax } = computeDomain(data);
  const fullDomain = useMemo<ZoomWindow>(() => ({ min: domainMin, max: domainMax }), [domainMin, domainMax]);

  const [window, setWindowRaw] = useState<ZoomWindow>(fullDomain);
  const [committedWindow, setCommittedWindow] = useState<ZoomWindow>(fullDomain);
  // Derived, not its own state — committedWindow lags window by design (it
  // only catches up once the debounce below fires), so "not yet equal" is
  // exactly "previewing", with no separate flag to fall out of sync.
  const previewing = !windowsEqual(window, committedWindow);
  const prevFullDomain = useRef(fullDomain);

  // The document's own domain can grow (a milestone added past either edge) —
  // only snap the live window back out when it was already at full extent,
  // so an in-progress zoom isn't yanked out from under the user by an
  // unrelated edit elsewhere in the document.
  useEffect(() => {
    if (windowsEqual(prevFullDomain.current, fullDomain)) return;
    const wasFull = windowsEqual(window, prevFullDomain.current);
    prevFullDomain.current = fullDomain;
    if (wasFull) {
      setWindowRaw(fullDomain);
      setCommittedWindow(fullDomain);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullDomain]);

  useEffect(() => {
    if (!previewing) return;
    const t = setTimeout(() => setCommittedWindow(window), COMMIT_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.min, window.max, previewing]);

  const setWindow = (w: ZoomWindow) => setWindowRaw(clampWindow(fullDomain, w));
  const setStart = (min: number) => setWindow({ min, max: window.max });
  const setEnd = (max: number) => setWindow({ min: window.min, max });
  const zoomBy = (factor: number) => {
    const center = (window.min + window.max) / 2;
    const halfSpan = ((window.max - window.min) / 2) * factor;
    setWindow({ min: center - halfSpan, max: center + halfSpan });
  };
  const pan = (dir: 1 | -1) => {
    const span = window.max - window.min;
    setWindow({ min: window.min + dir * span * 0.5, max: window.max + dir * span * 0.5 });
  };
  const reset = () => setWindow(fullDomain);

  const committedSpan = committedWindow.max - committedWindow.min;
  const requestedSpan = window.max - window.min;
  const scale = committedSpan / requestedSpan;
  const offsetWithinCommitted = (window.min - committedWindow.min) / committedSpan;

  return {
    fullDomain,
    active: !windowsEqual(committedWindow, fullDomain),
    window,
    committedWindow,
    previewing,
    previewScale: previewing ? scale : 1,
    previewOffsetFraction: previewing ? offsetWithinCommitted : 0,
    setWindow,
    setStart,
    setEnd,
    zoomBy,
    pan,
    reset,
  };
}
