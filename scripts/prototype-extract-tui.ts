/**
 * PROTOTYPE — throwaway TUI for the map ticket "Design the one-shot Claude
 * extraction prompt and API contract" (wayframe#6).
 *
 * Question being answered: does the extraction contract (tool-forced
 * structured output + tempKey cross-references + one repair retry) hold up
 * across a clean extraction, a fixable validation error, an unfixable one,
 * a dangling reference, an empty extraction, missing input, and a raw API
 * failure? Drives the REAL extractRoadmap() module (src/lib/extraction —
 * not throwaway) against either a live Claude call (if ANTHROPIC_API_KEY is
 * set) or canned fixture model responses for the failure-mode scenarios,
 * since those are hard to reliably provoke from a live model on demand.
 *
 * Run: npm run prototype:extract
 */

import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline";
import { extractRoadmap, type CallModel, type ExtractionResult } from "../src/lib/extraction/extract";
import { EXTRACTION_TOOL } from "../src/lib/extraction/tool-schema";
import type { ExtractionInput } from "../src/lib/extraction/prompt";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function toolUse(input: unknown): Anthropic.ToolUseBlock {
  return {
    type: "tool_use",
    id: "toolu_" + Math.random().toString(36).slice(2),
    name: EXTRACTION_TOOL.name,
    input,
  } as unknown as Anthropic.ToolUseBlock;
}

function fakeMessage(content: Anthropic.ContentBlock[]): Anthropic.Message {
  return { id: "msg_fake", type: "message", role: "assistant", model: "fixture", content, stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Anthropic.Message;
}

const GOOD_DRAFT = {
  schemaVersion: "1.0",
  programName: "Warehouse Robotics Platform Launch",
  owner: "Jamie Chen",
  bluf: {
    statement: "On track for pilot deployment; safety certification is the pacing item.",
    bullets: ["Autonomy stack passed indoor nav testing", "Certification submission slipped 2 weeks", "Manufacturing tooling order placed"],
  },
  actionItems: [{ text: "Confirm cert lab slot for Q3", owner: "Priya", dueDate: "2026-08-15" }],
  swimlanes: [
    { tempKey: "lane-autonomy", order: 0, type: "lane", name: "Autonomy Software" },
    { tempKey: "lane-safety", order: 1, type: "lane", name: "Safety Certification" },
  ],
  topLevelItems: [
    { tempKey: "top-pilot", type: "milestone", title: "Field Pilot Start", date: "2026-10-01", status: "at-risk" },
  ],
  milestones: [
    { tempKey: "ms-nav", laneRef: "lane-autonomy", title: "Indoor nav testing complete", date: "2026-07-20", status: "complete", dependsOn: [], linksToTopLevelMilestoneRef: "top-pilot", isCriticalPath: false },
    { tempKey: "ms-cert", laneRef: "lane-safety", title: "Cert submission", date: "2026-08-10", status: "at-risk", dependsOn: [{ tempKey: "ms-nav", showConnector: true }], linksToTopLevelMilestoneRef: "top-pilot", isCriticalPath: true },
  ],
};

function withBadStatus(draft: typeof GOOD_DRAFT) {
  return { ...draft, milestones: [{ ...draft.milestones[0], status: "in-progress" }, draft.milestones[1]] };
}

function withMissingField(draft: typeof GOOD_DRAFT) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { bluf, ...rest } = draft;
  return rest;
}

function withDanglingRef(draft: typeof GOOD_DRAFT) {
  return { ...draft, milestones: [{ ...draft.milestones[0], laneRef: "lane-does-not-exist" }, draft.milestones[1]] };
}

const EMPTY_DRAFT = { ...GOOD_DRAFT, topLevelItems: [], milestones: [] };

let attempts = 0;
function countingModel(fn: CallModel): CallModel {
  return async (system, messages) => {
    attempts++;
    return fn(system, messages);
  };
}

function scriptedModel(responses: Anthropic.Message[]): CallModel {
  let i = 0;
  return async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return r;
  };
}

function throwingModel(message: string): CallModel {
  return async () => {
    throw new Error(message);
  };
}

let realClient: Anthropic | null = null;
function realModel(): CallModel {
  realClient ??= new Anthropic();
  return async (system, messages) =>
    realClient!.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system,
      messages,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
    });
}

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

interface Scenario {
  key: string;
  label: string;
  input: ExtractionInput;
  model: CallModel;
  note?: string;
}

