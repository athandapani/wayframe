// Rendering-layer types for the swimlane/milestone timeline. Mirrors the
// resolved document shape produced by resolveDraftIds() in
// src/lib/extraction/resolve-ids.ts — that function types its output as
// RoadmapDocument with topLevelItems/milestones as Record<string, unknown>[]
// (untyped past shape validation); this is the properly-typed equivalent the
// timeline component actually consumes.
//
// Known gap surfaced while building this component (wayframe issue #7):
// lane-scoped duration pills (only top-level phases carry a date range
// today) have no backing schema field yet — scoped into a follow-up ticket
// rather than added here unilaterally. The milestone short-form label gap
// from the same prototype is resolved below (`Milestone.shortLabel`).

import type { PortfolioTheme } from "@/components/timeline/theme";
import type { Scenario } from "@/lib/scenario/types";

export type Status = "not-started" | "on-track" | "at-risk" | "delayed" | "complete";

/** Executive-view rollup color (wayframe issue #8). */
export type Rag = "green" | "amber" | "red";

/** One calendar day's rollup, snapshotted for the Executive-view trend arrow (wayframe issue #33). */
export interface RollupSnapshot {
  date: string;
  rag: Rag;
  atRiskCount: number;
  delayedCount: number;
}

export interface Swimlane {
  id: string;
  order: number;
  type: "lane" | "separator";
  name: string;
  /**
   * Manual override for the Executive-view RAG rollup — mirrors
   * Milestone.isCriticalPath's manual-flag pattern. Auto (worst-status-wins,
   * see src/components/executive-view/rag.ts) is the default; when set,
   * this wins instead. Decided in the wayfinder map's RAG-governance fog
   * item alongside #8.
   */
  ragOverride?: Rag;
  /**
   * Per-lane colour override (prototype/theme-system). Unset falls back to
   * the active theme's lane palette, cycling by lane index — so switching
   * themes restyles every lane that hasn't been explicitly pinned, and
   * leaves the pinned ones alone. Mirrors ragOverride's placement.
   */
  color?: string;
  /**
   * Append-only, unbounded daily rollup log — one entry written passively per
   * calendar day per lane on document load/view (wayframe issue #33), never
   * through useCorrectionBox's undo-tracked reducer actions (same treatment
   * as its existing "hydrated" case). Powers LaneRollup.trend in
   * src/components/executive-view/rag.ts.
   */
  rollupHistory?: RollupSnapshot[];
  /**
   * Row-height variant — "lean" renders at 75% of the normal lane height
   * (see LANE_HEIGHT in RoadmapTimeline.tsx), for lanes with few milestones
   * that don't need the full vertical tier budget. Document content like
   * `color`, not a viewer preference: a program owner choosing which lanes
   * are lean is an editorial layout call everyone opening the file should
   * see. Undefined/"normal" is the original fixed-height behavior; only
   * "lane" type rows read this (separators keep their own fixed
   * SEPARATOR_HEIGHT regardless).
   */
  density?: "normal" | "lean";
  /**
   * Optional per-lane owner name, shown below the lane name in the header
   * gutter (toggleable via a viewer preference — see use-swimlane-owner-visibility.ts).
   * Document content, same placement reasoning as `color`/`density`.
   */
  owner?: string;
}

/**
 * A named, colored tag a milestone can carry independent of its lane and
 * status (legend categories) — e.g. "Regulatory", "Customer-facing". Lives
 * on the document (Portfolio.legendCategories) since it's shared,
 * editorial vocabulary, not a per-viewer preference. Managed via
 * CategoryManager.tsx, mirroring Swimlane's add/rename/recolor/delete
 * pattern in SwimlaneManager.tsx.
 */
export interface LegendCategory {
  id: string;
  name: string;
  color: string;
}

export type TopLevelItem =
  | {
      id: string;
      type: "milestone";
      title: string;
      date: string;
      status: Status;
      /** Draws a full-height vertical marker line, same mechanism as the always-on Today line (wayframe issue #15). */
      showReferenceLine?: boolean;
      /** Forward-looking slip-risk projection (wayframe#61/#72) — mirrors Milestone.potentialDate; see its doc there. */
      potentialDate?: string;
      /** Per-item drift counter (t13, wayframe#87) — see Milestone.rev's doc for what it's for and why it's optional. */
      rev?: number;
    }
  | { id: string; type: "phase"; title: string; startDate: string; endDate: string; status: Status; potentialDate?: string; rev?: number }
  | { id: string; type: "annotation"; title: string; date: string; message: string; rev?: number };

