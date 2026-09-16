import * as Y from "yjs";

/**
 * wayframe#t15's resolution: one Y.UndoManager per (user, Program, active
 * target) — Baseline or one open Scenario — not the single linear stack of
 * full-document snapshots use-correction-box.ts's `history` still uses
 * today (that reducer predates any CRDT wiring, undoes the whole document
 * at once, and is untouched by this ticket — it has nothing to do with the
 * future Yjs-backed editing path t4/t14 scaffolded but that nothing yet
 * writes through).
 *
 * "Per user" falls out for free from Yjs's own model rather than needing an
 * explicit identity key here: each connected client already holds its own
 * local Y.Doc (provider.ts's connectProgramRoom, one per Program), and
 * Y.UndoManager only reverts transactions whose origin is in its
 * `trackedOrigins` set. Tagging every local edit transaction with
 * LOCAL_ORIGIN and scoping every manager below to
 * `trackedOrigins: new Set([LOCAL_ORIGIN])` means a manager structurally
 * can never revert a transaction that arrived from a remote peer (synced
 * updates apply under y-partyserver's own remote origin, never
 * LOCAL_ORIGIN) — so a user's undo can't revert a collaborator's edit, with
 * no per-user identity bookkeeping required. "Per Program" likewise falls
 * out from one ProgramUndoManagers instance living per Program's own Y.Doc;
 * nothing in this file juggles multiple Programs at once —
 * AllProgramsUndoRouter (below) is the piece that does, for the merged
 * All-Programs view (t26).
 *
 * Callers wrapping a local edit as `doc.transact(fn, LOCAL_ORIGIN)` is the
 * other half of this contract; that wiring belongs to whichever future
 * ticket builds the actual client<->Yjs bridge for Program content (t14's
 * "nothing constructs a Program's Y.Map layout from its JSON shape yet" is
 * still true as of this ticket). This file only owns the undo-manager
 * lifecycle for once that bridge exists to hand it real Yjs shared types —
 * same "scaffolded but deliberately unconsumed" treatment t13/t14 already
 * carry.
 */
export const LOCAL_ORIGIN = Symbol("wayframe-local-edit");

/**
 * Which slice of a Program's document a given Y.UndoManager should track —
 * Baseline (the top-level `lanes`/`milestones`/`topLevelItems` maps, t14's
 * reserved top-level-key convention) or one open Scenario (its own nested
 * `scenarios.get(id)` Y.Map, per t14's `scenarios: Y.Map<string, Y.Map>`
 * convention). This mirrors #87/t13's own disjoint Baseline/Scenario
 * storage shape ("Baseline/Scenario undo are already disjoint per #87's own
 * storage shape" — this ticket's gist) so scoping an UndoManager to one
 * target structurally can't revert edits made against the other.
 */
export type UndoTarget = { kind: "baseline" } | { kind: "scenario"; scenarioId: string };

export function undoTargetKey(target: UndoTarget): string {
  return target.kind === "baseline" ? "baseline" : `scenario:${target.scenarioId}`;
}

/**
 * The Yjs shared type(s) an UndoManager should scope to for `target`,
 * against one Program's Y.Doc. Baseline content lives directly on the
 * doc's own top-level maps (t14's reserved names); a Scenario's content
 * lives one level down, inside its own entry of the top-level `scenarios`
 * map — lazily created here on first visit rather than requiring whichever
 * future ticket builds the real editing bridge to pre-create every
 * Scenario's Y.Map before undo can be wired up for it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches Y.UndoManager's own `typeScope` parameter type, which is invariant in its generic and rejects narrower element types like `AbstractType<unknown>[]`.
function resolveUndoScope(doc: Y.Doc, target: UndoTarget): Y.AbstractType<any> | Y.AbstractType<any>[] {
  if (target.kind === "baseline") {
    return [doc.getArray("swimlanes"), doc.getMap("milestones"), doc.getMap("topLevelItems")];
  }
  const scenarios = doc.getMap<Y.Map<unknown>>("scenarios");
  let scenario = scenarios.get(target.scenarioId);
  if (!scenario) {
    scenario = new Y.Map();
    scenarios.set(target.scenarioId, scenario);
  }
  return scenario;
}

/**
 * One Program's worth of Y.UndoManagers, keyed by target (Baseline vs a
 * given open Scenario) and lazily created — a Program on which no Scenario
 * was ever opened only ever allocates the Baseline manager.
 *
 * Switching targets (setActiveTarget) swaps which manager undo()/redo()
 * delegate to without destroying the one left behind — "parking, not
 * discarding" per the ticket's own wording — so flipping back to a
 * Scenario mid-session still has its own stack intact, and so does Baseline
 * if you'd switched away from it.
 */
