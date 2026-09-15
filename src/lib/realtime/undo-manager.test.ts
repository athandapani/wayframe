import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { AllProgramsUndoRouter, LOCAL_ORIGIN, ProgramUndoManagers, undoTargetKey } from "./undo-manager";

const REMOTE_ORIGIN = Symbol("remote-peer");

describe("undoTargetKey", () => {
  it("distinguishes baseline from a scenario, and scenarios from each other", () => {
    expect(undoTargetKey({ kind: "baseline" })).toBe("baseline");
    expect(undoTargetKey({ kind: "scenario", scenarioId: "s1" })).toBe("scenario:s1");
    expect(undoTargetKey({ kind: "scenario", scenarioId: "s2" })).not.toBe(undoTargetKey({ kind: "scenario", scenarioId: "s1" }));
  });
});

describe("ProgramUndoManagers", () => {
  it("undoes a local Baseline edit but leaves a remote-origin edit untouched", () => {
    const doc = new Y.Doc();
    const managers = new ProgramUndoManagers(doc);
    const milestones = doc.getMap("milestones");

    doc.transact(() => milestones.set("m1", "local"), LOCAL_ORIGIN);
    doc.transact(() => milestones.set("m2", "remote"), REMOTE_ORIGIN);

    managers.undo();

    expect(milestones.get("m1")).toBeUndefined();
    expect(milestones.get("m2")).toBe("remote");
  });

  it("keeps Baseline and each Scenario's undo stack disjoint", () => {
    const doc = new Y.Doc();
    const managers = new ProgramUndoManagers(doc);
    const milestones = doc.getMap("milestones");
    const scenarios = doc.getMap<Y.Map<unknown>>("scenarios");

    doc.transact(() => milestones.set("m1", "baseline-value"), LOCAL_ORIGIN);

    managers.setActiveTarget({ kind: "scenario", scenarioId: "s1" });
    const s1 = scenarios.get("s1") as Y.Map<unknown>;
    doc.transact(() => s1.set("m1", "scenario-override"), LOCAL_ORIGIN);

    // Undoing the active Scenario target must not touch Baseline's own edit.
    managers.undo();
    expect(s1.get("m1")).toBeUndefined();
    expect(milestones.get("m1")).toBe("baseline-value");
  });

  it("parks (does not discard) a target's stack across a switch away and back", () => {
    const doc = new Y.Doc();
    const managers = new ProgramUndoManagers(doc);
    const milestones = doc.getMap("milestones");
    const scenarios = doc.getMap<Y.Map<unknown>>("scenarios");

    doc.transact(() => milestones.set("m1", "v1"), LOCAL_ORIGIN);

    managers.setActiveTarget({ kind: "scenario", scenarioId: "s1" });
    const s1 = scenarios.get("s1") as Y.Map<unknown>;
    doc.transact(() => s1.set("m1", "override"), LOCAL_ORIGIN);

    managers.setActiveTarget({ kind: "baseline" });
    expect(managers.canUndo()).toBe(true); // Baseline's own stack, still intact

    managers.setActiveTarget({ kind: "scenario", scenarioId: "s1" });
    managers.undo();
    expect(s1.get("m1")).toBeUndefined(); // the Scenario edit parked earlier is still undoable
  });

  it("reports canUndo/canRedo against whichever target is currently active", () => {
    const doc = new Y.Doc();
    const managers = new ProgramUndoManagers(doc);
    const milestones = doc.getMap("milestones");

    expect(managers.canUndo()).toBe(false);
    doc.transact(() => milestones.set("m1", "v1"), LOCAL_ORIGIN);
    expect(managers.canUndo()).toBe(true);

    managers.undo();
    expect(managers.canUndo()).toBe(false);
    expect(managers.canRedo()).toBe(true);

    managers.redo();
    expect(milestones.get("m1")).toBe("v1");
  });
});

describe("AllProgramsUndoRouter", () => {
  it("routes undo() to whichever Program most recently received a local edit", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const managersA = new ProgramUndoManagers(docA);
    const managersB = new ProgramUndoManagers(docB);
    const milestonesA = docA.getMap("milestones");
    const milestonesB = docB.getMap("milestones");

    const router = new AllProgramsUndoRouter();
    router.registerProgram("program-a", managersA);
    router.registerProgram("program-b", managersB);

    docA.transact(() => milestonesA.set("m1", "a"), LOCAL_ORIGIN);
    router.noteLocalEdit("program-a");
    docB.transact(() => milestonesB.set("m1", "b"), LOCAL_ORIGIN);
    router.noteLocalEdit("program-b");

    router.undo();

    expect(milestonesB.get("m1")).toBeUndefined();
    expect(milestonesA.get("m1")).toBe("a"); // untouched — the router only reaches the last-edited Program
  });

  it("is a no-op when a Program has been unregistered", () => {
    const doc = new Y.Doc();
    const managers = new ProgramUndoManagers(doc);
    const milestones = doc.getMap("milestones");

    const router = new AllProgramsUndoRouter();
    router.registerProgram("program-a", managers);
    doc.transact(() => milestones.set("m1", "a"), LOCAL_ORIGIN);
    router.noteLocalEdit("program-a");

    router.unregisterProgram("program-a");
    router.undo();

    expect(milestones.get("m1")).toBe("a");
  });
});
