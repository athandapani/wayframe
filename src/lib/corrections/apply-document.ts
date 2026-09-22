import type { Rag, Program, Swimlane, SwimlaneGroup } from "@/components/timeline/types";
import type { DeleteOp, NamedLaneColor, SwimlaneOp } from "./schema";

/**
 * Whole-document mutations (wayframe#58) — distinct from apply.ts's
 * applyOps/applyAddMilestoneOps, which only ever touch the milestone list.
 * Deletes and swimlane management reach across milestones/topLevelItems/
 * swimlanes together (e.g. deleting a lane also strips the milestones it
 * owns), so each op here takes and returns the full Program. These are
 * the single source of truth for that cleanup logic — useCorrectionBox's
 * manual reducer actions (removeMilestone, removeSwimlane, addSwimlane,
 * renameSwimlane, moveSwimlane, setLaneColor) call the same functions
 * rather than re-implementing the cleanup, so the manual-UI path and the
 * AI-correction path can't drift apart.
 */

/** Curated recolor palette (wayframe#58) — resolves a model-emitted name to a real hex value; the model itself never emits a hex. */
const NAMED_LANE_COLOR_HEX: Record<NamedLaneColor, string> = {
  red: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
  blue: "#2563eb",
  purple: "#9333ea",
  gray: "#6b7280",
};

export function resolveNamedLaneColor(name: NamedLaneColor): string {
  return NAMED_LANE_COLOR_HEX[name];
}

/** Mirrors removeSwimlane's dependsOn cleanup: a milestone other milestones depend on can't vanish and leave those edges dangling (wayframe#38 item 3 / #39). */
export function removeMilestoneOp(data: Program, id: string): Program {
  const milestones = data.milestones
    .filter((m) => m.id !== id)
    .map((m) => (m.dependsOn.some((d) => d.id === id) ? { ...m, dependsOn: m.dependsOn.filter((d) => d.id !== id) } : m));
  return { ...data, milestones };
}

/** A lane owns its milestones, so deleting it deletes them too, then strips any OTHER milestone's dependency on one of the doomed ids. Order is renumbered so no gaps remain. */
export function removeSwimlaneOp(data: Program, id: string): Program {
  const doomed = new Set(data.milestones.filter((m) => m.laneId === id).map((m) => m.id));
  const milestones = data.milestones
    .filter((m) => m.laneId !== id)
    .map((m) => (m.dependsOn.some((d) => doomed.has(d.id)) ? { ...m, dependsOn: m.dependsOn.filter((d) => !doomed.has(d.id)) } : m));
  const swimlanes = data.swimlanes
    .filter((l) => l.id !== id)
    .sort((a, b) => a.order - b.order)
    .map((l, i) => ({ ...l, order: i }));
  return { ...data, swimlanes, milestones };
}

/** No dependsOn/laneId to clean up, unlike a milestone — but a lane milestone can link to a top-level milestone (linksToTopLevelMilestone), so that reference is cleared the same way removeMilestoneOp clears dependsOn edges. */
export function removeTopLevelItemOp(data: Program, id: string): Program {
  const topLevelItems = data.topLevelItems.filter((t) => t.id !== id);
  const milestones = data.milestones.map((m) => (m.linksToTopLevelMilestone === id ? { ...m, linksToTopLevelMilestone: null } : m));
  return { ...data, topLevelItems, milestones };
}

export function addSwimlaneOp(data: Program, swimlaneType: "lane" | "separator", name: string, newId: string): Program {
  const nextOrder = data.swimlanes.reduce((max, l) => Math.max(max, l.order), -1) + 1;
  return { ...data, swimlanes: [...data.swimlanes, { id: newId, order: nextOrder, type: swimlaneType, name }] };
}

export function renameSwimlaneOp(data: Program, id: string, name: string): Program {
  return { ...data, swimlanes: data.swimlanes.map((l) => (l.id === id ? { ...l, name } : l)) };
}

/**
 * t21: a "top-level" entry is either an ungrouped Swimlane (no `groupId`,
 * or a `groupId` that doesn't resolve to a real SwimlaneGroup — a
 * dangling reference is treated the same as ungrouped, never as an error)
 * or a SwimlaneGroup itself — the two are peers sharing one order space,
 * exactly like a separator row and a lane were peers before t21. Grouped
 * lanes (real membership) are excluded; they live in their own group-
 * scoped order space instead.
 */
