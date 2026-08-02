/**
 * PROTOTYPE — throwaway TUI shell around
 * src/lib/corrections/prototype-patch-logic.ts. Answers wayframe#9. Run:
 * `npm run proto:correction`.
 *
 * Type a correction ("push certification milestones by two weeks", "mark
 * pilot site 3 complete"), preview the proposed patch, apply/discard/undo.
 */
import * as readline from "node:readline";
import {
  initState,
  reduce,
  seedDocument,
  type CorrectionState,
} from "../src/lib/corrections/prototype-patch-logic";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

let state: CorrectionState = initState(seedDocument);

function render() {
  process.stdout.write("\x1b[2J\x1b[H");
  console.log(`${BOLD}Correction-box prototype${RESET} ${DIM}(wayframe#9)${RESET}\n`);

  console.log(`${BOLD}Document${RESET} ${DIM}(${state.history.length} undo step(s) available)${RESET}`);
  for (const lane of state.document.lanes) {
    console.log(`  ${BOLD}${lane.name}${RESET}`);
    for (const m of state.document.milestones.filter((m) => m.laneId === lane.id)) {
      const ghost = m.originalDate ? ` ${DIM}(was ${m.originalDate})${RESET}` : "";
      console.log(`    ${m.date}${ghost}  ${DIM}[${m.status}]${RESET}  ${m.title}`);
    }
  }

  if (state.pending) {
    console.log(`\n${YELLOW}${BOLD}Pending correction:${RESET} "${state.pending.inputText}"`);
    for (const op of state.pending.ops) {
      console.log(
        `  ${op.targetTitle}: ${op.field} ${op.previousValue} -> ${GREEN}${op.newValue}${RESET}  ${DIM}(${op.reason})${RESET}`,
      );
    }
    for (const s of state.pending.skipped) {
      console.log(`  ${DIM}skipped: ${s.title} (${s.reason})${RESET}`);
    }
  }

  if (state.lastError) {
    console.log(`\n${RED}${state.lastError}${RESET}`);
  }

  console.log(
    `\n${DIM}Type a correction and press enter, or:${RESET} ${BOLD}[a]${RESET}${DIM}pply pending  ${RESET}${BOLD}[x]${RESET}${DIM}discard pending  ${RESET}${BOLD}[u]${RESET}${DIM}ndo  ${RESET}${BOLD}[q]${RESET}${DIM}uit${RESET}`,
  );
  process.stdout.write("\n> ");
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

render();
rl.on("line", (line) => {
  const input = line.trim();
  if (input === "q") {
    rl.close();
    return;
  }
  if (input === "a") state = reduce(state, { type: "apply" });
  else if (input === "x") state = reduce(state, { type: "discard" });
  else if (input === "u") state = reduce(state, { type: "undo" });
  else if (input.length > 0) state = reduce(state, { type: "submit", text: input });

  render();
});

rl.on("close", () => {
  console.log("\nbye");
  process.exit(0);
});
