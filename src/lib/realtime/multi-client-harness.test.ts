import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Milestone, Program, TopLevelItem } from "@/components/timeline/types";
import { scanReferentialProblems } from "@/lib/invariants/referential-scan";
import { applyLocalEdit, createSimulatedClient, joinSimulatedClient, normalizeProgramForComparison, readNormalized, syncAll, type SimulatedClient } from "./multi-client-harness";
import { detectOrphanedEdits } from "./program-conflict";
import { readProgramFromDoc } from "./program-ydoc";

/** Mirrors program-ydoc.test.ts's own fixture builder (same repo-wide "fixture-builder" style used across scenario/resolve.test.ts, use-correction-box.test.ts). */
function makeProgram(overrides: Partial<Program> = {}): Program {
  const m1: Milestone = { id: "m1", laneId: "lane-1", title: "Kickoff", date: "2026-01-01", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null };
  const m2: Milestone = { id: "m2", laneId: "lane-1", title: "Certification", date: "2026-03-01", status: "at-risk", dependsOn: [{ id: "m1", showConnector: true }], linksToTopLevelMilestone: null };
  const phase: TopLevelItem = { id: "t1", type: "phase", title: "Phase 1", startDate: "2026-01-01", endDate: "2026-06-01", status: "on-track" };

  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test Program",
    generatedAt: "2026-01-01T00:00:00.000Z",
    lastUpdatedAt: "2026-01-02T00:00:00.000Z",
    owner: "Owner Name",
    bluf: { statement: "<p>On track</p>", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1", color: "#123456", density: "normal" }],
    topLevelItems: [phase],
    milestones: [m1, m2],
    ...overrides,
  };
}

/** Seeds one client then joins a second from it — every fixed scenario below needs exactly this room shape (see multi-client-harness.ts's own doc comment on why the second client must JOIN, never independently re-seed). */
function makeRoom(seed: Program): { a: SimulatedClient; b: SimulatedClient } {
  const a = createSimulatedClient("A", seed);
  const b = joinSimulatedClient("B", a);
  return { a, b };
}

describe("multi-client harness: fixed concurrent-edit scenarios", () => {
  it("two clients with no edits converge trivially", () => {
    const { a, b } = makeRoom(makeProgram());
    syncAll([a, b]);
    expect(readNormalized(b)).toEqual(readNormalized(a));
  });

  it("concurrent edits to different milestones on different clients both survive and converge", () => {
    const seed = makeProgram();
    const { a, b } = makeRoom(seed);

    applyLocalEdit(a, seed, { ...seed, milestones: seed.milestones.map((m) => (m.id === "m1" ? { ...m, title: "Kickoff (A's edit)" } : m)) });
    applyLocalEdit(b, seed, { ...seed, milestones: seed.milestones.map((m) => (m.id === "m2" ? { ...m, title: "Certification (B's edit)" } : m)) });

    syncAll([a, b]);

    expect(readNormalized(b)).toEqual(readNormalized(a));
    const merged = readProgramFromDoc(a.doc);
    expect(merged.milestones.find((m) => m.id === "m1")).toMatchObject({ title: "Kickoff (A's edit)" });
    expect(merged.milestones.find((m) => m.id === "m2")).toMatchObject({ title: "Certification (B's edit)" });
  });

  it("concurrent edits to the SAME field on the SAME milestone converge to one agreed value on both clients (trusting Yjs's own LWW, not asserting which write wins)", () => {
    const seed = makeProgram();
    const { a, b } = makeRoom(seed);

    applyLocalEdit(a, seed, { ...seed, milestones: seed.milestones.map((m) => (m.id === "m1" ? { ...m, title: "A's title" } : m)) });
    applyLocalEdit(b, seed, { ...seed, milestones: seed.milestones.map((m) => (m.id === "m1" ? { ...m, title: "B's title" } : m)) });

    syncAll([a, b]);

    // The property under test is agreement between clients, not which write wins.
    expect(readNormalized(b)).toEqual(readNormalized(a));
    const winningTitle = readProgramFromDoc(a.doc).milestones.find((m) => m.id === "m1")?.title;
    expect(["A's title", "B's title"]).toContain(winningTitle);
  });

  it("a concurrent add and a concurrent delete both converge — the deleted item never resurrects", () => {
    const seed = makeProgram();
    const { a, b } = makeRoom(seed);

    const newMilestone: Milestone = { id: "m3", laneId: "lane-1", title: "New from A", date: "2026-04-01", status: "on-track", dependsOn: [], linksToTopLevelMilestone: null };
    applyLocalEdit(a, seed, { ...seed, milestones: [...seed.milestones, newMilestone] });
    applyLocalEdit(b, seed, { ...seed, milestones: seed.milestones.filter((m) => m.id !== "m1") });

    syncAll([a, b]);

    expect(readNormalized(b)).toEqual(readNormalized(a));
    const ids = readProgramFromDoc(a.doc).milestones.map((m) => m.id);
    expect(ids).toContain("m3");
    expect(ids).not.toContain("m1");
  });

  it("a concurrent lane deletion + an unrelated milestone edit converge, and the resulting dangling laneId is surfaced by scanReferentialProblems", () => {
    const seed = makeProgram();
    const { a, b } = makeRoom(seed);

    applyLocalEdit(a, seed, { ...seed, swimlanes: [] }); // A deletes the only lane
    applyLocalEdit(b, seed, { ...seed, milestones: seed.milestones.map((m) => (m.id === "m2" ? { ...m, title: "unrelated edit" } : m)) });

    syncAll([a, b]);

    const merged = readProgramFromDoc(a.doc);
    const problems = scanReferentialProblems(merged);
    expect(problems.some((p) => p.kind === "dangling-lane" && p.milestoneId === "m1")).toBe(true);
    expect(problems.some((p) => p.kind === "dangling-lane" && p.milestoneId === "m2")).toBe(true);
  });

  it("an offline edit to an item another client concurrently deleted is surfaced by detectOrphanedEdits once reconnected", () => {
    const seed = makeProgram();
    const { a, b } = makeRoom(seed); // a goes offline and edits m2 locally; b stays "online" and deletes m2

    applyLocalEdit(a, seed, { ...seed, milestones: seed.milestones.map((m) => (m.id === "m2" ? { ...m, comment: "A's offline note" } : m)) });
    applyLocalEdit(b, seed, { ...seed, milestones: seed.milestones.filter((m) => m.id !== "m2") });

    syncAll([a, b]); // A reconnects

    const merged = readProgramFromDoc(a.doc);
    const conflicts = detectOrphanedEdits([{ id: "m2", kind: "milestone" }], merged);
    expect(conflicts).toEqual([expect.objectContaining({ type: "orphaned", itemKind: "milestone", targetId: "m2" })]);
  });
});

