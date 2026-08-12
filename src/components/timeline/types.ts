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
    }
  | { id: string; type: "phase"; title: string; startDate: string; endDate: string; status: Status }
  | { id: string; type: "annotation"; title: string; date: string; message: string };

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
}

export interface ActionItem {
  id: string;
  text: string;
  owner?: string;
  dueDate?: string;
  done?: boolean;
}

export interface RoadmapData {
  schemaVersion: string;
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
  /**
   * Uploaded company logo (wayframe#46/#54), stored as a data URL — document
   * content, not a viewer preference, so it travels with save/export like
   * the roadmap itself. Same no-blob-store boundary #9's small-fog decision
   * drew for milestone attachments. Rendered inside RoadmapTimeline's SVG
   * chart header, alongside (not replacing) the fixed WayframeLogo mark in
   * the page chrome.
   */
  companyLogo?: { dataUrl: string };
}