type TopLevelEntry = { kind: "lane"; item: Swimlane } | { kind: "group"; item: SwimlaneGroup };

function isTopLevelLane(l: Swimlane, realGroupIds: ReadonlySet<string>): boolean {
  return l.groupId === undefined || !realGroupIds.has(l.groupId);
}

/** t26: mirrors isTopLevelLane one tier up — a group with a `parentGroupId` resolving to another real SwimlaneGroup is really nested, not top-level, even though nothing enforced that distinction before t26 (see moveSwimlaneGroupOp's doc for why it matters now). */
function isTopLevelGroup(g: SwimlaneGroup, realGroupIds: ReadonlySet<string>): boolean {
  return g.parentGroupId === undefined || !realGroupIds.has(g.parentGroupId);
}

function topLevelEntries(data: Program): TopLevelEntry[] {
  const realGroupIds = new Set((data.swimlaneGroups ?? []).map((g) => g.id));
  const lanes: TopLevelEntry[] = data.swimlanes.filter((l) => isTopLevelLane(l, realGroupIds)).map((l) => ({ kind: "lane", item: l }));
  const groups: TopLevelEntry[] = (data.swimlaneGroups ?? []).filter((g) => isTopLevelGroup(g, realGroupIds)).map((g) => ({ kind: "group", item: g }));
  return [...lanes, ...groups].sort((a, b) => a.item.order - b.item.order);
}

/**
 * The top-level order space's next free slot — max `order` across every Swimlane (grouped or not) and every SwimlaneGroup, +1. Scanning grouped lanes too (not just top-level ones) costs nothing but a possible unused gap, and guarantees no collision with anything anywhere in the document, group-scoped or not.
 *
 * Exported for src/lib/corrections/cross-program-move.ts (wayframe#124): a
 * swimlane arriving from another Program via the cross-Program move
 * primitive is placed exactly like a freshly-added one — appended at the end
 * of the DESTINATION Program's own top-level order space, same as
 * `addSwimlaneOp` — since its `groupId` (a different Program's id space) is
 * dropped rather than carried over.
 */
export function topOrderSpaceNextOrder(data: Program): number {
  const swimlaneMax = data.swimlanes.reduce((max, l) => Math.max(max, l.order), -1);
  const groupMax = (data.swimlaneGroups ?? []).reduce((max, g) => Math.max(max, g.order), -1);
  return Math.max(swimlaneMax, groupMax) + 1;
}

/**
 * Shared swap-and-renumber-from-0 core for both moveSwimlaneOp's ungrouped
 * branch and moveSwimlaneGroupOp — the combined top-level list is the same
 * order space either way, only which entry is being moved differs. Omits
 * `swimlaneGroups` from the result entirely when the source document never
 * had one (rather than writing back `[]`), so a zero-group document's
 * moveSwimlaneOp output stays byte-identical to before t21.
 */
function swapAndRenumberTopLevel(data: Program, entries: TopLevelEntry[], i: number, delta: -1 | 1): Program {
  const j = i + delta;
  if (i === -1 || j < 0 || j >= entries.length) return data;
  const next = [...entries];
  [next[i], next[j]] = [next[j], next[i]];
  const laneOrderById = new Map<string, number>();
  const groupOrderById = new Map<string, number>();
  next.forEach((e, k) => {
    if (e.kind === "lane") laneOrderById.set(e.item.id, k);
    else groupOrderById.set(e.item.id, k);
  });
  const swimlanes = data.swimlanes.map((l) => (laneOrderById.has(l.id) ? { ...l, order: laneOrderById.get(l.id)! } : l));
  if (!data.swimlaneGroups) return { ...data, swimlanes };
  const swimlaneGroups = data.swimlaneGroups.map((g) => (groupOrderById.has(g.id) ? { ...g, order: groupOrderById.get(g.id)! } : g));
  return { ...data, swimlanes, swimlaneGroups };
}

/**
 * Generalized for t21: a grouped lane's ▲/▼ swaps only among its group's
 * member lanes (siblings sharing `groupId`, renumbered among themselves);
 * an ungrouped lane's ▲/▼ swaps among top-level peers instead — other
 * ungrouped lanes and SwimlaneGroups — never among a group's internal
 * members. Pre-t21 (zero-group) documents have no grouped lanes and no
 * SwimlaneGroups, so every lane takes the ungrouped branch and
 * topLevelEntries/swapAndRenumberTopLevel reduce to exactly the old
 * sort-swap-renumber-from-0 behavior over `data.swimlanes` alone.
 */
