// PROTOTYPE — throwaway TUI shell. Thin: all logic lives in resolve.mts.
// Run: node src/lib/corrections/prototype-scope-widening/tui.mts

import * as readline from "node:readline/promises";
import { lanes, initialMilestones } from "./fixture.mts";
import { reduce, type PrototypeState } from "./resolve.mts";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";

let state: PrototypeState = {
  milestones: initialMilestones(),
  lanes,
  mode: "flag-low-confidence",
  pending: null,
  log: [],
};

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

function render(): void {
  if (process.stdout.isTTY) console.clear();
  console.log(`${BOLD}Correction-box scope-widening — prototype${RESET}  ${DIM}(wayframe#38 item 1)${RESET}`);
  console.log(`${DIM}ambiguity policy:${RESET} ${state.mode === "flag-low-confidence" ? `${YELLOW}flag-low-confidence${RESET}` : `${RED}refuse-ambiguous${RESET}`}  ${DIM}(/mode to toggle)${RESET}`);
  console.log("");

  console.log(`${BOLD}Milestones${RESET}`);
  console.log(`${DIM}${pad("id", 10)}${pad("title", 42)}${pad("lane", 26)}${pad("date", 12)}status${RESET}`);
  for (const m of state.milestones) {
    console.log(`${pad(m.id, 10)}${pad(m.title, 42)}${pad(m.laneName, 26)}${pad(m.date, 12)}${m.status}${m.owner ? `  ${DIM}owner: ${m.owner}${RESET}` : ""}${m.comment ? `  ${DIM}· ${m.comment}${RESET}` : ""}`);
  }
  console.log("");

  if (state.pending) {
    const p = state.pending;
    console.log(`${BOLD}Pending — "${p.inputText}"${RESET}`);
    if (p.edits.length === 0 && p.adds.length === 0 && p.skipped.length === 0 && p.unresolved.length === 0) {
      console.log(`  ${DIM}(nothing)${RESET}`);
    }
    for (const e of p.edits) {
      const tag = e.confidence === "high" ? `${GREEN}high${RESET}` : `${YELLOW}low${RESET}`;
      console.log(`  ${GREEN}edit${RESET}  [${tag}]  ${BOLD}${e.targetTitle}${RESET}  ${e.field} → ${CYAN}${e.newValue}${RESET}  ${DIM}${e.reason}${RESET}`);
    }
    for (const a of p.adds) {
      const tag = a.confidence === "high" ? `${GREEN}high${RESET}` : `${YELLOW}low${RESET}`;
      console.log(`  ${GREEN}add${RESET}   [${tag}]  ${BOLD}${a.title}${RESET}  → ${a.laneLabel} @ ${a.date ?? "(unset)"}  ${DIM}${a.reason}${RESET}`);
    }
    for (const s of p.skipped) {
      console.log(`  ${RED}skip${RESET}  ${s.targetTitle}  ${DIM}${s.reason}${RESET}`);
    }
    for (const u of p.unresolved) {
      console.log(`  ${RED}unresolved${RESET}  ${DIM}${u}${RESET}`);
    }
    console.log("");
    console.log(`${BOLD}[a]${RESET}pply pending  ${BOLD}[d]${RESET}iscard pending`);
  } else {
    console.log(`${DIM}Type a correction request and press enter.${RESET}`);
  }

  if (state.log.length > 0) {
    console.log("");
    console.log(`${DIM}${BOLD}log${RESET}`);
    for (const line of state.log.slice(-6)) console.log(`${DIM}${line}${RESET}`);
  }

  console.log("");
  console.log(`${DIM}commands: /mode  /apply  /discard  /reset  /quit — anything else submits as a correction request${RESET}`);
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  render();
  for (;;) {
    const line = (await rl.question("> ")).trim();
    if (!line) continue;
    if (line === "/quit" || line === "/q") break;
    if (line === "/mode") {
      state = reduce(state, { type: "toggleMode" });
    } else if (line === "/apply" || line === "/a") {
      state = reduce(state, { type: "applyPending" });
    } else if (line === "/discard" || line === "/d") {
      state = reduce(state, { type: "discardPending" });
    } else if (line === "/reset") {
      state = { milestones: initialMilestones(), lanes, mode: state.mode, pending: null, log: [...state.log, "  reset to fixture"] };
    } else {
      state = reduce(state, { type: "submit", text: line });
    }
    render();
  }
  rl.close();
}

main();
