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
  isCriticalPath: boolean;
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
  owner: string;
  reportsTo?: string;
  nextReviewDate?: string;
  bluf: { statement: string; bullets: string[] };
  actionItems: ActionItem[];
  swimlanes: Swimlane[];
  topLevelItems: TopLevelItem[];
  milestones: Milestone[];
}
