import type Anthropic from "@anthropic-ai/sdk";
import { NAMED_LANE_COLORS } from "./schema";

export interface CorrectionMilestoneRef {
  id: string;
  title: string;
  laneName: string;
  date: string;
  status: string;
  /** Given so an attachmentOps "remove" can reference a real 0-based index (wayframe#60) — omitted (or empty) when the milestone has none. */
  attachments?: { type: "image" | "link"; url: string; label?: string }[];
}

/** The document-level fields blufOp/documentOp can edit (wayframe#55/#60) — given so the model has the current values to reason against, same as milestones/lanes/etc. above. */
export interface CorrectionDocumentRef {
  programName: string;
  owner: string;
  reportsTo?: string;
  nextReviewDate?: string;
  bluf: { statement: string; bullets: string[]; label?: string };
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

/**
 * Real top-level (PROGRAM band) item — originally just {id, title} so a
 * delete request could resolve one (wayframe#58), widened to the item's full
 * shape (wayframe#59) so the model can also resolve edit (topLevelItemOps)
 * and create (addTopLevelItems) requests against real dates/status/message,
 * not just titles. Mirrors TopLevelItem's own discriminated union.
 */
export type CorrectionTopLevelItemRef =
  | { id: string; type: "milestone"; title: string; date: string; status: string }
  | { id: string; type: "phase"; title: string; startDate: string; endDate: string; status: string }
  | { id: string; type: "annotation"; title: string; date: string; message: string };

export interface CorrectionInput {
  milestones: CorrectionMilestoneRef[];
  /** Real lanes (type === "lane" only) the request can place a new milestone into (wayframe#38 item 1 / #39's add_milestone op) or recolor/ragOverride (wayframe#58). */
  lanes: CorrectionLaneRef[];
  /** Every swimlane row, including separators (wayframe#58) — what deletes and swimlaneOps' rename/reorder kinds resolve targets against. */
  swimlanes: CorrectionSwimlaneRef[];
  /** Real PROGRAM-band items a delete request can target (wayframe#58). */
  topLevelItems: CorrectionTopLevelItemRef[];
  /** Document-header + BLUF fields blufOp/documentOp can edit (wayframe#60). */
  document: CorrectionDocumentRef;
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

You will be given a list of milestones (each with a real id, title, swimlane name, current date, current status, and any existing attachments), a list of swimlanes (id, name, and type — lane or separator), a list of PROGRAM-band top-level items (id, type — milestone/phase/annotation — title, and that type's own date fields/status/message), the document header + BLUF panel's current values (programName, owner, reportsTo, nextReviewDate, bluf.statement/bullets/label), and a correction request in plain English (e.g. "push certification milestones by two weeks", "mark pilot site 3 go-live complete", "rename new milestone to Manufacturing plan release", "set the owner of UL 3100 Certification to K. Simmons", "add a manufacturing plan release milestone to the Manufacturing lane in Q1 '27", "delete the field pilot deployments lane", "add a new lane called Regulatory Affairs", "move the Safety lane up", "recolor the Manufacturing lane blue", "flag the Safety lane red", "rename the PROGRAM band's GA milestone to General Availability", "add a Board Review annotation to the PROGRAM band on March 3rd noting the funding decision", "make UL 3100 Certification depend on the Safety Plan", "show a connector line from Fleet Coordination to Autonomy Release Candidate", "attach a link to the site survey PDF on the Field Pilot milestone", "update the so-what statement to say we're on track for GA", "rename the program to Atlas Mobile Robot Platform", or "set the next review date to March 3rd").

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
- If the request asks to edit a PROGRAM-band top-level item (not a lane milestone), use "topLevelItemOps": { targetId, field, newValue, reason }. targetId must be a real top-level-item id. field is one of: title, status, date (milestone/annotation only), startDate (phase only), endDate (phase only), showReferenceLine (milestone only, "true"/"false"), message (annotation only). Only use a field that actually applies to that item's type — check its type in the given list first.
- If the request asks to add a new PROGRAM-band item, use "addTopLevelItems": { kind, title, date, endDate, message, reason }. kind is "milestone", "phase", or "annotation". date is the ISO date if given/implied, otherwise null (the client creates it and opens it for a person to fill in, same as addMilestones). endDate only applies to kind="phase" (its end date — also null if unresolved). message is required for kind="annotation" (its short note) and unused otherwise.
- If the request asks to add or remove a dependency between two milestones, use "dependencyOps": { dependentId, dependencyId, add, showConnector, reason }. dependentId is the milestone that depends on dependencyId (the predecessor) — "X depends on Y" or "X comes after Y" means dependentId=X, dependencyId=Y; "Y blocks X" or "Y must finish before X" means the same thing. add is true to create the edge, false to remove it. showConnector is optional — set it true only when the request also asks for (or clearly implies) a visible connector line on the chart, e.g. "draw a line from X to Y" or "make Y a visible predecessor of X"; omit it for a plain dependency request, which defaults to drawing the connector.
- If the request asks to add or remove an attachment (image or link) on a milestone, use "attachmentOps": { targetId, action, type, url, label, index, reason }. action="add" needs type ("image" or "link") and url; label is optional. action="remove" needs index — the attachment's 0-based position in that milestone's attachment list, given to you alongside each milestone that has any. Never re-list a milestone's existing attachments just to add one more — each op adds or removes exactly one.
- If the request is about the BLUF ("so what") panel itself — its headline statement, its bullet list, or its heading label — use "blufOp": { statement, bullets, label, reason }, given the panel's current values below. Only include the field(s) the request actually changes; "bullets", if included, must be the complete replacement list (add/remove/edit a bullet by giving the whole list back), not just the changed entry. Leave "blufOp" null if the request isn't about this panel.
- If the request is about the document header — the program's name, its owner, who the owner reports to, or the next review date — use "documentOp": { programName, owner, reportsTo, nextReviewDate, reason }, given the document's current values below. Only include the field(s) the request actually changes. Leave "documentOp" null if the request isn't about these.
- Do not compute cascading effects on other, non-matched milestones — that is handled separately, deterministically, from the dependency graph. Only emit ops for milestones the request text is actually about.
- A milestone already at the target value (e.g. already "complete" when asked to mark it complete) still gets an op if the request is unambiguously about it — the caller decides whether to skip a no-op change.
- If a milestone is a plausible textual match but you're deliberately excluding it (e.g. it's already complete and a date-shift wouldn't make sense), list it in "skipped" with a short reason instead of silently dropping it.
- If the request's subject phrase ties equally across multiple milestones — genuinely ambiguous, not just "several plausible candidates" — do not guess and do not emit an op for any of them. Instead set "ambiguous": { field, reason, candidates: [{ targetId, newValue }, ...] } listing every tied milestone with what its newValue would be if it turned out to be the one meant. This lets the person pick the one they meant without retyping the request. Only use this for a genuine tie; a request that clearly names one milestone over several superficially-similar ones should still resolve normally.
- If you cannot confidently resolve the request to any milestone, lane, swimlane, top-level item, or the document/BLUF fields, and it isn't a genuine tie either, return empty "ops", "addMilestones", "deletes", "swimlaneOps", "topLevelItemOps", "addTopLevelItems", "dependencyOps", "attachmentOps", and "skipped", and null "blufOp"/"documentOp", rather than guessing.
- Never invent a targetId or laneId that wasn't in the lists you were given.`;

function formatMilestoneList(milestones: CorrectionMilestoneRef[]): string {
  return milestones
    .map((m) => {
      const base = `- id=${m.id} | title="${m.title}" | lane="${m.laneName}" | date=${m.date} | status=${m.status}`;
      if (!m.attachments || m.attachments.length === 0) return base;
      const attachmentList = m.attachments.map((a, i) => `[${i}] ${a.type}:${a.url}${a.label ? ` "${a.label}"` : ""}`).join(", ");
      return `${base} | attachments: ${attachmentList}`;
    })
    .join("\n");
}

function formatDocument(document: CorrectionDocumentRef): string {
  return `programName="${document.programName}" | owner="${document.owner}" | reportsTo="${document.reportsTo ?? ""}" | nextReviewDate="${document.nextReviewDate ?? ""}" | bluf.statement="${document.bluf.statement}" | bluf.bullets=${JSON.stringify(document.bluf.bullets)} | bluf.label="${document.bluf.label ?? ""}"`;
}

function formatLaneList(lanes: CorrectionLaneRef[]): string {
  return lanes.map((l) => `- id=${l.id} | name="${l.name}"`).join("\n");
}

function formatSwimlaneList(swimlanes: CorrectionSwimlaneRef[]): string {
  return swimlanes.map((l) => `- id=${l.id} | name="${l.name}" | type=${l.type}`).join("\n");
}

function formatTopLevelItemList(items: CorrectionTopLevelItemRef[]): string {
  return items
    .map((t) => {
      if (t.type === "phase") return `- id=${t.id} | type=phase | title="${t.title}" | startDate=${t.startDate} | endDate=${t.endDate} | status=${t.status}`;
      if (t.type === "annotation") return `- id=${t.id} | type=annotation | title="${t.title}" | date=${t.date} | message="${t.message}"`;
      return `- id=${t.id} | type=milestone | title="${t.title}" | date=${t.date} | status=${t.status}`;
    })
    .join("\n");
}

export function buildCorrectionMessages(input: CorrectionInput): Anthropic.MessageParam[] {
  return [
    {
      role: "user",
      content: `Milestones:\n${formatMilestoneList(input.milestones)}\n\nLanes (for adding a milestone, recoloring, or a RAG override):\n${formatLaneList(input.lanes)}\n\nAll swimlanes, including separators (for delete/rename/reorder):\n${formatSwimlaneList(input.swimlanes)}\n\nTop-level (PROGRAM band) items:\n${formatTopLevelItemList(input.topLevelItems)}\n\nDocument header + BLUF panel (for documentOp/blufOp):\n${formatDocument(input.document)}\n\nCorrection request: "${input.correctionText}"`,
    },
  ];
}

export function systemPrompt(): string {
  return SYSTEM_PROMPT;
}