export class ProgramUndoManagers {
  private readonly doc: Y.Doc;
  private readonly managers = new Map<string, Y.UndoManager>();
  private activeKey: string = undoTargetKey({ kind: "baseline" });

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.getOrCreate({ kind: "baseline" }); // active by default — see activeKey's initializer
  }

  private getOrCreate(target: UndoTarget): Y.UndoManager {
    const key = undoTargetKey(target);
    let manager = this.managers.get(key);
    if (!manager) {
      manager = new Y.UndoManager(resolveUndoScope(this.doc, target), { trackedOrigins: new Set([LOCAL_ORIGIN]) });
      this.managers.set(key, manager);
    }
    return manager;
  }

  /**
   * Switches which target's stack is live. Call this on every Scenario
   * open/close or Baseline<->Scenario toggle, before dispatching the edit
   * itself — an edit applied against a target whose manager isn't yet
   * active would get tracked into the wrong (or no) stack.
   */
  setActiveTarget(target: UndoTarget): void {
    this.getOrCreate(target);
    this.activeKey = undoTargetKey(target);
  }

  get activeTargetKey(): string {
    return this.activeKey;
  }

  private get active(): Y.UndoManager | undefined {
    return this.managers.get(this.activeKey);
  }

  undo(): void {
    this.active?.undo();
  }

  redo(): void {
    this.active?.redo();
  }

  canUndo(): boolean {
    return (this.active?.undoStack.length ?? 0) > 0;
  }

  canRedo(): boolean {
    return (this.active?.redoStack.length ?? 0) > 0;
  }

  /**
   * Tears down every target's manager for this Program. Call this when the
   * Program's Y.Doc itself is being disconnected/destroyed (leaving the
   * Program entirely) — not on an ordinary Scenario switch, which should
   * park via setActiveTarget instead, never destroy.
   */
  destroy(): void {
    for (const manager of this.managers.values()) manager.destroy();
    this.managers.clear();
  }
}

/**
 * The merged All-Programs view (t26) needs no undo stack of its own —
 * every edit made there still belongs to exactly one Program, so per this
 * ticket's own gist this is "a thin local router dispatching Ctrl+Z to the
 * right per-Program manager, not a new kind of stack." It tracks only
 * which Program most recently received a local edit through the merged
 * view and routes undo()/redo() there; each Program keeps its own
 * ProgramUndoManagers exactly as it would on-screen.
 */
export class AllProgramsUndoRouter {
  private readonly managers = new Map<string, ProgramUndoManagers>();
  private lastEditedProgramId: string | undefined;

  registerProgram(programId: string, managers: ProgramUndoManagers): void {
    this.managers.set(programId, managers);
  }

  unregisterProgram(programId: string): void {
    this.managers.delete(programId);
    if (this.lastEditedProgramId === programId) this.lastEditedProgramId = undefined;
  }

  /**
   * Call this whenever a local edit is applied through the merged view,
   * naming the Program it actually targeted — every edit still belongs to
   * one Program (this ticket's gist), so this just remembers which one was
   * most recent, for undo()/redo() to route to.
   */
  noteLocalEdit(programId: string): void {
    this.lastEditedProgramId = programId;
  }

  undo(): void {
    if (this.lastEditedProgramId) this.managers.get(this.lastEditedProgramId)?.undo();
  }

  redo(): void {
    if (this.lastEditedProgramId) this.managers.get(this.lastEditedProgramId)?.redo();
  }
}
