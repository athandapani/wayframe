// PROTOTYPE — throwaway verification script, not part of the deliverable.
import { lanes, initialMilestones } from "./fixture.mts";
import { reduce, type PrototypeState } from "./resolve.mts";

let state: PrototypeState = { milestones: initialMilestones(), lanes, mode: "flag-low-confidence", pending: null, log: [] };

function run(text: string) {
  state = reduce(state, { type: "submit", text });
  const p = state.pending!;
  console.log(`\n=== "${text}" [mode=${state.mode}] ===`);
  for (const e of p.edits) console.log(`  EDIT  [${e.confidence}] ${e.targetTitle} :: ${e.field} -> ${e.newValue}  (${e.reason})`);
  for (const a of p.adds) console.log(`  ADD   [${a.confidence}] "${a.title}" -> ${a.laneLabel} @ ${a.date ?? "(unset)"}  (${a.reason})`);
  for (const s of p.skipped) console.log(`  SKIP  ${s.targetTitle}  (${s.reason})`);
  for (const u of p.unresolved) console.log(`  UNRESOLVED  ${u}`);
  state = reduce(state, { type: "applyPending" });
}

run("rename new milestone to Manufacturing plan release");
run("set the owner of Pilot Site 2 Go-Live to K. Simmons");
run("add a comment to Third-Party Safety Lab Testing: lab slot confirmed for October");
run("mark the pilot milestone complete"); // ambiguous, flag-low-confidence mode
state = reduce(state, { type: "discardPending" });
state = reduce(state, { type: "toggleMode" });
run("mark the pilot milestone complete"); // ambiguous, refuse-ambiguous mode
state = reduce(state, { type: "discardPending" });
state = reduce(state, { type: "toggleMode" });
run("push Pilot Site 3 Go-Live by two weeks");
run("add a manufacturing plan release milestone to the Manufacturing lane in Q1 '27");
run("add a launch-readiness milestone"); // no lane at all

console.log("\n=== final milestone table ===");
for (const m of state.milestones) {
  console.log(`  ${m.id.padEnd(10)} ${m.title.padEnd(35)} ${m.laneName.padEnd(28)} ${m.date.padEnd(11)} ${m.status}${m.owner ? "  owner:" + m.owner : ""}${m.comment ? "  · " + m.comment : ""}`);
}
