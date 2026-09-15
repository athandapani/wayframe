// Unified delta-annotation layer (t23, wayframe#96) — one shape, three
// kinds, replacing the two independent slip/at-risk placement passes
// documented as a real bug in docs/research/t9-ghost-tier-inventory.md (a
// milestone with both an originalDate slip and a potentialDate projection
// could get two badges both claiming GHOST_TIER_DY[0]). Ported from the
// validated prototype at prototypes/delta-annotation-96.html (see its
// `PURE MODULE` section) onto real ISO date strings and the real
// Milestone/TopLevelItem types.

import { GHOST_TIER_DY } from "./label-layout";
import { parseDate, formatDateShort } from "./date-utils";
import type { Milestone, TopLevelItem } from "./types";

export type DeltaGhostKind = "slip" | "at-risk" | "scenario-diff";

/** One shape, three kinds (t23, wayframe#96) — see docs/research/t9-ghost-tier-inventory.md for the bug this replaces (two independent tiered-placement passes that didn't know about each other). `from`/`to` are ISO date strings. */
export interface DeltaGhost {
  itemId: string;
  kind: DeltaGhostKind;
  field: string;
  from: string;
  to: string;
}

/** A pre-computed live diff between a Scenario's resolved value and Baseline's current value for one field (t23) — the caller (a future Scenario-switcher ticket) is responsible for computing this by comparing `resolveScenario`'s output against the Program's own Baseline field-by-field; this module stays agnostic of scenario/resolve.ts's Patch-diffing to avoid a layering dependency from the timeline package into the scenario package. */
export interface ScenarioFieldDiff {
  field: string;
  from: string;
  to: string;
}

/** scenario-diff > at-risk > slip. This ladder IS the tier assignment (see layoutItemGhosts) — not a separate rule. */
export const KIND_PRIORITY: Record<DeltaGhostKind, number> = { "scenario-diff": 0, "at-risk": 1, "slip": 2 };

/** Reuses label-layout.ts's real tier budget — no second source of truth for the tier count/offsets. */
export const MAX_DELTA_TIERS = GHOST_TIER_DY.length;

function scenarioGhosts(itemId: string, diffs: ScenarioFieldDiff[]): DeltaGhost[] {
  return diffs.map((d) => ({ itemId, kind: "scenario-diff", field: d.field, from: d.from, to: d.to }));
}

/**
 * Ghosts for a lane Milestone. Slip only applies to a point milestone
 * (`!m.endDate`) — a duration-pill milestone (`endDate` set) never gets a
 * slip ghost today and this function doesn't add one; only at-risk applies
 * to pills, mapped to the end edge (the pill's start is already underway,
 * so "at risk" means the end might land later — mirrors the doc on
 * Milestone.potentialDate in types.ts).
 */
export function ghostsForMilestone(m: Milestone, scenarioDiffs: ScenarioFieldDiff[] = []): DeltaGhost[] {
  const ghosts: DeltaGhost[] = [];
  if (!m.endDate && m.originalDate && m.originalDate !== m.date) {
    ghosts.push({ itemId: m.id, kind: "slip", field: "date", from: m.originalDate, to: m.date });
  }
  if (m.potentialDate) {
    if (m.endDate) {
      ghosts.push({ itemId: m.id, kind: "at-risk", field: "endDate", from: m.endDate, to: m.potentialDate });
    } else {
      ghosts.push({ itemId: m.id, kind: "at-risk", field: "date", from: m.date, to: m.potentialDate });
    }
  }
  ghosts.push(...scenarioGhosts(m.id, scenarioDiffs));
  return ghosts;
}