export function moveSwimlaneOp(data: Program, id: string, delta: -1 | 1): Program {
  const target = data.swimlanes.find((l) => l.id === id);
  if (!target) return data;
  const realGroupIds = new Set((data.swimlaneGroups ?? []).map((g) => g.id));
  const inRealGroup = target.groupId !== undefined && realGroupIds.has(target.groupId);

  if (inRealGroup) {
    const siblings = data.swimlanes.filter((l) => l.groupId === target.groupId).sort((a, b) => a.order - b.order);
    const i = siblings.findIndex((l) => l.id === id);
    const j = i + delta;
    if (j < 0 || j >= siblings.length) return data;
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    const orderById = new Map(siblings.map((l, k) => [l.id, k]));
    const swimlanes = data.swimlanes.map((l) => (orderById.has(l.id) ? { ...l, order: orderById.get(l.id)! } : l));
    return { ...data, swimlanes };
  }

  const entries = topLevelEntries(data);
  const i = entries.findIndex((e) => e.kind === "lane" && e.item.id === id);
  return swapAndRenumberTopLevel(data, entries, i, delta);
}

/** Mirrors addSwimlaneOp's placement/pattern — a new SwimlaneGroup, appended at the end of the top-level order space. `color`/`collapsed` start unset. */
export function addSwimlaneGroupOp(data: Program, name: string, newId: string): Program {
  const nextOrder = topOrderSpaceNextOrder(data);
  return { ...data, swimlaneGroups: [...(data.swimlaneGroups ?? []), { id: newId, order: nextOrder, name }] };
}

/** Mirrors renameSwimlaneOp. */
export function renameSwimlaneGroupOp(data: Program, id: string, name: string): Program {
  return { ...data, swimlaneGroups: (data.swimlaneGroups ?? []).map((g) => (g.id === id ? { ...g, name } : g)) };
}

/**
 * A group is an organizational wrapper, not an owner of its lanes the way
 * a lane owns its milestones — removing it ungroups its member lanes
 * (`groupId: undefined`) rather than deleting them. Each orphaned lane
 * gets a fresh top-level `order` (same order-space computation
 * addSwimlaneGroupOp uses), incrementing per lane so multiple
 * simultaneously-orphaned lanes don't collide with each other.
 */
export function removeSwimlaneGroupOp(data: Program, id: string): Program {
  const swimlaneGroups = (data.swimlaneGroups ?? []).filter((g) => g.id !== id);
  let nextOrder = topOrderSpaceNextOrder(data);
  const swimlanes = data.swimlanes.map((l) => {
    if (l.groupId !== id) return l;
    const order = nextOrder;
    nextOrder += 1;
    return { ...l, groupId: undefined, order };
  });
  return { ...data, swimlaneGroups, swimlanes };
}

/** Mirrors setLaneColorOp's placement/pattern, for a SwimlaneGroup instead of a Swimlane. */
export function setSwimlaneGroupColorOp(data: Program, id: string, color: string | undefined): Program {
  return { ...data, swimlaneGroups: (data.swimlaneGroups ?? []).map((g) => (g.id === id ? { ...g, color } : g)) };
}

/** Mirrors setLaneHiddenOp's placement/pattern, for a SwimlaneGroup's collapsed state. */
export function setSwimlaneGroupCollapsedOp(data: Program, id: string, collapsed: boolean): Program {
  return { ...data, swimlaneGroups: (data.swimlaneGroups ?? []).map((g) => (g.id === id ? { ...g, collapsed } : g)) };
}

/**
 * A group's true sibling scope (t26 generalization of the t21 pattern
 * moveSwimlaneOp already applies to lanes, one level up): a group whose
 * `parentGroupId` resolves to another real SwimlaneGroup has its siblings
 * scoped to that parent's own children — lanes with `groupId` equal to that
 * parent, PLUS groups with `parentGroupId` equal to that parent — mirroring
 * topLevelEntries' own combined lane+group idiom, just one level deeper
 * instead of at the top level. A group with no resolvable `parentGroupId`
 * is itself top-level, and shares topLevelEntries' own list (which already
 * excludes any really-nested group via isTopLevelGroup).
 *
 * Before t26, no real (user-editable) nested group ever existed inside one
 * Program's own live data — `parentGroupId` was only ever populated
 * synthetically by merge-programs.ts for the read-only All-Programs view —
 * so this function's nested branch was dead code until now; every existing
 * group in every pre-t26 document takes the top-level branch, unchanged.
 */
