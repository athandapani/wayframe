// Deterministic, AI-free CSV/XLSX → roadmap merge (Archer delta v1.2) —
// distinct from the existing structured-import path (ImportPanel's "File
// upload" tab), which still flattens rows to text and feeds
// `/api/extract`. This path never calls the model: a column mapping tells
// it exactly which header means what, and "smart merge" is a plain
// (normalized title, lane) match against the live document, not inference.
import type { Milestone, RoadmapData, Status } from "@/components/timeline/types";
import type { ParsedRow } from "./rows-to-text";

export interface ColumnMapping {
  title: string | null;
  lane: string | null;
  date: string | null;
  endDate: string | null;
  status: string | null;
  owner: string | null;
  percentComplete: string | null;
  comment: string | null;
}

export const MAPPABLE_FIELDS: { id: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { id: "title", label: "Title", required: true },
  { id: "lane", label: "Lane" },
  { id: "date", label: "Date", required: true },
  { id: "endDate", label: "End date" },
  { id: "status", label: "Status" },
  { id: "owner", label: "Owner" },
  { id: "percentComplete", label: "% complete" },
  { id: "comment", label: "Comment" },
];

const HEADER_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  title: ["title", "milestone", "task", "name", "item"],
  lane: ["lane", "workstream", "track", "team", "swimlane"],
  date: ["date", "start", "start date", "due", "due date"],
  endDate: ["end date", "end", "finish", "finish date"],
  status: ["status"],
  owner: ["owner", "assignee", "dri", "responsible"],
  percentComplete: ["% complete", "percent complete", "progress", "%", "pct complete"],
  comment: ["comment", "notes", "note", "comments"],
};

/** Case/whitespace-insensitive best-guess mapping from a row of headers — a starting point the user can override, never applied silently. */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => ({ raw: h, key: h.trim().toLowerCase() }));
  function find(field: keyof ColumnMapping): string | null {
    const synonyms = HEADER_SYNONYMS[field];
    const hit = normalized.find((h) => synonyms.includes(h.key));
    return hit?.raw ?? null;
  }
  return {
    title: find("title"),
    lane: find("lane"),
    date: find("date"),
    endDate: find("endDate"),
    status: find("status"),
    owner: find("owner"),
    percentComplete: find("percentComplete"),
    comment: find("comment"),
  };
}

