// PROTOTYPE — pure logic module, no I/O. See README.md for the question.
//
// A naive, deliberately-imperfect stand-in for what a real Claude tool-call
// would resolve. This is NOT a proposal for the real matching algorithm —
// the shipped version still calls Claude, same as today. What's under test
// here is the *op shape* (how far the field set widens) and the
// *ambiguity-handling policy* around it, both of which are independent of
// who does the matching — #9's original prototype used the same trick
// (hand-rolled keyword matching) specifically because a naive matcher
// reproduces false positives on demand.

import type { Lane, MilestoneRef } from "./fixture.mts";

export type Confidence = "high" | "low";
export type AmbiguityMode = "flag-low-confidence" | "refuse-ambiguous";

export type EditField = "date" | "status" | "title" | "owner" | "comment";

export interface EditOp {
  kind: "edit";
  targetId: string;
  targetTitle: string;
  field: EditField;
  newValue: string;
  reason: string;
  confidence: Confidence;
}

export interface AddOp {
  kind: "add";
  title: string;
  laneId: string | null;
  laneLabel: string; // resolved lane name, or the raw text that failed to resolve
  date: string | null;
  reason: string;
  confidence: Confidence;
}

export interface SkippedCandidate {
  targetId: string;
  targetTitle: string;
  reason: string;
}

/**
 * A tied match, resolved just enough to act on the moment a human picks
 * one — the newValue is precomputed per candidate (not shared) because a
 * date-shift's result depends on that candidate's own current date, unlike
 * status/title/owner/comment where every tied candidate gets the same
 * value. Added for the clarifying-question UI prototype (item 4's sibling
 * question) — the original TUI only needed to know a tie happened, not
 * resolve it interactively.
 */
export interface AmbiguousCandidate {
  milestone: MilestoneRef;
  newValue: string;
}

export interface AmbiguousChoice {
  field: EditField;
  reason: string;
  candidates: AmbiguousCandidate[];
}

export interface ResolutionResult {
  edits: EditOp[];
  adds: AddOp[];
  skipped: SkippedCandidate[];
  /** Requests that couldn't even be parsed into a directive, or an add with no placeable lane. */
  unresolved: string[];
  /** Set only in refuse-ambiguous mode when a subject phrase ties across multiple milestones. */
  ambiguous?: AmbiguousChoice;
}

const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "for", "and", "as", "is", "on", "in", "by",
  "milestone", "please", "it", "that", "this",
]);

function significantWords(text: string): string[] {
  // Digits stay significant even as single characters — "Site 2" vs "Site 3"
  // is exactly the kind of distinguishing detail a length-only filter would
  // silently throw away, which was caught live: an unambiguous "Pilot Site
  // 2 Go-Live" request tied 3-way until this carve-out was added.
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => (w.length > 1 || /^\d+$/.test(w)) && !STOPWORDS.has(w));
}

function overlapScore(candidateWords: Set<string>, queryWords: string[]): number {
  let n = 0;
  for (const w of queryWords) if (candidateWords.has(w)) n++;
  return n;
}

interface TargetResolution {
  chosen: MilestoneRef[];
  skipped: SkippedCandidate[];
  confidence: Confidence;
  /** Non-empty only in the refuse-ambiguous tie case — the candidates a clarifying question would offer. */
  tied: MilestoneRef[];
}

/**
 * The policy under test: what happens when a request's subject phrase
 * scores an equal top match against more than one milestone. #9 found this
 * exact shape of collision real (three "pilot" milestones, one keyword).
 */
