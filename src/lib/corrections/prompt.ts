import type Anthropic from "@anthropic-ai/sdk";
import { NAMED_LANE_COLORS } from "./schema";

export interface CorrectionMilestoneRef {
  id: string;
  title: string;
  laneName: string;
  date: string;
  status: string;
}

export interface CorrectionLaneRef {
  id: string;
  name: string;
}

/** Full swimlane row (wayframe#58) — unlike CorrectionLaneRef, includes separators, since deletes and the rename/reorder swimlaneOps kinds can target either type. */
export interface CorrectionSwimlaneRef {
  id: string;
  name: string;
  type: "lane" | "separator";
}

/** Real top-level (PROGRAM band) item, so a delete request can resolve one (wayframe#58). */
export interface CorrectionTopLevelItemRef {
  id: string;
  title: string;
}

export interface CorrectionInput {
  milestones: CorrectionMilestoneRef[];
  /** Real lanes (type === "lane" only) the request can place a new milestone into (wayframe#38 item 1 / #39's add_milestone op) or recolor/ragOverride (wayframe#58). */
  lanes: CorrectionLaneRef[];
  /** Every swimlane row, including separators (wayframe#58) — what deletes and swimlaneOps' rename/reorder kinds resolve targets against. */
  swimlanes: CorrectionSwimlaneRef[];
  /** Real PROGRAM-band items a delete request can target (wayframe#58). */
  topLevelItems: CorrectionTopLevelItemRef[];
  correctionText: string;
}

export const CORRECTION_TOOL_NAME = "propose_correction";

/**
 * Reference resolution moved server-side per issue #9: a hand-driven
 * prototype using client-side keyword matching produced a real false
 * positive ("mark pilot site 3 complete" matched 3 unrelated milestones
 * that all happened to share the word "pilot"). Calling this out
 * explicitly in the prompt, rather than trusting the model to notice the
 * ambiguity on its own.
 *
 * Widened past date/status to the full manual-editor field set, plus an
 * add-milestone op and a structured ambiguous-tie response (wayframe#38
 * item 1 / #39) — the scope-widening prototype found the field being
 * edited was never the risky part; the risk lives entirely in reference
 * resolution, so refuse-ambiguous needs to hold at the wider scope exactly
 * as it did at the narrow one, not be assumed to generalize unstated.
 */