function siblingEntriesOfGroup(data: Program, group: SwimlaneGroup): TopLevelEntry[] {
  const groups = data.swimlaneGroups ?? [];
  const realGroupIds = new Set(groups.map((g) => g.id));
  const parentId = group.parentGroupId;
  if (parentId !== undefined && realGroupIds.has(parentId)) {
    const lanes: TopLevelEntry[] = data.swimlanes.filter((l) => l.groupId === parentId).map((l) => ({ kind: "lane", item: l }));
    const nestedGroups: TopLevelEntry[] = groups.filter((g) => g.parentGroupId === parentId).map((g) => ({ kind: "group", item: g }));
    return [...lanes, ...nestedGroups].sort((a, b) => a.item.order - b.item.order);
  }
  return topLevelEntries(data);
}

/**
 * Reorders a SwimlaneGroup within its true sibling scope (t26 generalizes
 * this the same way t21 generalized moveSwimlaneOp for lanes — see
 * siblingEntriesOfGroup's doc): a nested group's ▲/▼ swaps only among its
 * own parent's other children, never among the top-level list; a top-level
 * group's ▲/▼ still swaps among the top-level order space (groups +
 * ungrouped swimlanes combined), exactly as before t26. Same no-op-on-
 * boundary convention as moveSwimlaneOp: returns `data` unchanged (same
 * reference) if `id` isn't found or the move would go out of bounds.
 */
export function moveSwimlaneGroupOp(data: Program, id: string, delta: -1 | 1): Program {
  const group = (data.swimlaneGroups ?? []).find((g) => g.id === id);
  if (!group) return data;
  const entries = siblingEntriesOfGroup(data, group);
  const i = entries.findIndex((e) => e.kind === "group" && e.item.id === id);
  return swapAndRenumberTopLevel(data, entries, i, delta);
}

/**
 * Depth-walk cycle guard, mirroring RoadmapTimeline.tsx's `groupDepth` (its
 * own doc: "guards against a cycle... on bad data" and "a `parentGroupId`
 * pointing nowhere real") — but answering "is `descendantId` findable by
 * walking UP from `startId`'s own resolvable `parentGroupId` chain" instead
 * of computing a depth. Used by setSwimlaneGroupParentIdOp to reject moving
 * a group under one of its own descendants, which would otherwise close a
 * cycle back onto itself once the reparent lands.
 */
function isDescendantViaParentChain(groupById: Map<string, SwimlaneGroup>, descendantId: string, startId: string): boolean {
  let current = groupById.get(startId);
  const seen = new Set<string>();
  while (current) {
    if (current.id === descendantId) return true;
    if (seen.has(current.id) || current.parentGroupId === undefined || !groupById.has(current.parentGroupId)) return false;
    seen.add(current.id);
    current = groupById.get(current.parentGroupId);
  }
  return false;
}

/**
 * Reparents a SwimlaneGroup under a new parent group (or to top-level, when
 * `newParentGroupId` is `undefined`) — mirrors setSwimlaneGroupIdOp's exact
 * pattern one tier up: appended at the end of the NEW sibling scope (max
 * existing sibling `order` there, +1, or 0 if none), same "append at the end
 * of the new scope" convention. No-op (returns `data` unchanged) if:
 *  - `groupId` doesn't resolve to a real group;
 *  - `newParentGroupId` is given but doesn't resolve to a real group;
 *  - `newParentGroupId === groupId` (a group can't be its own parent);
 *  - `newParentGroupId` is a descendant of `groupId` (would close a cycle —
 *    see isDescendantViaParentChain).
 */
export function setSwimlaneGroupParentIdOp(data: Program, groupId: string, newParentGroupId: string | undefined): Program {
  const groups = data.swimlaneGroups ?? [];
  const group = groups.find((g) => g.id === groupId);
  if (!group) return data;

  if (newParentGroupId !== undefined) {
    const newParent = groups.find((g) => g.id === newParentGroupId);
    if (!newParent) return data;
    if (newParentGroupId === groupId) return data;
    const groupById = new Map(groups.map((g) => [g.id, g]));
    if (isDescendantViaParentChain(groupById, groupId, newParentGroupId)) return data;
  }

  const nextOrder =
    newParentGroupId === undefined
      ? topOrderSpaceNextOrder(data)
      : Math.max(
          data.swimlanes.filter((l) => l.groupId === newParentGroupId).reduce((max, l) => Math.max(max, l.order), -1),
          groups.filter((g) => g.parentGroupId === newParentGroupId).reduce((max, g) => Math.max(max, g.order), -1),
        ) + 1;

  const swimlaneGroups = groups.map((g) => (g.id === groupId ? { ...g, parentGroupId: newParentGroupId, order: nextOrder } : g));
  return { ...data, swimlaneGroups };
}

