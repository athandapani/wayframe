import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Milestone, Program } from "@/components/timeline/types";
import { applyLocalEdit, createSimulatedClient, joinSimulatedClient, syncAll } from "@/lib/realtime/multi-client-harness";
import { readProgramFromDoc } from "@/lib/realtime/program-ydoc";
import { addMilestoneAddition, gcScenario, setMilestoneOverride } from "./apply";
import { resolveScenario } from "./resolve";
import { createScenario, type Scenario } from "./types";

/**
 * Property-based / order-independence coverage for #t13's Scenario-rebase
 * rules, per t42's gist ("fixed, hand-authored tests for #t13's already-named
 * hard cases... plus property-based random operation-order permutation
 * testing layered on top"). apply.test.ts/resolve.test.ts already cover the
 * single-threaded correctness of each rule in isolation — this file's job is
 * the *concurrency* angle those don't touch: does the rule still hold when
 * the Program mutation and the Scenario mutation that interact with it can
 * happen in either order (mirroring two collaborators racing), and does a
 * batch of independent override-setting ops converge to the same Scenario
 * object regardless of the order they're applied in.
 *
 * Important scope boundary, not a gap this file works around: `resolveScenario`
 * is a pure function of a (Program, Scenario) pair, so once both have reached
 * their final values, calling it is trivially deterministic — the real
 * question worth property-testing is whether the *path* to that pair (which
 * order independent mutations landed in) can change the final pair itself.
 * For override-setting ops on DISTINCT target ids, apply.ts's pure
 * overwrite-only setters make this true by construction (each op only ever
 * touches its own Record key). For two ops on the SAME target id, "last
 * applied wins" is order-DEPENDENT *by design* — that's not a bug to prove
 * absent, it's the documented behavior (apply.ts's own module doc comment).
 * See the last describe block below for why this doesn't extend to real
 * multi-client convergence today.
 */

function milestone(overrides: Partial<Milestone> & Pick<Milestone, "id" | "date">): Milestone {
  return { laneId: "lane-1", title: overrides.id, status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, ...overrides };
}

function program(overrides: Partial<Pick<Program, "milestones" | "topLevelItems">>): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test Program",
    generatedAt: "2026-01-01T00:00:00.000Z",
    owner: "owner",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

describe("Scenario delta-op order-independence across distinct targets", () => {
  it("[property] setting override/addition ops on distinct target ids converges to the identical Scenario regardless of application order", () => {
    const targetIds = ["m1", "m2", "m3", "m4"];
    fc.assert(
      fc.property(fc.shuffledSubarray(targetIds, { minLength: targetIds.length, maxLength: targetIds.length }), (order) => {
        const applyInOrder = (ids: string[]): Scenario => {
          let scenario = createScenario("s1", "Plan B");
          for (const id of ids) {
            scenario =
              id === "m4"
                ? addMilestoneAddition(scenario, milestone({ id, date: "2026-05-01" }))
                : setMilestoneOverride(scenario, id, { op: "modify", patch: { title: `${id}-edited` }, baseRevAtCreation: 1 });
          }
          return scenario;
        };

        const canonical = applyInOrder(targetIds);
        const shuffled = applyInOrder(order);
        expect(shuffled).toEqual(canonical);
      }),
      { numRuns: 50 },
    );
  });
});

/**
 * Merges two clients' independent, concurrent, uncoordinated local edits via
 * the real multi-client harness (real `Y.Doc`s, no network) and returns the
 * converged Program both clients end up holding — the "Program" half of the
 * (Program, Scenario) pair resolveScenario/gcScenario consume. Scenario
 * itself stays a plain object throughout (see this file's module doc
 * comment on why that's a separate, already-flagged gap) — only the
 * Program side is exercised through real CRDT concurrency here.
 */
function mergeConcurrentEdits(seed: Program, editA: (p: Program) => Program, editB: (p: Program) => Program): Program {
  const a = createSimulatedClient("A", seed);
  const b = joinSimulatedClient("B", a);
  applyLocalEdit(a, seed, editA(seed));
  applyLocalEdit(b, seed, editB(seed));
  syncAll([a, b]);
  return readProgramFromDoc(a.doc);
}

