/**
 * PROTOTYPE — throwaway. Answers wayframe#9: what shape does an AI-assisted
 * correction patch need to take (targeted ops vs. whole-document regen),
 * how does free-text reference resolution + dependency cascading work, and
 * what's the preview/apply/undo model for the correction box?
 *
 * `parseCorrection` stands in for the real follow-up Claude call — it's a
 * deterministic keyword matcher, not an LLM. The question this prototype is
 * pressure-testing isn't "can Claude read English" (that was settled by
 * #6's extraction contract); it's "does the *patch shape* + cascade +
 * undo/preview model hold up once a human drives real corrections against
 * a real dependency graph by hand." Kept portable: no I/O, no terminal
 * code — see prototype-correction-tui.ts for the shell around this.
 *
 * Seed data below is a trimmed copy of src/data/demo-roadmap.ts (wayframe
 * issue #10), keeping the cross-lane dependency chain that makes cascading
 * interesting: mech-5 -> safety-4 -> safety-5 -> launch-4, plus pilot-5 and
 * auto-6 also feeding launch-4.
 */

export type Status = "not-started" | "on-track" | "at-risk" | "delayed" | "complete";

export interface Lane {
  id: string;
  name: string;
}

export interface DependencyEdge {
  id: string; // predecessor milestone id
}

export interface WorkingMilestone {
  id: string;
  laneId: string;
  title: string;
  date: string; // YYYY-MM-DD
  originalDate?: string; // baseline snapshot — NOT in real types.ts yet, see NOTES.md
  status: Status;
  dependsOn: DependencyEdge[];
}

export interface WorkingDocument {
  lanes: Lane[];
  milestones: WorkingMilestone[];
}

export const seedDocument: WorkingDocument = {
  lanes: [
    { id: "lane-mech", name: "Mechanical & Hardware" },
    { id: "lane-auto", name: "Autonomy & Perception Software" },
    { id: "lane-safety", name: "Safety Certification" },
    { id: "lane-pilot", name: "Field Pilot Deployments" },
    { id: "lane-launch", name: "Commercial Launch" },
  ],
  milestones: [
    { id: "mech-5", laneId: "lane-mech", title: "Pilot-Build Hardware Lot (x10)", date: "2026-09-25", status: "at-risk", dependsOn: [] },
    { id: "auto-6", laneId: "lane-auto", title: "Autonomy Release Candidate", date: "2026-11-01", status: "not-started", dependsOn: [] },
    { id: "safety-1", laneId: "lane-safety", title: "Hazard Analysis (Preliminary)", date: "2025-10-01", status: "complete", dependsOn: [] },
    { id: "safety-3", laneId: "lane-safety", title: "UL 3100 Pre-Assessment", date: "2026-05-01", status: "complete", dependsOn: [] },
    { id: "safety-4", laneId: "lane-safety", title: "Third-Party Safety Lab Testing", date: "2026-10-20", status: "delayed", dependsOn: [{ id: "mech-5" }] },
    { id: "safety-5", laneId: "lane-safety", title: "UL 3100 Certification Issued", date: "2026-12-15", status: "not-started", dependsOn: [{ id: "safety-4" }] },
    { id: "pilot-4", laneId: "lane-pilot", title: "Pilot Site 3 Go-Live", date: "2026-11-01", status: "not-started", dependsOn: [] },
    { id: "pilot-5", laneId: "lane-pilot", title: "Pilot Fleet Uptime ≥ 95% Sustained (30 days)", date: "2027-01-05", status: "not-started", dependsOn: [{ id: "pilot-4" }] },
    {
      id: "launch-4",
      laneId: "lane-launch",
      title: "General Availability Launch",
      date: "2027-02-01",
      status: "not-started",
      dependsOn: [{ id: "safety-5" }, { id: "pilot-5" }, { id: "auto-6" }],
    },
  ],
};

export type PatchOpField = "date" | "status";

export interface PatchOp {
  targetId: string;
  targetTitle: string;
  field: PatchOpField;
  previousValue: string;
  newValue: string;
  reason: string;
}

export interface CorrectionPatch {
  inputText: string;
  ops: PatchOp[];
  skipped: { title: string; reason: string }[];
  unresolvedText: string | null;
}

export interface CorrectionState {
  document: WorkingDocument;
  history: WorkingDocument[];
  pending: CorrectionPatch | null;
  lastError: string | null;
}