/** Ghosts for a TopLevelItem's "phase" variant — two independent slip edges (a real gap today, being filled by this ticket) plus at-risk mapped to the end edge. */
export function ghostsForTopLevelItemPhase(
  t: Extract<TopLevelItem, { type: "phase" }>,
  scenarioDiffs: ScenarioFieldDiff[] = [],
): DeltaGhost[] {
  const ghosts: DeltaGhost[] = [];
  if (t.originalStartDate && t.originalStartDate !== t.startDate) {
    ghosts.push({ itemId: t.id, kind: "slip", field: "startDate", from: t.originalStartDate, to: t.startDate });
  }
  if (t.originalEndDate && t.originalEndDate !== t.endDate) {
    ghosts.push({ itemId: t.id, kind: "slip", field: "endDate", from: t.originalEndDate, to: t.endDate });
  }
  if (t.potentialDate) {
    ghosts.push({ itemId: t.id, kind: "at-risk", field: "endDate", from: t.endDate, to: t.potentialDate });
  }
  ghosts.push(...scenarioGhosts(t.id, scenarioDiffs));
  return ghosts;
}

/** Ghosts for a TopLevelItem's "milestone" variant. No slip support (this variant has no originalDate field, and this ticket deliberately doesn't add one — see t23's fork background) — only at-risk and scenario-diff. */
export function ghostsForTopLevelItemMilestone(
  t: Extract<TopLevelItem, { type: "milestone" }>,
  scenarioDiffs: ScenarioFieldDiff[] = [],
): DeltaGhost[] {
  const ghosts: DeltaGhost[] = [];
  if (t.potentialDate) {
    ghosts.push({ itemId: t.id, kind: "at-risk", field: "date", from: t.date, to: t.potentialDate });
  }
  ghosts.push(...scenarioGhosts(t.id, scenarioDiffs));
  return ghosts;
}

export interface PlacedDeltaGhost extends DeltaGhost {
  tier: 0 | 1 | 2;
  labeled: boolean;
}

/**
 * ONE shared placement pass per item (t23) — replaces the two independent
 * `layoutGhostBadges` calls documented as the bug in
 * docs/research/t9-ghost-tier-inventory.md. Sorting by KIND_PRIORITY IS the
 * tier assignment: the highest-priority ghost gets tier 0 (closest,
 * GHOST_TIER_DY[0]) and the text label; the rest escalate outward,
 * unlabeled but still visible as dashed outlines. Only MAX_DELTA_TIERS
 * slots exist — anything beyond that overflows into a count rather than
 * inventing a 4th tier.
 *
 * NOTE for the caller: this only resolves priority among a *single item's
 * own* ghosts. Cross-item horizontal collision (this item's labeled ghost
 * landing too close to a neighboring item's title or another item's
 * labeled ghost) is a separate concern still handled by the existing
 * `layoutGhostBadges` in label-layout.ts, fed only this function's
 * `labeled` (rank-0) ghost per item — see the rendering fork's wiring.
 */
export function layoutItemGhosts(ghosts: DeltaGhost[]): { placed: PlacedDeltaGhost[]; overflowCount: number } {
  const sorted = [...ghosts].sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  const placed = sorted.slice(0, MAX_DELTA_TIERS).map((g, i) => ({ ...g, tier: i as 0 | 1 | 2, labeled: i === 0 }));
  const overflowCount = Math.max(0, sorted.length - MAX_DELTA_TIERS);
  return { placed, overflowCount };
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  return Math.round((parseDate(toDateStr) - parseDate(fromDateStr)) / 86400000);
}

/**
 * Label text per kind — slip and at-risk formats are byte-identical to
 * today's production `ghostBadgeLabel`/`atRiskLabel` in RoadmapTimeline.tsx
 * (the rendering fork removes those two functions and calls this instead,
 * so labels must not change for any document with no scenario-diff ghost).
 */
export function labelForDeltaGhost(ghost: DeltaGhost): string {
  const delta = daysBetween(ghost.from, ghost.to);
  if (ghost.kind === "slip") {
    const late = delta > 0;
    return `${late ? "+" : ""}${delta}d`;
  }
  if (ghost.kind === "at-risk") {
    return `+${Math.max(delta, 0)}d risk · ${formatDateShort(ghost.to)}`;
  }
  return `Scenario: ${formatDateShort(ghost.to)}`;
}