export interface DependencyEdge {
  id: string; // predecessor milestone id
  showConnector: boolean;
}

export interface Attachment {
  type: "image" | "link";
  url: string;
  label?: string;
}

export interface Milestone {
  id: string;
  laneId: string;
  title: string;
  date: string;
  status: Status;
  percentComplete?: number;
  owner?: string;
  comment?: string;
  dependsOn: DependencyEdge[];
  linksToTopLevelMilestone: string | null;
  /**
   * Resolved/rendered critical-path flag — computed by computeCriticalPath
   * (src/lib/critical-path/compute.ts, wayframe#34/#35) and overlaid with
   * isCriticalPathOverride, then written back into the reducer's state
   * (same "recompute and persist" treatment as the cascade engine, not a
   * derived selector — see #34's resolution for why). Don't hand-set this
   * field directly; set isCriticalPathOverride instead.
   */
  isCriticalPath: boolean;
  /**
   * Manual override for the computed critical-path flag — mirrors
   * Swimlane.ragOverride's placement/pattern. Wins over the computed value
   * when set; undefined defers to computeCriticalPath's result.
   */
  isCriticalPathOverride?: boolean;
  attachments?: Attachment[];
  /**
   * Hand-picked abbreviation for the always-visible timeline marker label.
   * Falls back to deriveShortLabel(title) (initials of significant words)
   * when absent — that auto-derivation is coarser than a hand-picked
   * abbreviation (e.g. "UL 3100 Certification" → "U3C", not "CERT").
   */
  shortLabel?: string;
  /**
   * Baseline date snapshot, set once a correction first shifts `date` away
   * from it (wayframe issue #9/#14) — enables ghost-rendering a slip
   * (`date !== originalDate`). A single baseline, not a full re-baseline
   * history/audit trail (out of scope per the wayfinder map).
   */
  originalDate?: string;
  /**
   * When set (and later than `date`), the milestone renders as a lane-scoped
   * duration pill spanning date→endDate instead of a point-in-time marker
   * (wayframe issue #15) — the same entity, not a separate item type, so a
   * milestone can carry status/owner/dependsOn either way.
   */
  endDate?: string;
  /** Draws a full-height vertical marker line, same mechanism as the always-on Today line (wayframe issue #15). */
  showReferenceLine?: boolean;
  /**
   * Forward-looking slip-risk projection (wayframe#61/#72) — the temporal
   * opposite of `originalDate`: that one snapshots a past baseline once a
   * correction moves `date` away from it, this one projects a possible
   * *future* date without moving anything committed. `date` (the committed/
   * planned date) never changes because of this field.
   *
   * For a point milestone (no `endDate`), this projects `date` forward. For
   * a duration-pill milestone (`endDate` set), it projects `endDate`
   * forward instead — the pill's start is already underway, so "at risk of
   * slipping" means the *end* might land later, not the start.
   */
  potentialDate?: string;
  /**
   * Optional FK into Portfolio.legendCategories — independent of laneId
   * (organizational) and status (state). When
   * use-legend-category-style.ts's category-fill encoding is on, this
   * milestone's marker/pill fill becomes the category's color and `status`
   * moves to the stroke/border instead of the fill (see MilestoneMarker).
   * null/undefined = no category, renders exactly as before.
   */
  categoryId?: string | null;
  /**
   * Per-item drift counter (t13, wayframe#87), bumped by
   * use-correction-box.ts's `stampUpdated`/`bumpChangedRevs` whenever this
   * milestone's fields actually change. Powers a Scenario `modify` override's
   * "plan moved since I set this" staleness check (see
   * src/lib/scenario/resolve.ts's `resolveScenario`) — an override records
   * the Baseline item's `rev` at the moment it's created
   * (`baseRevAtCreation`); if the live item's `rev` has since advanced past
   * that, the override still wins but the conflict is surfaced as
   * informational, not silently swallowed.
   *
   * Optional rather than required, same reasoning as `lastUpdatedAt`: a
   * document persisted before this field existed (or extracted fresh via the
   * AI pipeline, which doesn't set it) just doesn't have one yet.
   * `bumpRev`/every rev-comparison site treats a missing `rev` as 1, so a
   * never-yet-edited item and one explicitly at `rev: 1` behave identically.
   */
  rev?: number;
}