const VALID_STATUSES: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];
function coerceStatus(raw: string | undefined): Status {
  const key = (raw ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  return (VALID_STATUSES as string[]).includes(key) ? (key as Status) : "not-started";
}

/** Accepts "2026-03-01", "3/1/2026", "03/01/2026" — anything Date can parse — and normalizes to YYYY-MM-DD. Returns null if unparseable. */
function coerceDate(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

function normalizeKey(title: string, laneName: string): string {
  return `${title.trim().toLowerCase()}::${laneName.trim().toLowerCase()}`;
}

export interface NewMilestone extends Milestone {
  /** Present only when this milestone belongs to a not-yet-created lane. */
  __newLaneName?: string;
}

export interface RowsToRoadmapResult {
  /** Lanes referenced by name that don't exist yet — created before any add that targets one. */
  newLaneNames: string[];
  adds: NewMilestone[];
  updates: { id: string; title: string; laneName: string; patch: Partial<Pick<Milestone, "date" | "endDate" | "status" | "owner" | "percentComplete" | "comment">>; before: Record<string, string> }[];
  skipped: { row: number; reason: string }[];
}

/**
 * Pure function: never touches ids beyond generating deterministic
 * placeholders for new entities via `makeId` (defaults to a counter, so
 * this stays trivially testable — the real caller passes `nanoid`).
 */
export function rowsToRoadmap(existing: RoadmapData, rows: ParsedRow[], mapping: ColumnMapping, makeId: () => string = (() => { let n = 0; return () => `row-${n++}`; })()): RowsToRoadmapResult {
  const result: RowsToRoadmapResult = { newLaneNames: [], adds: [], updates: [], skipped: [] };
  if (!mapping.title || !mapping.date) {
    return { ...result, skipped: [{ row: 0, reason: "Map at least Title and Date before importing." }] };
  }

  const laneNameById = new Map(existing.swimlanes.filter((l) => l.type === "lane").map((l) => [l.id, l.name]));
  const laneIdByNormalizedName = new Map(existing.swimlanes.filter((l) => l.type === "lane").map((l) => [l.name.trim().toLowerCase(), l.id]));
  const existingByKey = new Map(existing.milestones.map((m) => [normalizeKey(m.title, laneNameById.get(m.laneId) ?? ""), m]));
  const newLaneNamesSeen = new Set<string>();

  rows.forEach((row, i) => {
    const title = (mapping.title ? row[mapping.title] : "")?.trim();
    if (!title) {
      result.skipped.push({ row: i + 1, reason: "No title" });
      return;
    }
    const date = coerceDate(mapping.date ? row[mapping.date] : undefined);
    if (!date) {
      result.skipped.push({ row: i + 1, reason: `"${title}": no parseable date` });
      return;
    }
    const laneName = (mapping.lane ? row[mapping.lane] : "")?.trim() || "Imported";
    const endDateRaw = mapping.endDate ? row[mapping.endDate] : undefined;
    const endDate = endDateRaw?.trim() ? (coerceDate(endDateRaw) ?? undefined) : undefined;
    const status = coerceStatus(mapping.status ? row[mapping.status] : undefined);
    const owner = mapping.owner ? row[mapping.owner]?.trim() || undefined : undefined;
    const commentRaw = mapping.comment ? row[mapping.comment]?.trim() || undefined : undefined;
    const percentRaw = mapping.percentComplete ? row[mapping.percentComplete] : undefined;
    const percentComplete = percentRaw ? Number(percentRaw.replace("%", "")) : undefined;

    const existingLaneId = laneIdByNormalizedName.get(laneName.toLowerCase());
    const key = normalizeKey(title, laneName);
    const match = existingByKey.get(key);

    if (match) {
      const patch: RowsToRoadmapResult["updates"][number]["patch"] = {};
      const before: Record<string, string> = {};
      if (date !== match.date) {
        patch.date = date;
        before.date = match.date;
      }
      if (endDate !== match.endDate && (endDate !== undefined || match.endDate !== undefined)) {
        patch.endDate = endDate;
        before.endDate = match.endDate ?? "";
      }
      if (status !== match.status) {
        patch.status = status;
        before.status = match.status;
      }
      if (owner !== match.owner && (owner !== undefined || match.owner !== undefined)) {
        patch.owner = owner;
        before.owner = match.owner ?? "";
      }
      if (percentComplete !== undefined && !Number.isNaN(percentComplete) && percentComplete !== match.percentComplete) {
        patch.percentComplete = percentComplete;
        before.percentComplete = String(match.percentComplete ?? "");
      }
      if (commentRaw !== match.comment && (commentRaw !== undefined || match.comment !== undefined)) {
        patch.comment = commentRaw;
        before.comment = match.comment ?? "";
      }
      if (Object.keys(patch).length > 0) {
        result.updates.push({ id: match.id, title, laneName, patch, before });
      }
      return;
    }

    if (!existingLaneId && !newLaneNamesSeen.has(laneName.toLowerCase())) {
      newLaneNamesSeen.add(laneName.toLowerCase());
      result.newLaneNames.push(laneName);
    }

    const milestone: NewMilestone = {
      id: makeId(),
      laneId: existingLaneId ?? "",
      title,
      date,
      endDate,
      status,
      owner,
      comment: commentRaw,
      percentComplete: Number.isNaN(percentComplete) ? undefined : percentComplete,
      dependsOn: [],
      linksToTopLevelMilestone: null,
      isCriticalPath: false,
      ...(existingLaneId ? {} : { __newLaneName: laneName }),
    };
    result.adds.push(milestone);
  });

  return result;
}