export function initState(document: WorkingDocument): CorrectionState {
  return { document, history: [], pending: null, lastError: null };
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const STOPWORDS = new Set(["the", "and", "of", "&", "a", "an", "milestones", "milestone"]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isBefore(a: string, b: string): boolean {
  return a < b;
}

/** Resolve which milestones a correction's free text is talking about. */
function matchMilestones(document: WorkingDocument, text: string): WorkingMilestone[] {
  const lower = text.toLowerCase();
  const matched = new Map<string, WorkingMilestone>();

  for (const lane of document.lanes) {
    const laneWords = significantWords(lane.name);
    if (laneWords.some((w) => lower.includes(w))) {
      for (const m of document.milestones) {
        if (m.laneId === lane.id) matched.set(m.id, m);
      }
    }
  }

  for (const m of document.milestones) {
    const titleWords = significantWords(m.title);
    if (titleWords.some((w) => lower.includes(w))) {
      matched.set(m.id, m);
    }
  }

  return [...matched.values()];
}

/**
 * Builds patch ops for an already-resolved set of candidate milestones.
 * Shared by both reference-resolution strategies this ticket compares:
 * text-driven matching (`parseCorrection`) and explicit user selection
 * (`parseCorrectionForSelection`, variant C) — the directive-parsing and
 * cascade logic are identical either way; only *which milestones* is
 * decided differently upstream.
 */
function buildOps(
  document: WorkingDocument,
  text: string,
  candidates: WorkingMilestone[],
  keywordForReason: string,
): { ops: PatchOp[]; skipped: { title: string; reason: string }[] } {
  const shiftMatch = text.match(
    /\b(push|delay|slip)\b.*?\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*(day|week|month)s?\b/i,
  );
  const statusMatch = text.match(
    /\b(mark|set)\b.*?\b(complete|completed|done|on.?track|at.?risk|delayed|not.?started)\b/i,
  );

  const ops: PatchOp[] = [];
  const skipped: { title: string; reason: string }[] = [];

  if (shiftMatch) {
    const rawNum = shiftMatch[2].toLowerCase();
    const n = NUMBER_WORDS[rawNum] ?? parseInt(rawNum, 10);
    const unit = shiftMatch[3].toLowerCase();
    const days = unit === "week" ? n * 7 : unit === "month" ? n * 30 : n;

    for (const m of candidates) {
      if (m.status === "complete") {
        skipped.push({ title: m.title, reason: "already complete — not shifted" });
        continue;
      }
      ops.push({
        targetId: m.id,
        targetTitle: m.title,
        field: "date",
        previousValue: m.date,
        newValue: addDays(m.date, days),
        reason: keywordForReason,
      });
    }

    // Cascade: anything depending (directly or transitively) on a shifted
    // milestone must not start before its new predecessor date.
    const dependents = new Map<string, string[]>();
    for (const m of document.milestones) {
      for (const dep of m.dependsOn) {
        if (!dependents.has(dep.id)) dependents.set(dep.id, []);
        dependents.get(dep.id)!.push(m.id);
      }
    }

    const effectiveDate = new Map<string, string>(ops.map((op) => [op.targetId, op.newValue]));
    const visited = new Set(ops.map((op) => op.targetId));
    const queue = [...visited];

    while (queue.length > 0) {
      const id = queue.shift()!;
      const predecessorNewDate = effectiveDate.get(id)!;
      for (const depId of dependents.get(id) ?? []) {
        if (visited.has(depId)) continue;
        const dependent = document.milestones.find((m) => m.id === depId)!;
        const current = effectiveDate.get(depId) ?? dependent.date;
        if (isBefore(current, addDays(predecessorNewDate, 1))) {
          const newDate = addDays(predecessorNewDate, 1);
          ops.push({
            targetId: dependent.id,
            targetTitle: dependent.title,
            field: "date",
            previousValue: dependent.date,
            newValue: newDate,
            reason: `cascaded — would otherwise start before "${document.milestones.find((m) => m.id === id)!.title}"`,
          });
          effectiveDate.set(depId, newDate);
          visited.add(depId);
          queue.push(depId);
        }
      }
    }
  } else if (statusMatch) {
    const raw = statusMatch[2].toLowerCase().replace(/\s|\./g, "");
    const status: Status =
      raw === "complete" || raw === "completed" || raw === "done"
        ? "complete"
        : raw === "ontrack"
          ? "on-track"
          : raw === "atrisk"
            ? "at-risk"
            : raw === "delayed"
              ? "delayed"
              : "not-started";

    for (const m of candidates) {
      ops.push({
        targetId: m.id,
        targetTitle: m.title,
        field: "status",
        previousValue: m.status,
        newValue: status,
        reason: keywordForReason,
      });
    }
  }

  return { ops, skipped };
}

/**
 * Stand-in for the real follow-up Claude call. Recognizes two verb shapes:
 * a date shift ("push/delay/slip X by N days/weeks/months") and a status
 * set ("mark/set X complete|on track|at risk|delayed|not started"). Which
 * milestones the directive applies to is resolved by matching keywords
 * against lane/title text — driving this by hand is what surfaced the
 * false-positive collision (see the #9 resolution comment) that argues for
 * moving reference resolution into the real Claude call instead.
 */
export function parseCorrection(document: WorkingDocument, text: string): CorrectionPatch {
  const hasDirective =
    /\b(push|delay|slip)\b.*?\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*(day|week|month)s?\b/i.test(text) ||
    /\b(mark|set)\b.*?\b(complete|completed|done|on.?track|at.?risk|delayed|not.?started)\b/i.test(text);
  if (!hasDirective) {
    return { inputText: text, ops: [], skipped: [], unresolvedText: text };
  }

  const candidates = matchMilestones(document, text);
  if (candidates.length === 0) {
    return { inputText: text, ops: [], skipped: [], unresolvedText: text };
  }

  const keyword = significantWords(text).find((w) =>
    candidates.some(
      (m) => significantWords(m.title).includes(w) || significantWords(document.lanes.find((l) => l.id === m.laneId)?.name ?? "").includes(w),
    ),
  );

  const { ops, skipped } = buildOps(document, text, candidates, `matched "${keyword ?? text.trim()}"`);
  return { inputText: text, ops, skipped, unresolvedText: null };
}

/**
 * Variant C's alternative to text-driven matching: the user pre-selects
 * milestones by clicking them on the timeline, so the correction text only
 * needs to describe the transformation — no reference-resolution ambiguity
 * to get wrong.
 */
export function parseCorrectionForSelection(
  document: WorkingDocument,
  text: string,
  selectedIds: string[],
): CorrectionPatch {
  if (selectedIds.length === 0) {
    return { inputText: text, ops: [], skipped: [], unresolvedText: text };
  }
  const candidates = document.milestones.filter((m) => selectedIds.includes(m.id));
  const { ops, skipped } = buildOps(document, text, candidates, "selected on canvas");
  if (ops.length === 0 && skipped.length === 0) {
    return { inputText: text, ops: [], skipped: [], unresolvedText: text };
  }
  return { inputText: text, ops, skipped, unresolvedText: null };
}

export type CorrectionAction =
  | { type: "submit"; text: string }
  | { type: "submitForSelection"; text: string; selectedIds: string[] }
  | { type: "apply" }
  | { type: "discard" }
  | { type: "undo" };

export function reduce(state: CorrectionState, action: CorrectionAction): CorrectionState {
  switch (action.type) {
    case "submit": {
      const patch = parseCorrection(state.document, action.text);
      if (patch.ops.length === 0) {
        return { ...state, pending: null, lastError: `No milestones matched "${action.text}"` };
      }
      return { ...state, pending: patch, lastError: null };
    }
    case "submitForSelection": {
      const patch = parseCorrectionForSelection(state.document, action.text, action.selectedIds);
      if (patch.ops.length === 0) {
        return {
          ...state,
          pending: null,
          lastError:
            action.selectedIds.length === 0
              ? "Select at least one milestone first"
              : `Couldn't parse a directive from "${action.text}"`,
        };
      }
      return { ...state, pending: patch, lastError: null };
    }
    case "apply": {
      if (!state.pending) {
        return { ...state, lastError: "Nothing pending to apply" };
      }
      const patch = state.pending;
      const nextMilestones = state.document.milestones.map((m) => {
        const op = patch.ops.find((o) => o.targetId === m.id);
        if (!op) return m;
        if (op.field === "date") {
          return { ...m, date: op.newValue, originalDate: m.originalDate ?? op.previousValue };
        }
        return { ...m, status: op.newValue as Status };
      });
      const nextDocument: WorkingDocument = { ...state.document, milestones: nextMilestones };
      return {
        document: nextDocument,
        history: [...state.history, state.document],
        pending: null,
        lastError: null,
      };
    }
    case "discard":
      return { ...state, pending: null, lastError: null };
    case "undo": {
      if (state.history.length === 0) {
        return { ...state, lastError: "Nothing to undo" };
      }
      const previous = state.history[state.history.length - 1];
      return {
        document: previous,
        history: state.history.slice(0, -1),
        pending: null,
        lastError: null,
      };
    }
  }
}