describe("multi-client harness: property-based order independence", () => {
  it("N clients making concurrent, disjoint-target edits always converge to the identical final state after syncing", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ targetId: fc.constantFrom("m1", "m2"), newTitle: fc.string({ minLength: 1, maxLength: 12 }) }), { minLength: 1, maxLength: 4 }).filter((edits) => new Set(edits.map((e) => e.targetId)).size === edits.length),
        (edits) => {
          const seed = makeProgram();
          const first = createSimulatedClient("client-0", seed);
          const clients = edits.map((_, i) => (i === 0 ? first : joinSimulatedClient(`client-${i}`, first)));
          clients.forEach((client, i) => {
            applyLocalEdit(client, seed, { ...seed, milestones: seed.milestones.map((m) => (m.id === edits[i].targetId ? { ...m, title: edits[i].newTitle } : m)) });
          });

          syncAll(clients);
          const expected = readNormalized(clients[0]);
          for (const client of clients) expect(readNormalized(client)).toEqual(expected);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("the ORDER in which a fixed set of already-made concurrent edits gets exchanged never changes the converged result", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.string({ minLength: 1, maxLength: 12 }), (titleA, titleB) => {
        const seed = makeProgram();
        const { a, b } = makeRoom(seed);
        applyLocalEdit(a, seed, { ...seed, milestones: seed.milestones.map((m) => (m.id === "m1" ? { ...m, title: titleA } : m)) });
        applyLocalEdit(b, seed, { ...seed, milestones: seed.milestones.map((m) => (m.id === "m1" ? { ...m, title: titleB } : m)) });

        const updateFromA = Y.encodeStateAsUpdate(a.doc);
        const updateFromB = Y.encodeStateAsUpdate(b.doc);

        const mergedForward = new Y.Doc();
        Y.applyUpdate(mergedForward, updateFromA);
        Y.applyUpdate(mergedForward, updateFromB);

        const mergedReverse = new Y.Doc();
        Y.applyUpdate(mergedReverse, updateFromB);
        Y.applyUpdate(mergedReverse, updateFromA);

        expect(readNormalized({ id: "reverse", doc: mergedReverse })).toEqual(readNormalized({ id: "forward", doc: mergedForward }));
      }),
      { numRuns: 50 },
    );
  });

  it("normalizeProgramForComparison is insensitive to milestones/topLevelItems array order (the real reason raw JSON.stringify isn't a safe convergence check)", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(["m1", "m2"], { minLength: 2, maxLength: 2 }), (order) => {
        const seed = makeProgram();
        const reordered = { ...seed, milestones: order.map((id) => seed.milestones.find((m) => m.id === id)!) };
        expect(normalizeProgramForComparison(reordered)).toEqual(normalizeProgramForComparison(seed));
      }),
    );
  });
});
