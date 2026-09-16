import * as Y from "yjs";
import type { Milestone, Program, Swimlane, TopLevelItem } from "@/components/timeline/types";

/**
 * The client<->Yjs bridge for one Program room (wayframe t38) — t4 built
 * `connectProgramRoom` (provider.ts) and t14/party/src/index.ts reserved the
 * server-side room topology, but as of t38 nothing anywhere converted a
 * Program's plain-object JSON shape into Yjs shared types or back; this file
 * is that bridge, and the single source of truth for the Y.Doc's top-level
 * shape. party/src/index.ts's own doc comment defers to "whichever ticket
 * wires up real live editing" for this exact layout — this is it.
 *
 * Top-level shape, one Y.Doc per Program room:
 *  - `doc.getArray<Y.Map<unknown>>("swimlanes")` — one Y.Map per Swimlane, in
 *    array order (order is the one collection where array position IS the
 *    meaning, so it gets a real Y.Array rather than a keyed Y.Map). Swimlane
 *    has no nested collections of its own, so each entry is a flat Y.Map of
 *    its plain-JS fields.
 *  - `doc.getMap<Y.Map<unknown>>("milestones")` — keyed by Milestone id, one
 *    flat Y.Map per Milestone. Milestone's own fields are flat/scalar or
 *    small nested values (`dependsOn: DependencyEdge[]`, `attachments`,
 *    `styleOverride`) with no meaningful sub-field CRDT-merge story — two
 *    people don't co-edit one milestone's dependency list field-by-field the
 *    same way they might its `title` vs its `status` concurrently — so each
 *    field is stored as one opaque `Y.Map.set(key, value)` leaf, never
 *    exploded into its own nested Y type.
 *  - `doc.getMap<Y.Map<unknown>>("topLevelItems")` — same idiom, keyed by
 *    TopLevelItem id. TopLevelItem is a discriminated union
 *    (`type: "milestone" | "phase" | "annotation"`); the whole variant's
 *    fields (including the `type` discriminant itself) land flat on one
 *    Y.Map per item.
 *  - `doc.getMap<unknown>("meta")` — one flat Y.Map holding every other
 *    scalar/simple Program field (see META_FIELDS below): id, portfolioId,
 *    order, programName, generatedAt, lastUpdatedAt, owner, reportsTo,
 *    nextReviewDate, styleDefaults, bluf, actionItems. `bluf`'s rich text is
 *    edited as a whole by one person at a time in the existing UI, so it (and
 *    the other meta fields) is stored as a single opaque value, not exploded
 *    further.
 *
 * Deliberately excluded: `Scenario` (src/lib/scenario/types.ts) lives on
 * Portfolio, not Program, and has no `programId` tying it to one Program even
 * though its overrides target Program-scoped ids — pre-existing architecture
 * debt, out of scope here. party/src/index.ts reserves a `scenarios: Y.Map`
 * top-level key as documentation-only for a future ticket; this file doesn't
 * populate it.
 *
 * Known gap for whoever consumes this next (fork 2, wiring the real
 * room-connection hook): src/lib/realtime/undo-manager.ts's
 * `resolveUndoScope` already reads `doc.getArray("lanes")` for Baseline's
 * undo scope — that key name doesn't match this file's `"swimlanes"`. That
 * file predates this bridge (it says so in its own doc comment) and is out
 * of scope for this ticket to fix; whoever wires undo up for real needs to
 * reconcile the two, most likely by correcting undo-manager.ts's key name to
 * `"swimlanes"` to match the shape documented here.
 *
 * Ordering caveat: `topLevelItems`/`milestones` are Y.Maps keyed by id with
 * no inherent order guarantee across peers/reloads — `readProgramFromDoc`
 * reads them in the underlying Map's iteration order, which is not
 * guaranteed stable across clients (the same caveat any Yjs Y.Map-backed
 * collection has). This is acceptable because nothing in the app depends on
 * `milestones`/`topLevelItems` array order for correctness — only
 * `swimlanes` order matters, which is why it's the one Y.Array, preserving
 * order natively.
 */