/**
 * Reassigns a lane into a different group, or ungroups it (`groupId:
 * undefined`) — the direct group-picker control's mutation, distinct from
 * moveSwimlaneOp's adjacent-swap (which can only cross one group boundary
 * at a time). The lane is appended at the end of its *new* scope's order
 * space: the max `order` among the new group's existing members +1 (or 0
 * if it has none), or the shared top-level order space if ungrouping (same
 * computation removeSwimlaneGroupOp uses for orphaned lanes). No-op if
 * `laneId` doesn't resolve to a real lane, or `groupId` is given but
 * doesn't resolve to a real group.
 */
export function setSwimlaneGroupIdOp(data: Program, laneId: string, groupId: string | undefined): Program {
  const lane = data.swimlanes.find((l) => l.id === laneId);
  if (!lane) return data;
  if (groupId !== undefined && !(data.swimlaneGroups ?? []).some((g) => g.id === groupId)) return data;

  const nextOrder =
    groupId === undefined
      ? topOrderSpaceNextOrder(data)
      : data.swimlanes.filter((l) => l.groupId === groupId).reduce((max, l) => Math.max(max, l.order), -1) + 1;

  const swimlanes = data.swimlanes.map((l) => (l.id === laneId ? { ...l, groupId, order: nextOrder } : l));
  return { ...data, swimlanes };
}

export function setLaneColorOp(data: Program, id: string, color: string | undefined): Program {
  return { ...data, swimlanes: data.swimlanes.map((l) => (l.id === id ? { ...l, color } : l)) };
}

/** "auto" clears the override, mirroring isCriticalPathOverride's undefined-means-computed convention. */
export function setRagOverrideOp(data: Program, id: string, rag: Rag | "auto"): Program {
  return {
    ...data,
    swimlanes: data.swimlanes.map((l) => (l.id === id ? { ...l, ragOverride: rag === "auto" ? undefined : rag } : l)),
  };
}

/** Mirrors setLaneColorOp's placement/pattern — "normal vs lean" row-height toggle. */
export function setLaneDensityOp(data: Program, id: string, density: "normal" | "lean"): Program {
  return { ...data, swimlanes: data.swimlanes.map((l) => (l.id === id ? { ...l, density } : l)) };
}

/** Mirrors setLaneColorOp's placement/pattern — lane-hide (t22), excluded from layout entirely when true. */
export function setLaneHiddenOp(data: Program, id: string, hidden: boolean): Program {
  return { ...data, swimlanes: data.swimlanes.map((l) => (l.id === id ? { ...l, hidden } : l)) };
}

export function applyDeletes(data: Program, deletes: readonly DeleteOp[]): Program {
  return deletes.reduce((acc, d) => {
    if (d.entityType === "milestone") return removeMilestoneOp(acc, d.targetId);
    if (d.entityType === "topLevelItem") return removeTopLevelItemOp(acc, d.targetId);
    return removeSwimlaneOp(acc, d.targetId);
  }, data);
}

/**
 * `newId` is resolved by the caller (mirrors applyAddMilestoneOps in
 * apply.ts) rather than generated in here — only "add" ops consume it; every
 * other kind already carries its own targetId.
 */
export function applySwimlaneOps(data: Program, ops: readonly { op: SwimlaneOp; newId: string }[]): Program {
  return ops.reduce((acc, { op, newId }) => {
    switch (op.kind) {
      case "add":
        return addSwimlaneOp(acc, op.swimlaneType, op.name, newId);
      case "rename":
        return renameSwimlaneOp(acc, op.targetId, op.name);
      case "reorder":
        return moveSwimlaneOp(acc, op.targetId, op.delta);
      case "recolor":
        return setLaneColorOp(acc, op.targetId, resolveNamedLaneColor(op.color));
      case "ragOverride":
        return setRagOverrideOp(acc, op.targetId, op.rag);
    }
  }, data);
}