function resolveTargets(subject: string, milestones: MilestoneRef[], mode: AmbiguityMode): TargetResolution {
  const qWords = significantWords(subject);
  const scored = milestones
    .map((m) => ({ m, score: overlapScore(new Set(significantWords(m.title)), qWords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { chosen: [], skipped: [], confidence: "high", tied: [] };

  const top = scored[0].score;
  const tiedScored = scored.filter((x) => x.score === top);
  const rest = scored.slice(tiedScored.length);

  if (tiedScored.length === 1) {
    return {
      chosen: [tiedScored[0].m],
      skipped: rest.map((x) => ({
        targetId: x.m.id,
        targetTitle: x.m.title,
        reason: `lower word overlap (${x.score}) than the matched milestone`,
      })),
      confidence: "high",
      tied: [],
    };
  }

  if (mode === "refuse-ambiguous") {
    return {
      chosen: [],
      skipped: tiedScored.map((x) => ({
        targetId: x.m.id,
        targetTitle: x.m.title,
        reason: `ambiguous — ${tiedScored.length} milestones tie on ${top} shared word(s); refusing rather than guessing`,
      })),
      confidence: "high",
      tied: tiedScored.map((x) => x.m),
    };
  }

  // flag-low-confidence: emit an op per tied candidate, marked low confidence
  return { chosen: tiedScored.map((x) => x.m), skipped: [], confidence: "low", tied: [] };
}

function makeEdits(
  subject: string,
  field: EditField,
  newValue: string,
  milestones: MilestoneRef[],
  mode: AmbiguityMode,
  reasonWord: string,
): { edits: EditOp[]; skipped: SkippedCandidate[]; ambiguous?: AmbiguousChoice } {
  const { chosen, skipped, confidence, tied } = resolveTargets(subject, milestones, mode);
  const edits = chosen.map((m) => ({
    kind: "edit" as const,
    targetId: m.id,
    targetTitle: m.title,
    field,
    newValue,
    reason: confidence === "high" ? `matched "${subject.trim()}" ${reasonWord}` : `low-confidence match on "${subject.trim()}" — ${chosen.length} milestones tied`,
    confidence,
  }));
  const ambiguous: AmbiguousChoice | undefined =
    tied.length > 0
      ? { field, reason: `"${subject.trim()}" matches ${tied.length} milestones equally`, candidates: tied.map((m) => ({ milestone: m, newValue })) }
      : undefined;
  return { edits, skipped, ambiguous };
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const DURATION_RE = /\b(?:push|delay|slip)\s+(.+?)\s+by\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(day|days|week|weeks|month|months)\b/i;
const STATUS_WORD_RE = "(complete|completed|on.?track|at.?risk|delayed|not.?started)";
const MARK_STATUS_RE = new RegExp(`\\bmark\\s+(.+?)\\s+(?:as\\s+)?${STATUS_WORD_RE}\\b`, "i");
const SET_STATUS_RE = new RegExp(`\\bset\\s+(.+?)\\s+(?:status\\s+)?to\\s+${STATUS_WORD_RE}\\b`, "i");
const RENAME_RE = /\brename\s+(.+?)\s+to\s+(.+)/i;
const OWNER_RE = /\b(?:set (?:the )?owner of|owner of)\s+(.+?)\s+to\s+(.+)/i;
const COMMENT_RE = /\badd a comment to\s+(.+?):\s*(.+)/i;
const ADD_WITH_LANE_RE = /\badd\s+(?:a|an)\s+(.+?)\s+milestone\s+to\s+the\s+(.+?)\s+lane(?:\s+in\s+(.+))?$/i;
const ADD_NO_LANE_RE = /\badd\s+(?:a|an)\s+(.+?)\s+milestone(?:\s+in\s+(.+))?$/i;

function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase().replace(/\s+/g, "-");
  if (s.startsWith("complet")) return "complete";
  if (s.startsWith("on")) return "on-track";
  if (s.startsWith("at")) return "at-risk";
  if (s.startsWith("delay")) return "delayed";
  return "not-started";
}

function shiftDateISO(iso: string, unit: string, amount: number): string {
  const days = unit.startsWith("week") ? amount * 7 : unit.startsWith("month") ? amount * 30 : amount;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseRoughDate(text: string | undefined): string | null {
  if (!text) return null;
  const q = /\bq([1-4])\D{0,4}'?(\d{2,4})\b/i.exec(text);
  if (q) {
    const quarter = Number(q[1]);
    let year = Number(q[2]);
    if (year < 100) year += 2000;
    const month = (quarter - 1) * 3;
    return `${year}-${String(month + 1).padStart(2, "0")}-01`;
  }
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    return `${m[2]}-${String(month).padStart(2, "0")}-01`;
  }
  return null;
}

function resolveLane(text: string | undefined, lanes: Lane[]): { laneId: string | null; label: string } {
  if (!text) return { laneId: null, label: "(none given)" };
  const qWords = significantWords(text);
  const scored = lanes
    .map((l) => ({ l, score: overlapScore(new Set(significantWords(l.name)), qWords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { laneId: null, label: text.trim() };
  return { laneId: scored[0].l.id, label: scored[0].l.name };
}

export function resolveCorrection(text: string, milestones: MilestoneRef[], lanes: Lane[], mode: AmbiguityMode): ResolutionResult {
  const result: ResolutionResult = { edits: [], adds: [], skipped: [], unresolved: [] };

  let m: RegExpExecArray | null;

  const withLaneMatch = ADD_WITH_LANE_RE.exec(text);
  const addMatch = withLaneMatch ?? ADD_NO_LANE_RE.exec(text);
  if (addMatch) {
    m = addMatch;
    const title = m[1].trim();
    const laneText = withLaneMatch ? m[2] : undefined;
    const dateText = withLaneMatch ? m[3] : m[2];
    const { laneId, label } = resolveLane(laneText, lanes);
    const date = parseRoughDate(dateText);
    if (!laneId) {
      result.unresolved.push(`"add a milestone" request couldn't be placed — no lane resolved from "${laneText ?? "(none given)"}". Refusing rather than guessing a lane.`);
    } else {
      result.adds.push({
        kind: "add",
        title: title.replace(/^\w/, (c) => c.toUpperCase()),
        laneId,
        laneLabel: label,
        date,
        reason: date ? `placed in ${label} at the parsed date` : `placed in ${label}; no date parsed — mirrors addMilestone()'s real "create empty, open for editing" behavior`,
        confidence: date ? "high" : "low",
      });
    }
    return result;
  }

  if ((m = RENAME_RE.exec(text))) {
    const { edits, skipped, ambiguous } = makeEdits(m[1], "title", m[2].trim(), milestones, mode, `→ rename to "${m[2].trim()}"`);
    result.edits.push(...edits);
    result.skipped.push(...skipped);
    result.ambiguous = ambiguous;
    if (edits.length === 0 && skipped.length === 0 && !ambiguous) result.unresolved.push(`"${m[1].trim()}" didn't match any milestone title`);
    return result;
  }

  if ((m = OWNER_RE.exec(text))) {
    const { edits, skipped, ambiguous } = makeEdits(m[1], "owner", m[2].trim(), milestones, mode, `→ owner set to "${m[2].trim()}"`);
    result.edits.push(...edits);
    result.skipped.push(...skipped);
    result.ambiguous = ambiguous;
    return result;
  }

  if ((m = COMMENT_RE.exec(text))) {
    const { edits, skipped, ambiguous } = makeEdits(m[1], "comment", m[2].trim(), milestones, mode, `→ comment set`);
    result.edits.push(...edits);
    result.skipped.push(...skipped);
    result.ambiguous = ambiguous;
    return result;
  }

  if ((m = MARK_STATUS_RE.exec(text)) || (m = SET_STATUS_RE.exec(text))) {
    const status = normalizeStatus(m[2]);
    const { edits, skipped, ambiguous } = makeEdits(m[1], "status", status, milestones, mode, `→ status set to ${status}`);
    result.edits.push(...edits);
    result.skipped.push(...skipped);
    result.ambiguous = ambiguous;
    return result;
  }

  if ((m = DURATION_RE.exec(text))) {
    const subject = m[1];
    const amount = WORD_NUMBERS[m[2].toLowerCase()] ?? Number(m[2]);
    const unit = m[3];
    const { chosen, skipped, confidence, tied } = resolveTargets(subject, milestones, mode);
    for (const ms of chosen) {
      const newDate = shiftDateISO(ms.date, unit, amount);
      result.edits.push({
        kind: "edit",
        targetId: ms.id,
        targetTitle: ms.title,
        field: "date",
        newValue: newDate,
        reason: confidence === "high" ? `shifted ${amount} ${unit} from ${ms.date}` : `low-confidence match — ${chosen.length} milestones tied on "${subject.trim()}"`,
        confidence,
      });
    }
    result.skipped.push(...skipped);
    if (tied.length > 0) {
      result.ambiguous = {
        field: "date",
        reason: `"${subject.trim()}" matches ${tied.length} milestones equally`,
        candidates: tied.map((ms) => ({ milestone: ms, newValue: shiftDateISO(ms.date, unit, amount) })),
      };
    }
    return result;
  }

  result.unresolved.push(`couldn't parse a directive out of "${text}"`);
  return result;
}

// --- stateful wrapper (reducer), for the TUI to drive ---

export interface PrototypeState {
  milestones: MilestoneRef[];
  lanes: Lane[];
  mode: AmbiguityMode;
  pending: (ResolutionResult & { inputText: string }) | null;
  log: string[];
}

export type PrototypeAction =
  | { type: "submit"; text: string }
  | { type: "toggleMode" }
  | { type: "applyPending" }
  | { type: "discardPending" }
  | { type: "resolveAmbiguous"; targetId: string };

function applyResult(milestones: MilestoneRef[], result: ResolutionResult): MilestoneRef[] {
  let next = milestones.map((m) => {
    const edit = result.edits.find((e) => e.targetId === m.id);
    if (!edit) return m;
    return { ...m, [edit.field]: edit.newValue };
  });
  for (const add of result.adds) {
    if (!add.laneId) continue;
    next = [
      ...next,
      {
        id: `new-${Math.random().toString(36).slice(2, 7)}`,
        title: add.title,
        laneId: add.laneId,
        laneName: add.laneLabel,
        date: add.date ?? "TBD",
        status: "not-started",
      },
    ];
  }
  return next;
}

export function reduce(state: PrototypeState, action: PrototypeAction): PrototypeState {
  switch (action.type) {
    case "toggleMode":
      return { ...state, mode: state.mode === "flag-low-confidence" ? "refuse-ambiguous" : "flag-low-confidence" };
    case "submit": {
      const result = resolveCorrection(action.text, state.milestones, state.lanes, state.mode);
      const logLine = `> ${action.text}  [${result.edits.length} edit(s), ${result.adds.length} add(s), ${result.skipped.length} skipped, ${result.unresolved.length} unresolved]`;
      return { ...state, pending: { ...result, inputText: action.text }, log: [...state.log, logLine] };
    }
    case "applyPending": {
      if (!state.pending) return state;
      const milestones = applyResult(state.milestones, state.pending);
      return { ...state, milestones, pending: null, log: [...state.log, "  applied"] };
    }
    case "discardPending":
      return { ...state, pending: null, log: [...state.log, "  discarded"] };
    case "resolveAmbiguous": {
      // The clarifying-question moment: a human picks which tied candidate
      // was meant. This never re-runs the matcher — the candidate list and
      // each one's precomputed newValue came from the original request, so
      // picking one just turns it into a normal edit op.
      if (!state.pending?.ambiguous) return state;
      const picked = state.pending.ambiguous.candidates.find((c) => c.milestone.id === action.targetId);
      if (!picked) return state;
      const edit: EditOp = {
        kind: "edit",
        targetId: picked.milestone.id,
        targetTitle: picked.milestone.title,
        field: state.pending.ambiguous.field,
        newValue: picked.newValue,
        reason: `you picked this one from ${state.pending.ambiguous.candidates.length} matches`,
        confidence: "high",
      };
      return {
        ...state,
        pending: { ...state.pending, edits: [...state.pending.edits, edit], ambiguous: undefined },
        log: [...state.log, `  clarified → ${picked.milestone.title}`],
      };
    }
  }
}