const scenarios: Scenario[] = [
  {
    key: "1",
    label: "Clean text-only extraction",
    input: { text: "Warehouse robotics launch. Jamie owns it. Autonomy team finished indoor nav testing 7/20, complete. Safety cert submission due 8/10, at risk, depends on nav testing, this is critical path. Field pilot targeted for Oct 1, at risk overall due to cert timeline. Priya needs to confirm the cert lab slot by 8/15." },
    model: hasApiKey ? realModel() : scriptedModel([fakeMessage([toolUse(GOOD_DRAFT)])]),
    note: hasApiKey ? undefined : "no ANTHROPIC_API_KEY set — using a canned good response instead of a live call",
  },
  {
    key: "2",
    label: "Whiteboard photo + sparse text",
    input: { text: "(see photo)", imageDataUrl: TINY_PNG_DATA_URL },
    model: hasApiKey ? realModel() : scriptedModel([fakeMessage([toolUse(EMPTY_DRAFT)])]),
    note: "exercises the image content-block path; placeholder 1x1 PNG stands in for a real napkin photo, so expect a thin/empty extraction even with a live key",
  },
  {
    key: "3",
    label: "Invalid status enum -> self-repairs on retry",
    input: { text: "n/a — scripted" },
    model: scriptedModel([fakeMessage([toolUse(withBadStatus(GOOD_DRAFT))]), fakeMessage([toolUse(GOOD_DRAFT)])]),
  },
  {
    key: "4",
    label: "Missing required field -> repair also fails",
    input: { text: "n/a — scripted" },
    model: scriptedModel([fakeMessage([toolUse(withMissingField(GOOD_DRAFT))]), fakeMessage([toolUse(withMissingField(GOOD_DRAFT))])]),
  },
  {
    key: "5",
    label: "Dangling laneRef -> self-repairs on retry",
    input: { text: "n/a — scripted" },
    model: scriptedModel([fakeMessage([toolUse(withDanglingRef(GOOD_DRAFT))]), fakeMessage([toolUse(GOOD_DRAFT)])]),
  },
  {
    key: "6",
    label: "Empty extraction (gibberish input)",
    input: { text: "asdkfj qweiru" },
    model: scriptedModel([fakeMessage([toolUse(EMPTY_DRAFT)])]),
  },
  {
    key: "7",
    label: "No input provided",
    input: {},
    model: scriptedModel([]),
  },
  {
    key: "8",
    label: "Claude API throws (network/rate limit)",
    input: { text: "irrelevant" },
    model: throwingModel("529 Overloaded"),
  },
];

let lastRun: { scenario: Scenario; attempts: number; result: ExtractionResult } | null = null;

function render() {
  console.clear();
  console.log(`${BOLD}Extraction contract prototype${RESET} ${DIM}(wayframe#6)${RESET}\n`);

  if (lastRun) {
    const { scenario, attempts: n, result } = lastRun;
    console.log(`${BOLD}Scenario:${RESET} ${scenario.label}`);
    if (scenario.note) console.log(`${DIM}${scenario.note}${RESET}`);
    console.log(`${BOLD}Model calls made:${RESET} ${n}\n`);

    if (result.ok) {
      console.log(`${GREEN}${BOLD}OK${RESET} — resolved RoadmapDocument:`);
      console.log(DIM + JSON.stringify(result.document, null, 2) + RESET);
    } else {
      console.log(`${RED}${BOLD}ERROR${RESET} [${result.error.kind}]: ${result.error.message}`);
      if ("issues" in result.error) {
        for (const issue of result.error.issues) console.log(`  ${YELLOW}- ${issue}${RESET}`);
      }
    }
  } else {
    console.log(`${DIM}No scenario run yet.${RESET}`);
  }

  console.log(`\n${BOLD}Scenarios${RESET} ${hasApiKey ? GREEN + "(ANTHROPIC_API_KEY set — 1 & 2 hit the real API)" : YELLOW + "(no ANTHROPIC_API_KEY — 1 & 2 use canned responses)"}${RESET}`);
  for (const s of scenarios) {
    console.log(`  ${BOLD}[${s.key}]${RESET} ${s.label}`);
  }
  console.log(`\n${BOLD}[q]${RESET} quit`);
}

async function runScenario(s: Scenario) {
  attempts = 0;
  const result = await extractRoadmap(s.input, countingModel(s.model));
  lastRun = { scenario: s, attempts, result };
}

async function main() {
  render();
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on("keypress", async (_str, key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      process.exit(0);
    }
    const match = scenarios.find((s) => s.key === key.name);
    if (match) {
      console.log(`\n${DIM}running "${match.label}"...${RESET}`);
      await runScenario(match);
      render();
    }
  });
}

main();
