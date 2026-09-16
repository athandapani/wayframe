import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { Program } from "@/components/timeline/types";
import type { UseCorrectionBoxResult } from "@/components/correction-box/use-correction-box";
import { isProgramDocSeeded, readProgramFromDoc, seedProgramDoc } from "./program-ydoc";
import { connectProgramRoom } from "./provider";
import { useProgramRoom } from "./use-program-room";

// No existing y-partyserver/y-protocols mock exists anywhere in this repo
// (checked program-ydoc.test.ts / undo-manager.test.ts / party/) — this is a
// minimal fake of just the provider/awareness surface use-program-room.ts
// actually calls (see its own doc comments citing the compiled
// y-partyserver/y-protocols JS this was verified against), injected by
// mocking `connectProgramRoom` itself rather than the whole npm package.
vi.mock("./provider", () => ({ connectProgramRoom: vi.fn() }));

class FakeEmitter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  on(name: string, f: (...args: unknown[]) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(f);
  }
  off(name: string, f: (...args: unknown[]) => void) {
    this.listeners.get(name)?.delete(f);
  }
  emit(name: string, ...args: unknown[]) {
    for (const f of this.listeners.get(name) ?? []) f(...args);
  }
}

class FakeAwareness extends FakeEmitter {
  clientID = 1; // "this" client — every peer test uses a different id for remote peers.
  private states = new Map<number, Record<string, unknown>>();
  getLocalState() {
    return this.states.get(this.clientID) ?? null;
  }
  setLocalState(state: Record<string, unknown>) {
    this.states.set(this.clientID, state);
  }
  getStates() {
    return this.states;
  }
  // Test helpers only — simulate a remote peer's awareness state arriving/leaving.
  remoteJoin(clientId: number, state: Record<string, unknown>) {
    this.states.set(clientId, state);
    this.emit("change", { added: [clientId], updated: [], removed: [] });
  }
  remoteLeave(clientId: number) {
    this.states.delete(clientId);
    this.emit("change", { added: [], updated: [], removed: [clientId] });
  }
}

class FakeProvider extends FakeEmitter {
  awareness = new FakeAwareness();
  wsconnected = false;
  disconnect = vi.fn();
  destroy = vi.fn();
  // Test helpers only.
  goConnected() {
    this.wsconnected = true;
    this.emit("status", { status: "connected" });
  }
  goDisconnected() {
    this.wsconnected = false;
    this.emit("status", { status: "disconnected" });
  }
  sync(isSynced: boolean) {
    this.emit("sync", isSynced);
  }
}

function baseProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Lane 1" }],
    topLevelItems: [],
    milestones: [
      { id: "m1", laneId: "lane-1", title: "Milestone 1", date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null },
    ],
    ...overrides,
  };
}

/**
 * A minimal `UseCorrectionBoxResult` test double — only `data`/`setFromRemote`/
 * `addConflicts` are ever read by use-program-room.ts itself; every other
 * field is stubbed since the interface requires them. `current.data` is
 * exposed directly so a test can mutate it (mirroring a reducer dispatch
 * producing a new object) and then call the hook's `rerender()`, modeling
 * the real "reducer updates state -> component re-renders with new
 * box.data" cycle a real `useCorrectionBox` caller goes through — the exact
 * harness idiom this ticket names as one valid option. `setFromRemote`
 * itself also writes into `current.data`, since that's what the real
 * reducer's "setFromRemote" case does.
 */
function makeBoxDouble(initialData: Program) {
  const current: { data: Program } = { data: initialData };
  const setFromRemote = vi.fn((data: Program) => {
    current.data = data;
  });
  const addConflicts = vi.fn();
  const dismissConflict = vi.fn();
  const box = () =>
    ({
      data: current.data,
      portfolio: { id: "portfolio-1", schemaVersion: 2 },
      pending: null,
      error: null,
      loading: false,
      historyLength: 0,
      conflicts: [],
      setFromRemote,
      addConflicts,
      dismissConflict,
      // Every other UseCorrectionBoxResult member is unused by the hook under test.
    }) as unknown as UseCorrectionBoxResult;
  return { current, box, setFromRemote, addConflicts, dismissConflict };
}

const connectProgramRoomMock = vi.mocked(connectProgramRoom);

