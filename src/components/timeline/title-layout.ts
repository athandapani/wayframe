// Real-title labels for milestone markers (replaces the derived initialism).
//
// Markers used to show an abbreviation built from the initials of the
// title's significant words. It produced unreadable output — "UL 3100
// Certification Issued" became "U3CI", which is a hash, not a label — and
// it leaked punctuation, so "Hazard Analysis (Preliminary)" rendered as
// "HA(" and "Pilot Fleet Uptime >= 95% Sustained" as "PFU>". Hovering
// revealed the full title, but hover doesn't exist on touch and doesn't
// survive the PNG capture or the PPTX export, which is where these charts
// are actually read.
//
// So the title itself is the label, wrapped into whatever horizontal room
// the marker actually has:
//
//  - Markers alternate between two vertical tiers, so each one's nearest
//    competitor for space is two markers away, not one. That roughly
//    doubles the width available to every label at no cost in height.
//  - The budget is the distance to the nearest SAME-TIER neighbour.
//    Different tiers sit at different heights and can overlap horizontally
//    without colliding.
//  - Anything that still doesn't fit truncates with an ellipsis; the full
//    string stays in the hover tooltip.
import { wrapText } from "./wrap-text";

/** Approximate advance width of the marker label face at its rendered size. */
const CHAR_W = 5.4;
/** Fraction of the available gap a label may occupy before it feels crowded. */
const CROWDING = 0.92;
/** Below this a label is noise; a clipped single word beats a split one. */
const MIN_CHARS = 10;
/** Beyond this a single line reads as a sentence rather than a label. */
const MAX_CHARS = 25;
const LONE_LABEL_PX = 190;

export interface TitlePlacement {
  lines: string[];
  tier: 0 | 1;
}

export interface TitleLayoutItem {
  id: string;
  x: number;
  title: string;
  /** Explicit `Milestone.shortLabel` — used verbatim, never wrapped or truncated. */
  shortLabel?: string;
  /** Critical-path milestones earn a second line before anything else does. */
  critical?: boolean;
  /**
   * False for things that take up room but carry no label of their own —
   * duration pills, which print their title inside the bar. They still have
   * to participate in the layout: they occupy horizontal space, and leaving
   * them out let point-marker labels run straight over them.
   */
  labelled?: boolean;
  /** Right-hand extent for a span (a pill's end), so the gap after it is real. */
  endX?: number;
}

export function layoutTitleLabels(items: TitleLayoutItem[], maxLines = 2): Map<string, TitlePlacement> {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const result = new Map<string, TitlePlacement>();

  sorted.forEach((item, i) => {
    const tier: 0 | 1 = (i % 2) as 0 | 1;
    if (item.labelled === false) return;

    // Same-tier neighbours are two positions away in x order. An unlabelled
    // span (a pill) still blocks, and blocks from its nearest edge — its
    // start on the right, its end on the left.
    const prev = i - 2 >= 0 ? sorted[i - 2] : null;
    const next = i + 2 < sorted.length ? sorted[i + 2] : null;
    const gapLeft = prev ? item.x - (prev.endX ?? prev.x) : Infinity;
    const gapRight = next ? next.x - item.x : Infinity;

    // The immediate neighbour is on the other tier and can be overlapped
    // horizontally — but not if it's an unlabelled span, which is drawn in
    // the marker row itself rather than in a label tier.
    const immediatePrev = i - 1 >= 0 ? sorted[i - 1] : null;
    const immediateNext = i + 1 < sorted.length ? sorted[i + 1] : null;
    const blockLeft = immediatePrev?.labelled === false ? item.x - (immediatePrev.endX ?? immediatePrev.x) : Infinity;
    const blockRight = immediateNext?.labelled === false ? immediateNext.x - item.x : Infinity;

    const nearest = Math.min(gapLeft, gapRight, blockLeft, blockRight);
    const available = nearest === Infinity ? LONE_LABEL_PX : nearest * CROWDING;

    const budget = Math.max(MIN_CHARS, Math.min(MAX_CHARS, Math.floor(available / CHAR_W)));

    if (item.shortLabel) {
      result.set(item.id, { lines: [item.shortLabel], tier });
      return;
    }
    result.set(item.id, { lines: wrapText(item.title, budget, maxLines, { breakWords: false }), tier });
  });

  return result;
}

/**
 * Which markers show a label. Dense programmes get unreadable with every
 * milestone labelled, and the answer isn't a smaller font — it's labelling
 * the ones that carry the news. "key" keeps the critical path and anything
 * off-track; everything else still answers on hover and in its editor.
 */
export type LabelDensity = "all" | "key" | "none";

export function shouldLabel(density: LabelDensity, opts: { critical: boolean; offTrack: boolean }): boolean {
  if (density === "none") return false;
  if (density === "all") return true;
  return opts.critical || opts.offTrack;
}
