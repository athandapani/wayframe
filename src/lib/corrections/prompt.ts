import type Anthropic from "@anthropic-ai/sdk";

export interface CorrectionMilestoneRef {
  id: string;
  title: string;
  laneName: string;
  date: string;
  status: string;
}

export interface CorrectionInput {
  milestones: CorrectionMilestoneRef[];
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
 */
const SYSTEM_PROMPT = `You are resolving a short free-text correction request against an existing program roadmap, and proposing targeted edits.

You will be given a list of milestones (each with a real id, title, swimlane name, current date, and current status) and a correction request in plain English (e.g. "push certification milestones by two weeks" or "mark pilot site 3 go-live complete").

Your job is to read the request carefully and call the ${CORRECTION_TOOL_NAME} tool exactly once. Rules:

- Resolve which milestone(s) the request refers to using the *whole* picture for each candidate — id, title, and swimlane name together — not a single shared keyword. Milestones can share a word (e.g. several "pilot" milestones across unrelated lanes) without all being what the request means; only include a milestone in "ops" if you are confident it is one of the things the request is actually about.
- If the request names a duration shift ("push/delay/slip X by N days/weeks/months"), emit one op per matched milestone with field "date" and newValue as the shifted ISO date (YYYY-MM-DD), computed from that milestone's *current* date.
- If the request names a status change ("mark/set X as complete/on track/at risk/delayed/not started"), emit one op per matched milestone with field "status" and newValue as the matching status value.
- Do not compute cascading effects on other, non-matched milestones — that is handled separately, deterministically, from the dependency graph. Only emit ops for milestones the request text is actually about.
- A milestone already at the target value (e.g. already "complete" when asked to mark it complete) still gets an op if the request is unambiguously about it — the caller decides whether to skip a no-op change.
- If a milestone is a plausible textual match but you're deliberately excluding it (e.g. it's already complete and a date-shift wouldn't make sense), list it in "skipped" with a short reason instead of silently dropping it.
- If you cannot confidently resolve the request to any milestone, or the request doesn't contain a recognizable date-shift or status-change directive, return empty "ops" and empty "skipped" rather than guessing.
- Never invent a targetId that wasn't in the milestone list you were given.`;

function formatMilestoneList(milestones: CorrectionMilestoneRef[]): string {
  return milestones
    .map((m) => `- id=${m.id} | title="${m.title}" | lane="${m.laneName}" | date=${m.date} | status=${m.status}`)
    .join("\n");
}

export function buildCorrectionMessages(input: CorrectionInput): Anthropic.MessageParam[] {
  return [
    {
      role: "user",
      content: `Milestones:\n${formatMilestoneList(input.milestones)}\n\nCorrection request: "${input.correctionText}"`,
    },
  ];
}

export function systemPrompt(): string {
  return SYSTEM_PROMPT;
}