/** Every scalar/simple Program field stored flat on the doc's `"meta"` Y.Map — see this file's top doc comment. */
const META_FIELDS = [
  "id",
  "portfolioId",
  "order",
  "programName",
  "generatedAt",
  "lastUpdatedAt",
  "owner",
  "reportsTo",
  "nextReviewDate",
  "styleDefaults",
  "bluf",
  "actionItems",
] as const satisfies readonly (keyof Program)[];

type MetaField = (typeof META_FIELDS)[number];

/** Deep-equality via JSON comparison — the same idiom use-correction-box.ts's `bumpChangedRevs` (line 196+) already uses to diff items, reused here per this ticket's own instruction to match that precedent rather than invent a second diffing convention. */
function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Sets every defined key of `obj` as a flat leaf on a fresh Y.Map — the shared "one flat Y.Map per item" constructor for swimlanes/milestones/topLevelItems entries. */
function objectToYMap(obj: Record<string, unknown>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) map.set(key, value);
  }
  return map;
}

/** Reads a flat Y.Map's entries back into a plain object. */
function yMapToObject<T>(map: Y.Map<unknown>): T {
  return Object.fromEntries(map.entries()) as T;
}

/**
 * True iff the doc's `"meta"` Y.Map already has an `id` — the guard a
 * room-connection hook uses to decide "am I the first client, do I need to
 * seed this room from the REST-fetched Program, or has someone already
 * populated it and I should read from it instead."
 */
export function isProgramDocSeeded(doc: Y.Doc): boolean {
  return doc.getMap("meta").has("id");
}

/**
 * Populates all four top-level types from `program`, wrapped in exactly one
 * `doc.transact`. No-op if the doc is already seeded (`isProgramDocSeeded`)
 * — never clobbers existing collaborative state, defensively, since a caller
 * racing another client's seed is exactly the scenario this guards.
 *
 * `origin` is threaded through to `doc.transact` rather than hardcoded —
 * fork 2 will pass `LOCAL_ORIGIN` (src/lib/realtime/undo-manager.ts) here
 * when wiring this into the real room-connection hook.
 */
export function seedProgramDoc(doc: Y.Doc, program: Program, origin?: unknown): void {
  if (isProgramDocSeeded(doc)) return;
  doc.transact(() => {
    const meta = doc.getMap<unknown>("meta");
    for (const field of META_FIELDS) {
      const value = program[field as MetaField];
      if (value !== undefined) meta.set(field, value);
    }

    const swimlanes = doc.getArray<Y.Map<unknown>>("swimlanes");
    swimlanes.push(program.swimlanes.map((lane) => objectToYMap(lane as unknown as Record<string, unknown>)));

    const milestones = doc.getMap<Y.Map<unknown>>("milestones");
    for (const milestone of program.milestones) {
      milestones.set(milestone.id, objectToYMap(milestone as unknown as Record<string, unknown>));
    }

    const topLevelItems = doc.getMap<Y.Map<unknown>>("topLevelItems");
    for (const item of program.topLevelItems) {
      topLevelItems.set(item.id, objectToYMap(item as unknown as Record<string, unknown>));
    }
  }, origin);
}

/**
 * Pure read — walks the four top-level types and reconstructs a plain
 * `Program` matching the interface exactly. Round-trips
 * `readProgramFromDoc(seed-then-read)` back to the original `program` passed
 * to `seedProgramDoc`, field-for-field (see program-ydoc.test.ts). See this
 * file's top doc comment for the `milestones`/`topLevelItems` ordering
 * caveat.
 */
export function readProgramFromDoc(doc: Y.Doc): Program {
  const meta = yMapToObject<Record<MetaField, unknown>>(doc.getMap<unknown>("meta"));

  const swimlanes = doc
    .getArray<Y.Map<unknown>>("swimlanes")
    .toArray()
    .map((entry) => yMapToObject<Swimlane>(entry));

  const milestones = Array.from(doc.getMap<Y.Map<unknown>>("milestones").values()).map((entry) => yMapToObject<Milestone>(entry));

  const topLevelItems = Array.from(doc.getMap<Y.Map<unknown>>("topLevelItems").values()).map((entry) => yMapToObject<TopLevelItem>(entry));

  return {
    ...meta,
    swimlanes,
    milestones,
    topLevelItems,
  } as unknown as Program;
}