describe("Scenario-rebase hard cases against a REAL concurrently-merged Program (t13 x t42)", () => {
  it("[integration] orphan conflict surfaces once a concurrent deletion and an unrelated concurrent edit both converge", () => {
    const seed = program({ milestones: [milestone({ id: "m1", date: "2026-01-01" }), milestone({ id: "m2", date: "2026-02-01" })] });
    const scenario = setMilestoneOverride(createScenario("s1", "Plan B"), "m1", { op: "modify", patch: { title: "Renamed" }, baseRevAtCreation: 1 });

    const merged = mergeConcurrentEdits(
      seed,
      (p) => ({ ...p, milestones: p.milestones.filter((m) => m.id !== "m1") }), // client A deletes the override's target
      (p) => ({ ...p, milestones: p.milestones.map((m) => (m.id === "m2" ? { ...m, title: "unrelated edit" } : m)) }), // client B, unaware, edits something else
    );

    const result = resolveScenario(merged, scenario);
    expect(result.conflicts).toEqual([expect.objectContaining({ type: "orphaned", itemKind: "milestone", targetId: "m1" })]);
  });

  it("[integration] agreeing-remove GC clears the override once the concurrent deletion has converged, alongside an unrelated concurrent edit", () => {
    const seed = program({ milestones: [milestone({ id: "m1", date: "2026-01-01" }), milestone({ id: "m2", date: "2026-02-01" })] });
    const scenario = setMilestoneOverride(createScenario("s1", "Plan B"), "m1", { op: "remove" });

    const merged = mergeConcurrentEdits(
      seed,
      (p) => ({ ...p, milestones: p.milestones.filter((m) => m.id !== "m1") }),
      (p) => ({ ...p, milestones: p.milestones.map((m) => (m.id === "m2" ? { ...m, title: "unrelated edit" } : m)) }),
    );

    expect(gcScenario(merged, scenario).milestoneOverrides).toEqual({});
    expect(resolveScenario(merged, gcScenario(merged, scenario)).conflicts).toEqual([]);
  });

  it("[integration] plan-moved is flagged and the override still applies once a concurrent rev-bumping edit has converged", () => {
    const seed = program({ milestones: [milestone({ id: "m1", date: "2026-01-01" }), milestone({ id: "m2", date: "2026-02-01" })] });
    const scenario = setMilestoneOverride(createScenario("s1", "Plan B"), "m1", { op: "modify", patch: { title: "Renamed" }, baseRevAtCreation: 1 });

    const merged = mergeConcurrentEdits(
      seed,
      (p) => ({ ...p, milestones: p.milestones.map((m) => (m.id === "m1" ? { ...m, date: "2026-01-15", rev: 2 } : m)) }), // a concurrent collaborator moves the plan
      (p) => ({ ...p, milestones: p.milestones.map((m) => (m.id === "m2" ? { ...m, title: "unrelated edit" } : m)) }),
    );

    const result = resolveScenario(merged, scenario);
    expect(result.milestones.find((m) => m.id === "m1")).toMatchObject({ title: "Renamed" }); // the override still wins
    expect(result.conflicts).toEqual([expect.objectContaining({ type: "plan-moved", itemKind: "milestone", targetId: "m1" })]);
  });
});

describe("Known gap, deliberately not solved here (architecture debt already flagged by t38)", () => {
  it("[documented gap] two clients concurrently setting DIFFERENT overrides on the SAME target don't converge — Scenario has no CRDT/last-writer-wins backing across clients yet, only within one client's own sequential local calls", () => {
    // "Last override wins" (apply.test.ts) is a real, tested invariant for
    // one client's own sequential edits. It is NOT a multi-client
    // convergence guarantee: two clients each holding their own in-memory
    // Scenario object and concurrently calling setMilestoneOverride with
    // different patches on the same id each simply keep their own local
    // result — there's no shared clock/CRDT merge step between them today
    // (t38's gist: "Scenario... has no programId tying it to one Program's
    // ids at all; flagged as architecture debt, not attempted"). This test
    // exists to make that gap explicit and regression-catchable — if a
    // future ticket adds real Scenario CRDT backing, this test's premise
    // (that the two clients' results DIFFER) should start failing, which is
    // the signal to delete this test and replace it with a real convergence
    // assertion instead.
    const base = createScenario("s1", "Plan B");
    const clientA = setMilestoneOverride(base, "m1", { op: "modify", patch: { title: "A's title" }, baseRevAtCreation: 1 });
    const clientB = setMilestoneOverride(base, "m1", { op: "modify", patch: { title: "B's title" }, baseRevAtCreation: 1 });

    expect(clientA.milestoneOverrides.m1).not.toEqual(clientB.milestoneOverrides.m1);
  });
});