export interface ActionItem {
  id: string;
  text: string;
  owner?: string;
  dueDate?: string;
  done?: boolean;
}

/**
 * One roadmap document (wayframe t11) — what the whole app used to be
 * (`RoadmapData`) before it gained a stable identity of its own so a
 * Portfolio could hold more than one. `schemaVersion`, `companyLogo`, and
 * `legendCategories` moved up to Portfolio (see below) since they're shared
 * across every Program in a future merged view; `generatedAt`/`lastUpdatedAt`
 * stay here, per-Program.
 */
export interface Program {
  id: string;
  /** Independently addressable (wayframe t11) — not embedded in Portfolio.programs by reference, a plain FK back to it. */
  portfolioId: string;
  /** Explicit ordering among sibling Programs in the same Portfolio — same pattern as Swimlane.order. */
  order: number;
  programName: string;
  generatedAt: string;
  /**
   * Last document-changing edit, ISO timestamp (wayframe#40/#49) — distinct
   * from `generatedAt`, which is stamped once at AI-extraction time and
   * never rewritten. Bumped by useCorrectionBox's reducer on every action
   * that already pushes onto the undo `history` stack (AI corrections,
   * manual edits, drags, imports); passive writes that skip the undo stack
   * (`hydrated`, `snapshotRollups`) don't bump it either. Optional because
   * documents persisted before this field existed won't have it until their
   * next edit.
   */
  lastUpdatedAt?: string;
  owner: string;
  reportsTo?: string;
  nextReviewDate?: string;
  bluf: {
    /**
     * Sanitized rich-text HTML (wayframe#38 item 4 / #39), not plain text —
     * a real schema change from the Variant B decision. Rendered via
     * dangerouslySetInnerHTML wherever it's shown; every path that writes
     * one of these fields (the rich-text editor, an opened `.wayframe.json`
     * file) is expected to have gone through sanitizeBlufHtml
     * (lib/rich-text/sanitize.ts) first — plain, tag-free text is valid
     * input here too and round-trips unchanged.
     */
    statement: string;
    bullets: string[];
    /**
     * Free-text panel label (wayframe#43/#52), replacing the hardcoded "So
     * what" heading — same sanitized-rich-text treatment and document-level
     * placement as `statement`/`bullets` above (everyone opening the file
     * sees the same label). Falls back to "So what" when unset.
     */
    label?: string;
    /**
     * Document property, not a viewer preference — unlike BlufCallout's
     * position, which one person likes to read the chart says nothing about
     * the roadmap, but "this callout needs to be bigger, there's a lot to
     * say this week" is a real editorial choice everyone opening the file
     * should see. `height: null` means auto-height (grows to fit content).
     */
    size?: { width: number; height: number | null };
  };
  actionItems: ActionItem[];
  swimlanes: Swimlane[];
  topLevelItems: TopLevelItem[];
  milestones: Milestone[];
}

/**
 * The container a Portfolio's Programs share (wayframe t11) — `schemaVersion`,
 * `companyLogo`, and `legendCategories` live here now instead of on each
 * Program, since they're shared, Portfolio-wide editorial vocabulary (a
 * merged all-Programs view shows one legend/logo, not one per Program).
 *
 * Still deliberately no stored `baseline` field (t13, wayframe#87, per t11's
 * own gist): Baseline isn't a snapshot or a distinct stored shape at all —
 * it's just whatever a Program's `milestones`/`topLevelItems` currently are,
 * with no Scenario applied. Don't add one; a `scenarios` entry that's
 * literally empty is exactly Baseline already. Snapshot is still t31's open
 * job. `scenarios` (below) is the one that landed.
 */
