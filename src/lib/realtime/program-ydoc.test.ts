import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Milestone, Program, TopLevelItem } from "@/components/timeline/types";
import { applyProgramPatch, isProgramDocSeeded, readProgramFromDoc, seedProgramDoc } from "./program-ydoc";

/** A realistic fixture Program exercising every top-level field and a variety of optional milestone/topLevelItem fields — mirrors the fixture-builder style already used in src/lib/scenario/resolve.test.ts and use-correction-box.test.ts. */
function makeProgram(overrides: Partial<Program> = {}): Program {
  const milestone1: Milestone = {
    id: "m1",
    laneId: "lane-1",
    title: "Kickoff",
    date: "2026-01-01",
    status: "on-track",
    dependsOn: [],
    linksToTopLevelMilestone: null,
  };
  const milestone2: Milestone = {
    id: "m2",
    laneId: "lane-1",
    title: "Certification",
    date: "2026-03-01",
    status: "at-risk",
    percentComplete: 40,
    owner: "Jane",
    comment: "Waiting on vendor",
    dependsOn: [{ id: "m1", showConnector: true }],
    linksToTopLevelMilestone: null,
    shortLabel: "CERT",
    originalDate: "2026-02-01",
    attachments: [{ type: "link", url: "https://example.com", label: "Spec" }],
    categoryId: "cat-1",
    styleOverride: { markerShape: "diamond", color: "#ff0000" },
  };

  const phase: TopLevelItem = { id: "t1", type: "phase", title: "Phase 1", startDate: "2026-01-01", endDate: "2026-06-01", status: "on-track" };
  const annotation: TopLevelItem = { id: "t2", type: "annotation", title: "Note", date: "2026-02-15", message: "Heads up" };

  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test Program",
    generatedAt: "2026-01-01T00:00:00.000Z",
    lastUpdatedAt: "2026-01-02T00:00:00.000Z",
    owner: "Owner Name",
    reportsTo: "VP Eng",
    nextReviewDate: "2026-04-01",
    styleDefaults: { phaseShape: "rectangle" },
    bluf: { statement: "<p>On track</p>", bullets: ["Bullet one", "Bullet two"], label: "So what", size: { width: 300, height: null } },
    actionItems: [{ id: "a1", text: "Follow up", owner: "Jane", dueDate: "2026-01-10", done: false }],
    swimlanes: [
      { id: "lane-1", order: 0, type: "lane", name: "Lane 1", color: "#123456", density: "normal" },
      { id: "lane-2", order: 1, type: "separator", name: "Group" },
    ],
    topLevelItems: [phase, annotation],
    milestones: [milestone1, milestone2],
    ...overrides,
  };
}

describe("isProgramDocSeeded", () => {
  it("is false on a fresh doc and true once seedProgramDoc has run", () => {
    const doc = new Y.Doc();
    expect(isProgramDocSeeded(doc)).toBe(false);
    seedProgramDoc(doc, makeProgram());
    expect(isProgramDocSeeded(doc)).toBe(true);
  });
});

describe("seedProgramDoc + readProgramFromDoc round-trip", () => {
  it("round-trips a realistic fixture Program field-for-field", () => {
    const doc = new Y.Doc();
    const program = makeProgram();
    seedProgramDoc(doc, program);

    const read = readProgramFromDoc(doc);

    // milestones/topLevelItems ordering is not guaranteed across Y.Map
    // iteration (documented caveat) — sort both sides by id before comparing.
    const sortById = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
    expect({ ...read, milestones: sortById(read.milestones), topLevelItems: sortById(read.topLevelItems) }).toEqual({
      ...program,
      milestones: sortById(program.milestones),
      topLevelItems: sortById(program.topLevelItems),
    });
  });

  it("preserves swimlane array order exactly (the one collection whose order is meaningful)", () => {
    const doc = new Y.Doc();
    const program = makeProgram();
    seedProgramDoc(doc, program);
    const read = readProgramFromDoc(doc);
    expect(read.swimlanes.map((l) => l.id)).toEqual(program.swimlanes.map((l) => l.id));
  });

  it("does not clobber existing state when called a second time on an already-seeded doc", () => {
    const doc = new Y.Doc();
    const program = makeProgram();
    seedProgramDoc(doc, program);

    // Mutate the doc (simulating another client's live edit) then re-seed
    // with different content — the second seed must be a no-op.
    doc.getMap<Y.Map<unknown>>("milestones").get("m1")!.set("title", "Edited by someone else");
    seedProgramDoc(doc, makeProgram({ programName: "Should not apply" }));

    const read = readProgramFromDoc(doc);
    expect(read.programName).toBe("Test Program");
    expect(read.milestones.find((m) => m.id === "m1")!.title).toBe("Edited by someone else");
  });
});