const SYSTEM_PROMPT = `You are resolving a short free-text correction request against an existing program roadmap, and proposing targeted edits.

You will be given a list of milestones (each with a real id, title, swimlane name, current date, and current status), a list of swimlanes (id, name, and type — lane or separator), a list of PROGRAM-band top-level items (id and title), and a correction request in plain English (e.g. "push certification milestones by two weeks", "mark pilot site 3 go-live complete", "rename new milestone to Manufacturing plan release", "set the owner of UL 3100 Certification to K. Simmons", "add a manufacturing plan release milestone to the Manufacturing lane in Q1 '27", "delete the field pilot deployments lane", "add a new lane called Regulatory Affairs", "move the Safety lane up", "recolor the Manufacturing lane blue", or "flag the Safety lane red").

Your job is to read the request carefully and call the ${CORRECTION_TOOL_NAME} tool exactly once. Rules:

- Resolve which milestone(s) the request refers to using the *whole* picture for each candidate — id, title, and swimlane name together — not a single shared keyword. Milestones can share a word (e.g. several "pilot" milestones across unrelated lanes) without all being what the request means; only include a milestone in "ops" if you are confident it is one of the things the request is actually about.
- The request can target any of these fields, not just date/status: date, status, title (rename), owner, comment, percentComplete, shortLabel, isCriticalPathOverride (flag/unflag as critical path). Whichever field the request names, resolve it the same way — the field being edited doesn't change how carefully you need to resolve the subject.
- "newValue" is always a string, whatever the field's real type. For date: the shifted ISO date (YYYY-MM-DD), computed from that milestone's *current* date. For status: the matching status value. For percentComplete: an integer 0-100 written as a string (e.g. "75"). For isCriticalPathOverride: the literal string "true" or "false". For title/owner/comment/shortLabel: the literal new text (empty string clears owner/comment/shortLabel).
- If the request asks to add a new milestone, use "addMilestones" instead of "ops" — this is a different op kind, not a field edit. A lane is required: resolve it from the request against the given lane list, and only include the add if you're confident which lane is meant. If no lane can be confidently resolved, omit the add entirely rather than guessing one. A date is optional: include one if the request specifies or implies it (e.g. "in Q1 '27"), otherwise set date to null — the client will create the milestone and let a person fill in the date, the same as the app's own "add milestone" button.
- If the request asks to delete something, use "deletes": { targetId, entityType, reason }. entityType is "milestone", "topLevelItem", or "swimlane" (a lane or a group-band separator) — pick whichever the request is actually about, and resolve targetId against the matching list (milestones, top-level items, or swimlanes). Deleting a swimlane deletes everything in it; the client handles that cascade, you just name the swimlane.
- If the request asks to manage swimlanes (not milestones), use "swimlaneOps": { kind, ..., reason }. kind is one of:
  - "add": create a new swimlane. Needs swimlaneType ("lane" or "separator" — separator is a group-header band, not a milestone-holding lane) and name. No targetId (it doesn't exist yet).
  - "rename": needs targetId (any swimlane) and the new name.
  - "reorder": needs targetId (any swimlane) and delta: -1 to move it up one row, 1 to move it down one row. Only ever -1 or 1 — for "move it to the top", resolve how many single-row reorders that takes and, if more than one op is needed, emit multiple reorder ops in the same response.
  - "recolor": needs targetId (a real lane, not a separator) and color, which must be one of: ${NAMED_LANE_COLORS.join(", ")}. Never emit a hex value or any other color word — if the request names a color outside this list, pick the closest match from the list, or omit the op if none is close.
  - "ragOverride": needs targetId (a real lane) and rag, one of green/amber/red/auto. "auto" clears the manual override back to the computed rollup (e.g. "let the Manufacturing lane's status compute automatically again").
- Do not compute cascading effects on other, non-matched milestones — that is handled separately, deterministically, from the dependency graph. Only emit ops for milestones the request text is actually about.
- A milestone already at the target value (e.g. already "complete" when asked to mark it complete) still gets an op if the request is unambiguously about it — the caller decides whether to skip a no-op change.
- If a milestone is a plausible textual match but you're deliberately excluding it (e.g. it's already complete and a date-shift wouldn't make sense), list it in "skipped" with a short reason instead of silently dropping it.
- If the request's subject phrase ties equally across multiple milestones — genuinely ambiguous, not just "several plausible candidates" — do not guess and do not emit an op for any of them. Instead set "ambiguous": { field, reason, candidates: [{ targetId, newValue }, ...] } listing every tied milestone with what its newValue would be if it turned out to be the one meant. This lets the person pick the one they meant without retyping the request. Only use this for a genuine tie; a request that clearly names one milestone over several superficially-similar ones should still resolve normally.
- If you cannot confidently resolve the request to any milestone, lane, swimlane, or top-level item, and it isn't a genuine tie either, return empty "ops", "addMilestones", "deletes", "swimlaneOps", and "skipped" rather than guessing.
- Never invent a targetId or laneId that wasn't in the lists you were given.`;

function formatMilestoneList(milestones: CorrectionMilestoneRef[]): string {
  return milestones
    .map((m) => `- id=${m.id} | title="${m.title}" | lane="${m.laneName}" | date=${m.date} | status=${m.status}`)
    .join("\n");
}

function formatLaneList(lanes: CorrectionLaneRef[]): string {
  return lanes.map((l) => `- id=${l.id} | name="${l.name}"`).join("\n");
}

function formatSwimlaneList(swimlanes: CorrectionSwimlaneRef[]): string {
  return swimlanes.map((l) => `- id=${l.id} | name="${l.name}" | type=${l.type}`).join("\n");
}

function formatTopLevelItemList(items: CorrectionTopLevelItemRef[]): string {
  return items.map((t) => `- id=${t.id} | title="${t.title}"`).join("\n");
}

export function buildCorrectionMessages(input: CorrectionInput): Anthropic.MessageParam[] {
  return [
    {
      role: "user",
      content: `Milestones:\n${formatMilestoneList(input.milestones)}\n\nLanes (for adding a milestone, recoloring, or a RAG override):\n${formatLaneList(input.lanes)}\n\nAll swimlanes, including separators (for delete/rename/reorder):\n${formatSwimlaneList(input.swimlanes)}\n\nTop-level (PROGRAM band) items:\n${formatTopLevelItemList(input.topLevelItems)}\n\nCorrection request: "${input.correctionText}"`,
    },
  ];
}

export function systemPrompt(): string {
  return SYSTEM_PROMPT;
}