export interface Portfolio {
  id: string;
  /**
   * Monotonic integer (wayframe t1, moved here in t11) — see
   * CURRENT_SCHEMA_VERSION in src/lib/document-file/schema.ts, the only
   * place this is compared or bumped. A document persisted with an older
   * value is upgraded by that file's migration ladder before it's ever
   * validated against this shape.
   */
  schemaVersion: number;
  /**
   * Uploaded company logo (wayframe#46/#54), stored as a data URL — document
   * content, not a viewer preference, so it travels with save/export like
   * the roadmap itself. Same no-blob-store boundary #9's small-fog decision
   * drew for milestone attachments. Rendered inside RoadmapTimeline's SVG
   * chart header, alongside (not replacing) the fixed WayframeLogo mark in
   * the page chrome.
   *
   * `dx`/`dy`/`scale` (wayframe#64) are the freeform drag/resize offset from
   * the default top-left placement — undefined/1 means "hasn't been moved."
   * Document-persisted like `dataUrl` itself, not viewer-local: unlike every
   * other drag override in use-label-overrides.ts, the logo's placement is
   * something the document owner sets once and expects to travel with the
   * file, same reasoning as lane color.
   */
  companyLogo?: { dataUrl: string; dx?: number; dy?: number; scale?: number };
  /**
   * Portfolio-level vocabulary of legend categories a milestone (in any
   * sibling Program) can be tagged with (Milestone.categoryId) — see
   * LegendCategory's doc above. Managed via CategoryManager.tsx; rendered as
   * a second legend row when non-empty (see ChartLegend.tsx).
   */
  legendCategories?: LegendCategory[];
  /**
   * Theme is Portfolio document content (wayframe#88/t18, CONTEXT.md's
   * doctrine #76) — reclassified from a viewer-local localStorage
   * preference so a shared or snapshotted Portfolio renders with the
   * author's intended palette rather than each viewer's own. Optional, like
   * `companyLogo`/`legendCategories`: a Portfolio with no `theme` yet just
   * falls back to `defaultPortfolioTheme` (theme.ts) rather than needing a
   * schema migration. See PortfolioTheme's own doc for the base+override
   * shape and why it beats a whole-Theme blob field under concurrent edits.
   */
  theme?: PortfolioTheme;
  /**
   * Named alternate plans layered over Baseline (t13, wayframe#87) — see
   * Scenario's own doc in src/lib/scenario/types.ts for the sparse
   * delta-list shape and src/lib/scenario/resolve.ts's `resolveScenario` for
   * how one gets merged live against a Program's current state. Optional and
   * order-free, same treatment as `theme`/`legendCategories`: a Portfolio
   * with no Scenarios yet just has Baseline. Portfolio-scoped, not
   * Program-scoped, because a Scenario's deltas can touch any Program in the
   * Portfolio (CONTEXT.md's Scenario glossary entry). Which Scenario a
   * viewer is looking at is deliberately not stored here — that's
   * viewer-local UI state for a future ticket to add, same as CONTEXT.md
   * already documents for Baseline/Scenario selection generally.
   */
  scenarios?: Scenario[];
}

/** The root shape round-tripped through localStorage/file save-open (wayframe t11) — see Portfolio's doc for why Program's shared fields live one level up. */
export interface PortfolioDocument {
  portfolio: Portfolio;
  programs: Program[];
}

/**
 * What the render layer (RoadmapTimeline, MilestoneEditorModal, ChartLegend,
 * CategoryManager) actually consumes — one Program's content reassembled
 * with its Portfolio's shared fields, structurally identical to the flat
 * document shape that existed before t11's Portfolio/Program split. Keeps
 * the split entirely an edit/persistence-layer concern: nothing under
 * src/components/timeline needs to know Portfolio exists. Built by
 * mergeForRender (RoadmapWorkspace.tsx).
 */
export type RenderableProgram = Program & Pick<Portfolio, "companyLogo" | "legendCategories">;

/** Builds the render layer's flat shape from the split edit-time state (wayframe t11) — see RenderableProgram's doc. */
export function mergeForRender(portfolio: Portfolio, program: Program): RenderableProgram {
  return { ...program, companyLogo: portfolio.companyLogo, legendCategories: portfolio.legendCategories };
}

/**
 * Reads a possibly-unset `rev` as 1 (t13, wayframe#87) — the one place that
 * convention is spelled out, since every rev-comparison/bump site (
 * use-correction-box.ts's `bumpChangedRevs`, src/lib/scenario/resolve.ts's
 * `resolveScenario`) needs to agree that a never-yet-edited item and one
 * explicitly at `rev: 1` are the same thing.
 */
export function currentRev(item: { rev?: number }): number {
  return item.rev ?? 1;
}