describe("applyProgramPatch", () => {
  it("only touches changed items — an untouched milestone's Y.Map identity is preserved", () => {
    const doc = new Y.Doc();
    const program = makeProgram();
    seedProgramDoc(doc, program);

    const milestonesMap = doc.getMap<Y.Map<unknown>>("milestones");
    const m1Before = milestonesMap.get("m1");
    const m2Before = milestonesMap.get("m2");

    const next: Program = { ...program, milestones: program.milestones.map((m) => (m.id === "m2" ? { ...m, status: "delayed" } : m)) };
    applyProgramPatch(doc, program, next);

    expect(milestonesMap.get("m1")).toBe(m1Before); // untouched — same Y.Map reference
    expect(milestonesMap.get("m2")).toBe(m2Before); // updated in place, not recreated
    expect(milestonesMap.get("m2")!.get("status")).toBe("delayed");
    expect(readProgramFromDoc(doc).milestones.find((m) => m.id === "m1")!.title).toBe("Kickoff");
  });

  it("removes a milestone from the Y.Map when it's present in previous but absent from next", () => {
    const doc = new Y.Doc();
    const program = makeProgram();
    seedProgramDoc(doc, program);

    const next: Program = { ...program, milestones: program.milestones.filter((m) => m.id !== "m2") };
    applyProgramPatch(doc, program, next);

    const milestonesMap = doc.getMap<Y.Map<unknown>>("milestones");
    expect(milestonesMap.has("m2")).toBe(false);
    expect(milestonesMap.has("m1")).toBe(true);
    expect(readProgramFromDoc(doc).milestones.map((m) => m.id)).toEqual(["m1"]);
  });

  it("adds a new topLevelItem", () => {
    const doc = new Y.Doc();
    const program = makeProgram();
    seedProgramDoc(doc, program);

    const added: TopLevelItem = { id: "t3", type: "milestone", title: "GA", date: "2026-07-01", status: "not-started" };
    const next: Program = { ...program, topLevelItems: [...program.topLevelItems, added] };
    applyProgramPatch(doc, program, next);

    const topLevelItemsMap = doc.getMap<Y.Map<unknown>>("topLevelItems");
    expect(topLevelItemsMap.has("t3")).toBe(true);
    expect(readProgramFromDoc(doc).topLevelItems.find((t) => t.id === "t3")).toEqual(added);
  });

  it("rebuilds the swimlanes Y.Array when order/content changes, and leaves it alone when nothing changed", () => {
    const doc = new Y.Doc();
    const program = makeProgram();
    seedProgramDoc(doc, program);

    // No-op patch — same reference, nothing to diff.
    applyProgramPatch(doc, program, program);
    expect(readProgramFromDoc(doc).swimlanes.map((l) => l.id)).toEqual(["lane-1", "lane-2"]);

    // Reorder.
    const reordered: Program = { ...program, swimlanes: [...program.swimlanes].reverse() };
    applyProgramPatch(doc, program, reordered);
    expect(readProgramFromDoc(doc).swimlanes.map((l) => l.id)).toEqual(["lane-2", "lane-1"]);
  });

  it("updates only changed meta fields", () => {
    const doc = new Y.Doc();
    const program = makeProgram();
    seedProgramDoc(doc, program);

    const next: Program = { ...program, programName: "Renamed Program" };
    applyProgramPatch(doc, program, next);

    const read = readProgramFromDoc(doc);
    expect(read.programName).toBe("Renamed Program");
    expect(read.owner).toBe(program.owner);
  });

  it("threads a custom transact origin through", () => {
    const doc = new Y.Doc();
    const program = makeProgram();
    const origin = Symbol("test-origin");
    seedProgramDoc(doc, program, origin);

    let observedOrigin: unknown;
    doc.on("afterTransaction", (tr) => {
      observedOrigin = tr.origin;
    });
    applyProgramPatch(doc, program, { ...program, programName: "Renamed" }, origin);
    expect(observedOrigin).toBe(origin);
  });
});

describe("convergence across peers", () => {
  it("merges concurrent, non-conflicting edits to different milestones from two independent docs", () => {
    const docA = new Y.Doc();
    const program = makeProgram();
    seedProgramDoc(docA, program);

    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    expect(readProgramFromDoc(docB).milestones.length).toBe(2);

    // Concurrent, non-overlapping edits.
    applyProgramPatch(docA, program, { ...program, milestones: program.milestones.map((m) => (m.id === "m1" ? { ...m, status: "delayed" } : m)) });
    applyProgramPatch(docB, program, { ...program, milestones: program.milestones.map((m) => (m.id === "m2" ? { ...m, status: "complete" } : m)) });

    const updateFromA = Y.encodeStateAsUpdate(docA);
    const updateFromB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docB, updateFromA);
    Y.applyUpdate(docA, updateFromB);

    const sortById = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
    const finalA = sortById(readProgramFromDoc(docA).milestones);
    const finalB = sortById(readProgramFromDoc(docB).milestones);

    expect(finalA).toEqual(finalB);
    expect(finalA.find((m) => m.id === "m1")!.status).toBe("delayed");
    expect(finalA.find((m) => m.id === "m2")!.status).toBe("complete");
  });
});