describe("useProgramRoom", () => {
  let fakeProvider: FakeProvider;
  let capturedDoc: Y.Doc | null;
  /** Seeds the doc the hook creates internally *before* it gets a chance to bootstrap — simulates "this room already had content from an earlier connection." Set from within an individual test, read by the mocked connectProgramRoom. */
  let preSeedWith: Program | null;

  beforeEach(() => {
    fakeProvider = new FakeProvider();
    capturedDoc = null;
    preSeedWith = null;
    connectProgramRoomMock.mockClear();
    connectProgramRoomMock.mockImplementation((_programId, doc) => {
      capturedDoc = doc;
      if (preSeedWith) seedProgramDoc(doc, preSeedWith, Symbol("remote-seed"));
      return fakeProvider as unknown as ReturnType<typeof connectProgramRoom>;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("seeds an empty doc from box.data on first sync when unseeded", () => {
    const data = baseProgram();
    const { box, setFromRemote } = makeBoxDouble(data);
    renderHook(() => useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }));

    act(() => fakeProvider.sync(true));

    expect(capturedDoc).not.toBeNull();
    expect(isProgramDocSeeded(capturedDoc!)).toBe(true);
    expect(readProgramFromDoc(capturedDoc!)).toEqual(data);
    expect(setFromRemote).not.toHaveBeenCalled();
  });

  it("reads-and-replaces via setFromRemote when the doc is already seeded", () => {
    const remoteData = baseProgram({ programName: "Already in the room" });
    preSeedWith = remoteData;
    const staleLocalData = baseProgram({ programName: "Stale REST snapshot" });
    const { box, setFromRemote } = makeBoxDouble(staleLocalData);
    renderHook(() => useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }));

    act(() => fakeProvider.sync(true));

    expect(setFromRemote).toHaveBeenCalledTimes(1);
    expect(setFromRemote.mock.calls[0][0]).toEqual(remoteData);
  });

  it("reconciles an edit made during the connecting window instead of discarding it when the room turns out already seeded", () => {
    // The room already has other peers' content, including a milestone
    // ("m2") the local client never knew about.
    const remoteRoomData = baseProgram({
      milestones: [
        { id: "m1", laneId: "lane-1", title: "Milestone 1", date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null },
        { id: "m2", laneId: "lane-1", title: "Milestone 2 from peer", date: "2026-01-02", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null },
      ],
    });
    preSeedWith = remoteRoomData;

    const initialLocalData = baseProgram();
    const { current, box, setFromRemote } = makeBoxDouble(initialLocalData);
    const { rerender } = renderHook(() =>
      useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }),
    );

    // The user edits m1 before the first sync ever fires — box.data changes,
    // but the local->remote effect must no-op (hasBootstrappedRef is still
    // false) rather than trying to patch a doc it hasn't bootstrapped yet.
    current.data = baseProgram({
      milestones: [{ id: "m1", laneId: "lane-1", title: "Edited during connect", date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null }],
    });
    rerender();
    expect(setFromRemote).not.toHaveBeenCalled();

    // Now the room's pre-existing content actually syncs in.
    act(() => fakeProvider.sync(true));

    // Reconciled, not discarded: the local edit to m1 survives, and m2 (which
    // the local client never touched) survives from the room's own content.
    const merged = readProgramFromDoc(capturedDoc!);
    expect(merged.milestones.find((m) => m.id === "m1")?.title).toBe("Edited during connect");
    expect(merged.milestones.find((m) => m.id === "m2")?.title).toBe("Milestone 2 from peer");
    expect(setFromRemote).toHaveBeenCalledTimes(1);
    expect(setFromRemote.mock.calls[0][0]).toEqual(merged);
  });

  it("tags a genuine local box.data change LOCAL_ORIGIN, and does not re-apply an echoed setFromRemote change", () => {
    const data = baseProgram();
    const { current, box, setFromRemote } = makeBoxDouble(data);
    const { rerender } = renderHook(() =>
      useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }),
    );
    act(() => fakeProvider.sync(true)); // bootstrap: seeds the doc from `data`

    // A genuine local edit — mutate the box double's data and rerender.
    const edited = baseProgram({ programName: "Edited locally" });
    current.data = edited;
    rerender();

    expect(readProgramFromDoc(capturedDoc!).programName).toBe("Edited locally");

    // A remote-originated doc update: the real WebsocketProvider stamps the
    // provider instance itself as `origin` for updates it applies from the
    // network (see use-program-room.ts's own doc comment on this — verified
    // against y-partyserver's compiled JS).
    act(() => {
      capturedDoc!.transact(() => {
        capturedDoc!.getMap("meta").set("programName", "Changed remotely");
      }, fakeProvider);
    });
    expect(setFromRemote).toHaveBeenCalledTimes(1);
    expect(setFromRemote.mock.calls[0][0]).toMatchObject({ programName: "Changed remotely" });

    // setFromRemote above already updated the box double's data — model the
    // resulting re-render, exactly like the local-edit branch did.
    rerender();

    // Echo avoidance: that rerender must NOT diff-and-reapply the remote
    // change back to the doc as a second local patch (which would show up
    // as a second setFromRemote call once the doc's own update handler fired
    // again in response).
    expect(setFromRemote).toHaveBeenCalledTimes(1);
  });

  it("showOfflineBadge becomes true only after the debounce delay while disconnected, and clears immediately on reconnect", () => {
    vi.useFakeTimers();
    const data = baseProgram();
    const { box } = makeBoxDouble(data);
    const { result } = renderHook(() => useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }));

    act(() => fakeProvider.sync(true));
    act(() => fakeProvider.goDisconnected());
    expect(result.current.showOfflineBadge).toBe(false);

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.showOfflineBadge).toBe(false);

    act(() => vi.advanceTimersByTime(600));
    expect(result.current.showOfflineBadge).toBe(true);

    act(() => fakeProvider.goConnected());
    expect(result.current.showOfflineBadge).toBe(false);
  });

  it("does not show the badge for a blip that reconnects before the debounce fires", () => {
    vi.useFakeTimers();
    const data = baseProgram();
    const { box } = makeBoxDouble(data);
    const { result } = renderHook(() => useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }));

    act(() => fakeProvider.sync(true));
    act(() => fakeProvider.goDisconnected());
    act(() => vi.advanceTimersByTime(1000));
    act(() => fakeProvider.goConnected());
    act(() => vi.advanceTimersByTime(3000));

    expect(result.current.showOfflineBadge).toBe(false);
  });

  it("tracks a local edit made while disconnected and surfaces a conflict once a post-reconnect sync finds it orphaned", () => {
    const data = baseProgram();
    const { current, box, addConflicts } = makeBoxDouble(data);
    const { rerender } = renderHook(() =>
      useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }),
    );
    act(() => fakeProvider.sync(true)); // bootstrap: seeds from `data` (has milestone "m1")

    act(() => fakeProvider.goDisconnected());

    // A local edit made while offline (provider.wsconnected is false).
    const editedOffline = baseProgram({ milestones: [{ ...data.milestones[0], title: "Edited while offline" }] });
    current.data = editedOffline;
    rerender();
    expect(readProgramFromDoc(capturedDoc!).milestones[0].title).toBe("Edited while offline");

    // Simulate another collaborator deleting that same milestone while this
    // client was offline — directly on the doc, the way a merged remote
    // update would land.
    capturedDoc!.getMap("milestones").delete("m1");

    // Reconnect and resync.
    act(() => fakeProvider.goConnected());
    act(() => fakeProvider.sync(true));

    expect(addConflicts).toHaveBeenCalledTimes(1);
    expect(addConflicts.mock.calls[0][0]).toEqual([{ type: "orphaned", itemKind: "milestone", targetId: "m1", message: expect.any(String) }]);
  });

  it("does not run conflict detection on the very first connect (only a resync after a real drop)", () => {
    const data = baseProgram();
    const { box, addConflicts } = makeBoxDouble(data);
    renderHook(() => useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }));

    act(() => fakeProvider.sync(true));
    act(() => fakeProvider.sync(true)); // a second "synced" ping with no drop in between

    expect(addConflicts).not.toHaveBeenCalled();
  });

  it("shows a peer appearing in awareness, excludes this client's own clientID, and keeps a removed peer until the grace period elapses", () => {
    vi.useFakeTimers();
    const data = baseProgram();
    const { box } = makeBoxDouble(data);
    const { result } = renderHook(() => useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }));
    act(() => fakeProvider.sync(true));

    // Own clientID (1) never shows up even if a state exists for it.
    act(() => fakeProvider.awareness.remoteJoin(fakeProvider.awareness.clientID, { name: "Self", color: "#000", selectedId: null }));
    expect(result.current.peers).toHaveLength(0);

    act(() => fakeProvider.awareness.remoteJoin(2, { name: "Bob", color: "#fff", selectedId: "m1" }));
    expect(result.current.peers).toEqual([{ id: "2", name: "Bob", color: "#fff", selectedId: "m1" }]);

    act(() => fakeProvider.awareness.remoteLeave(2));
    // Still present — inside the grace period.
    expect(result.current.peers).toEqual([{ id: "2", name: "Bob", color: "#fff", selectedId: "m1" }]);

    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.peers).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.peers).toHaveLength(0);
  });

  it("cancels a peer's pending removal if it reappears before the grace period fires", () => {
    vi.useFakeTimers();
    const data = baseProgram();
    const { box } = makeBoxDouble(data);
    const { result } = renderHook(() => useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: true }));
    act(() => fakeProvider.sync(true));

    act(() => fakeProvider.awareness.remoteJoin(2, { name: "Bob", color: "#fff", selectedId: null }));
    act(() => fakeProvider.awareness.remoteLeave(2));
    act(() => vi.advanceTimersByTime(2000));
    act(() => fakeProvider.awareness.remoteJoin(2, { name: "Bob", color: "#fff", selectedId: "m1" }));
    act(() => vi.advanceTimersByTime(4000)); // past the original 5s grace window

    expect(result.current.peers).toEqual([{ id: "2", name: "Bob", color: "#fff", selectedId: "m1" }]);
  });

  it("does nothing (no connection) while enabled is false", () => {
    const data = baseProgram();
    const { box } = makeBoxDouble(data);
    renderHook(() => useProgramRoom({ programId: "p1", box: box(), access: { shareToken: "t" }, identity: { name: "Ann", identityKey: "ann@x.com" }, selectedId: null, enabled: false }));
    expect(connectProgramRoomMock).not.toHaveBeenCalled();
  });
});