/**
 * Diffs `previous` vs `next` and writes ONLY the changed pieces into the
 * doc's shared types, wrapped in exactly one `doc.transact`.
 *
 *  - `swimlanes`: if the array differs at all (length/order/any lane's
 *    fields) from `previous`, the whole Y.Array is rebuilt (deleted and
 *    re-inserted in `next`'s order) inside the one transaction — per this
 *    ticket's own instruction, Y.Array's CRDT still merges concurrent
 *    inserts/deletes correctly even when one peer's transaction touches the
 *    whole array's arrangement, and this collection is small (a handful of
 *    lanes), so a minimal-diff reorder algorithm isn't worth building.
 *    No-op when nothing changed.
 *  - `milestones`/`topLevelItems`: for each id in `next` that's new or whose
 *    `JSON.stringify` differs from `previous`, only the changed leaf keys are
 *    set on its (find-or-create) Y.Map — an unchanged item's Y.Map is never
 *    touched, preserving its identity and any concurrent field-level edit a
 *    remote peer made to it that hasn't round-tripped back into `previous`
 *    yet. Ids present in `previous` but absent from `next` are deleted.
 *  - `meta`: each scalar field is `set` only if it changed; a field that
 *    became `undefined` is `delete`d rather than set to `undefined` (Y.Map
 *    has no concept of a present-but-undefined value).
 *
 * Calling with no actual differences still calls `doc.transact` (with an
 * effectively empty body) rather than skipping it — keeps this function's
 * "always exactly one transact call" contract simple for callers that may
 * want to observe the doc's "update" event as a heartbeat.
 */
export function applyProgramPatch(doc: Y.Doc, previous: Program, next: Program, origin?: unknown): void {
  doc.transact(() => {
    patchSwimlanes(doc.getArray<Y.Map<unknown>>("swimlanes"), previous.swimlanes, next.swimlanes);
    patchKeyedCollection(doc.getMap<Y.Map<unknown>>("milestones"), previous.milestones, next.milestones);
    patchKeyedCollection(doc.getMap<Y.Map<unknown>>("topLevelItems"), previous.topLevelItems, next.topLevelItems);
    patchMeta(doc.getMap<unknown>("meta"), previous, next);
  }, origin);
}

function patchSwimlanes(swimlanes: Y.Array<Y.Map<unknown>>, previous: readonly Swimlane[], next: readonly Swimlane[]): void {
  const changed = previous.length !== next.length || previous.some((lane, i) => !jsonEqual(lane, next[i]));
  if (!changed) return;
  swimlanes.delete(0, swimlanes.length);
  swimlanes.insert(0, next.map((lane) => objectToYMap(lane as unknown as Record<string, unknown>)));
}

function patchKeyedCollection<T extends { id: string }>(yMap: Y.Map<Y.Map<unknown>>, previous: readonly T[], next: readonly T[]): void {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));

  for (const item of next) {
    const before = previousById.get(item.id);
    if (before && jsonEqual(before, item)) continue; // unchanged — leave the existing Y.Map (and its identity) alone

    let entry = yMap.get(item.id);
    if (!entry) {
      entry = objectToYMap({});
      yMap.set(item.id, entry);
    }

    const beforeObj = (before ?? {}) as Record<string, unknown>;
    const nextObj = item as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(nextObj)) {
      if (!jsonEqual(beforeObj[key], value)) entry.set(key, value);
    }
    // A field that existed on `before` but is no longer a key of `next` (an
    // optional field cleared to `undefined`, which drops the key entirely
    // under JSON semantics) needs an explicit delete — a stale leaf left on
    // the Y.Map would otherwise resurface on the next `readProgramFromDoc`.
    for (const key of Object.keys(beforeObj)) {
      if (!(key in nextObj)) entry.delete(key);
    }
  }

  for (const id of previousById.keys()) {
    if (!nextIds.has(id)) yMap.delete(id);
  }
}

function patchMeta(meta: Y.Map<unknown>, previous: Program, next: Program): void {
  for (const field of META_FIELDS) {
    const before = previous[field as MetaField];
    const after = next[field as MetaField];
    if (jsonEqual(before, after)) continue;
    if (after === undefined) meta.delete(field);
    else meta.set(field, after);
  }
}
