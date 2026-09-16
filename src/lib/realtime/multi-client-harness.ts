import * as Y from "yjs";
import type { Program } from "@/components/timeline/types";
import { applyProgramPatch, readProgramFromDoc, seedProgramDoc } from "./program-ydoc";

/**
 * In-process multi-client CRDT simulation harness (t42, wayframe's own
 * testing-strategy ticket) — the "primary mechanism" its gist calls for:
 * multiple real `Y.Doc` instances in one Node/vitest process, no network,
 * scripted concurrent operations, asserting all clients converge to the
 * identical final Program. This deliberately does NOT re-test Yjs's own
 * convergence algorithm (t42's gist: "trust Yjs's own convergence guarantee
 * as a mature dependency") — it tests *our* bridge code layered on top
 * (program-ydoc.ts's seed/patch/read round-trip) under realistic concurrent
 * multi-client interleavings, the same way program-ydoc.test.ts already
 * tests it under a single client.
 *
 * `syncAll` stands in for a real Partykit room's broadcast: every client
 * exchanges its full current state with every other client in one pass.
 * One pass is always sufficient regardless of client count or how many
 * local edits preceded it — `Y.encodeStateAsUpdate` already encodes
 * everything that doc has ever seen (including updates it received from a
 * previous `syncAll` call), and `Y.applyUpdate` is idempotent, so repeated
 * or out-of-order delivery can never cause divergence, only redundant work.
 */
export interface SimulatedClient {
  id: string;
  doc: Y.Doc;
}

/**
 * Creates the FIRST client of a simulated room and seeds it from `seed`.
 * Only ever call this once per room/test — every other client must join via
 * `joinSimulatedClient` instead, never by calling this a second time with
 * the same (or an equivalent) `seed` value. Two independently-seeded
 * `Y.Doc`s are NOT the same CRDT structure even when built from identical
 * JSON: each `objectToYMap`/array-insert call creates brand-new, causally
 * unrelated Yjs items, so merging two such docs produces duplicated array
 * entries and keyed-map writes/deletes that don't causally dominate each
 * other's independently-created entries — this bit a first draft of this
 * harness's own tests (t42). It also isn't how production ever works:
 * `use-program-room.ts`'s `bootstrapIfNeeded` only calls `seedProgramDoc`
 * after the provider has already synced with the room and found it empty
 * (`isProgramDocSeeded` false) — a real second client always syncs first
 * and only ever *reads*, never independently re-seeds.
 */
export function createSimulatedClient(id: string, seed: Program): SimulatedClient {
  const doc = new Y.Doc();
  seedProgramDoc(doc, seed, id);
  return { id, doc };
}

/**
 * Joins an already-seeded room: creates a fresh `Y.Doc` and syncs it from
 * `existing` before returning, so the new client starts from the exact same
 * CRDT structure (not just the same JSON value) as every other client
 * already in the room — mirrors `bootstrapIfNeeded`'s real "provider synced
 * and found the doc already seeded, so just read" branch. Always use this
 * for every client after the room's first (`createSimulatedClient`).
 */
export function joinSimulatedClient(id: string, existing: SimulatedClient): SimulatedClient {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(existing.doc), "join-sync");
  return { id, doc };
}

/** Applies a local edit on one client's own doc, using this client's own id as the transaction origin — the local-edit half of the room-connection hook's echo-avoidance convention (use-program-room.ts), scoped here per simulated client instead of the real `LOCAL_ORIGIN` singleton since multiple simulated clients coexist in one process. */
export function applyLocalEdit(client: SimulatedClient, previous: Program, next: Program): void {
  applyProgramPatch(client.doc, previous, next, client.id);
}

/**
 * Exchanges every client's full current state with every other client.
 * Order of the inner exchange never matters (see this file's top doc
 * comment) — callers use this to simulate anything from "everyone was
 * online the whole time" (call after every local edit) to "everyone was
 * offline and edited independently, now reconnecting" (call once at the
 * end), and property-based tests below shuffle the exchange order itself to
 * prove that doesn't matter either.
 */
export function syncAll(clients: SimulatedClient[]): void {
  const snapshots = clients.map((c) => Y.encodeStateAsUpdate(c.doc));
  clients.forEach((client, i) => {
    snapshots.forEach((snapshot, j) => {
      if (i === j) return;
      Y.applyUpdate(client.doc, snapshot, "remote-sync");
    });
  });
}

/**
 * Recursively sorts object keys (arrays keep their element order) so two
 * structurally-identical values compare equal under `JSON.stringify`
 * regardless of property insertion order — needed because a Y.Map's
 * iteration order isn't guaranteed identical across replicas even once
 * they've fully converged (program-ydoc.ts's own doc comment flags this for
 * `milestones`/`topLevelItems`), so raw `JSON.stringify` on the objects
 * `yMapToObject` produces is not a safe convergence check.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Converts a `Program` into a value safe to compare across clients for
 * convergence: `milestones`/`topLevelItems` (whose *array order* is not
 * meaningful, per program-ydoc.ts) become id-keyed records so two clients
 * holding the same set of items in a different iteration order still
 * compare equal; every remaining field (including `swimlanes`, whose order
 * IS meaningful) is left as-is, then the whole thing is `canonicalize`d.
 * Use this — never a raw `Program` — as the input to `expect(...).toEqual`
 * in a convergence assertion.
 */
export function normalizeProgramForComparison(program: Program): unknown {
  const byId = <T extends { id: string }>(items: readonly T[]): Record<string, T> => Object.fromEntries(items.map((item) => [item.id, item]));
  return canonicalize({
    ...program,
    milestones: byId(program.milestones),
    topLevelItems: byId(program.topLevelItems),
  });
}

/** Convenience: reads and normalizes one client's current Program view in one call. */
export function readNormalized(client: SimulatedClient): unknown {
  return normalizeProgramForComparison(readProgramFromDoc(client.doc));
}
