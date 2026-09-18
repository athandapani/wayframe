// Outline tree (wayframe t32) — a pure projector + validator module, not a
// second copy of document state. Ports the design validated on the
// throwaway prototype (prototype/outline-tree-106 branch,
// prototypes/outline-tree-106.html — see its own doc comments for the
// hierarchy/legality rules this file ports faithfully), adapted from that
// prototype's flat synthetic node array to this repo's real types
// (Program/Portfolio/SwimlaneGroup/Swimlane/Milestone/TopLevelItem).
//
// Hierarchy: Program -> Group (SwimlaneGroup, possibly nested via t26's
// parentGroupId) -> Lane (Swimlane, type "lane") -> Row (synthetic, grouped
// by Milestone.laneRow, never a movable/reparentable entity) -> leaf
// (Milestone, or a Program-band TopLevelItem).
//
// REAL-CODE DEVIATION FROM THE PROTOTYPE (flagged per this ticket's own
// process requirement): the prototype's synthetic fixture nested
// milestone/phase/annotation leaves uniformly under a Lane, all sharing one
// selectable/reparentable treatment. In this repo's real schema, only
// `Milestone` (program.milestones) has a `laneId` and lives inside the
// Lane -> Row structure; `TopLevelItem` (phase/annotation, and a
// Program-band "milestone" variant) has NO laneId at all — it's a
// Program-band item, structurally outside every Lane. This module
// therefore represents Program-band TopLevelItems as their own leaf nodes
// directly under the Program node (a reasonable place for a band that has
// no lane to live inside), and marks them `laneAddressable: false`
// unconditionally — never offered a "move to a different lane" control
// (Task 4 omits that control for them, matching how canReparentLeaf below
// always rejects them) — no laneId concept applies to a Program-band item,
// selectable or not.
//
// UPDATED (wayframe#t33): a TopLevelItem leaf IS now `selectable` — for the
// "milestone"/"phase" kinds, which both carry status and a StyleOverride
// (bulk-editable via t33's generic field-patch model); an "annotation" leaf
// stays `selectable: false`, since it has neither (see StyleOverride's own
// doc and src/lib/bulk-edit/types.ts's applicability research). This
// bridges into the exact same use-selection.ts `Set<string>` a lane-scoped
// Milestone leaf already uses — RoadmapTimeline.tsx's `selectedIds`/
// `onToggleSelect` are now wired to `data.topLevelItems` too (the
// "milestone"/"phase" render branches), not just `data.milestones`, so a
// TopLevelItem leaf selected here really does toggle the same canvas
// selection ring a Milestone leaf's does.
import type { Milestone, Portfolio, Program, Swimlane, SwimlaneGroup, TopLevelItem } from "@/components/timeline/types";

export type OutlineNodeKind = "program" | "group" | "lane" | "row" | "milestone" | "phase" | "annotation";

export interface OutlineNode {
  kind: OutlineNodeKind;
  id: string;
  label: string;
  depth: number;
  children: OutlineNode[];
  /** Lane-hide (t22) — only ever set on a "lane" node. */
  hidden?: boolean;
  /** Group collapse (t21) — only ever set on a "group" node; the single-Program tree's synthetic "program" root never gets one (see this file's top doc + Task 4's own note: there's no real "collapse the Program itself" concept here). */
  collapsed?: boolean;
  /** Only meaningful when `selectable` is true. */
  selected?: boolean;
  /** True for a leaf projected from a lane-scoped Milestone, or from a "milestone"/"phase" TopLevelItem — every leaf kind use-selection.ts's Set<string> actually covers (wayframe#t33). False for an "annotation" leaf, which has no status/StyleOverride to bulk-edit. See this file's top-of-module doc. */
  selectable?: boolean;
  /** True only for a leaf projected from a lane-scoped Milestone — the only leaf kind that has a `laneId` to reassign (see canReparentLeaf). */
  laneAddressable?: boolean;
}

const LEAF_KINDS: ReadonlySet<OutlineNodeKind> = new Set(["milestone", "phase", "annotation"]);

/** A group's *resolved* parent — undefined (the implicit root) for a top-level group, or for one whose `parentGroupId` points nowhere real. Mirrors RoadmapTimeline.tsx's own `resolvedParentOf`, which isn't exported, so this is a deliberate parallel implementation, not a diverging one. */
function resolvedParentGroupOf(groupById: ReadonlyMap<string, SwimlaneGroup>, group: SwimlaneGroup): string | undefined {
  return group.parentGroupId !== undefined && groupById.has(group.parentGroupId) ? group.parentGroupId : undefined;
}

/** A lane's *resolved* containing group — undefined for an ungrouped lane, or one whose `groupId` points nowhere real. Mirrors RoadmapTimeline.tsx's own `resolvedGroupOf`. */
function resolvedGroupOfLane(groupById: ReadonlyMap<string, SwimlaneGroup>, lane: Swimlane): string | undefined {
  return lane.groupId !== undefined && groupById.has(lane.groupId) ? lane.groupId : undefined;
}

type ChildEntry = { order: number; kind: "lane"; lane: Swimlane } | { order: number; kind: "group"; group: SwimlaneGroup };

function labelOf(item: TopLevelItem): string {
  return item.title;
}

function buildMilestoneLeaf(m: Milestone, depth: number, selectedIds: ReadonlySet<string>): OutlineNode {
  return {
    kind: "milestone",
    id: m.id,
    label: m.title,
    depth,
    children: [],
    selected: selectedIds.has(m.id),
    selectable: true,
    laneAddressable: true,
  };
}

/** A Program-band TopLevelItem leaf — never lane-addressable (no laneId concept applies), and selectable only for "milestone"/"phase" kinds, not "annotation" (wayframe#t33 — see this file's top-of-module doc). */
function buildTopLevelLeaf(item: TopLevelItem, depth: number, selectedIds: ReadonlySet<string>): OutlineNode {
  const selectable = item.type !== "annotation";
  return {
    kind: item.type,
    id: item.id,
    label: labelOf(item),
    depth,
    children: [],
    selected: selectable && selectedIds.has(item.id),
    selectable,
    laneAddressable: false,
  };
}

function buildLaneNode(program: Program, lane: Swimlane, depth: number, selectedIds: ReadonlySet<string>): OutlineNode {
  const milestones = program.milestones.filter((m) => m.laneId === lane.id);
  // Rows are synthetic (wayframe#94/t20's own gist, restated by the
  // prototype's doc): grouped by `Milestone.laneRow` (undefined/1 = the
  // lane's always-present home Row 1), min..max actually used — never a
  // movable/reparentable entity, so there is no "row" mutation anywhere in
  // this module.
  const rowNumbers = Array.from(new Set(milestones.map((m) => m.laneRow ?? 1))).sort((a, b) => a - b);
  const rows: OutlineNode[] = rowNumbers.map((rowNum) => {
    const rowMilestones = milestones.filter((m) => (m.laneRow ?? 1) === rowNum).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return {
      kind: "row",
      id: `${lane.id}::row-${rowNum}`,
      label: `Row ${rowNum}`,
      depth: depth + 1,
      children: rowMilestones.map((m) => buildMilestoneLeaf(m, depth + 2, selectedIds)),
    };
  });
  return {
    kind: "lane",
    id: lane.id,
    label: lane.name,
    depth,
    hidden: lane.hidden,
    children: rows,
  };
}

function buildGroupNode(
  program: Program,
  group: SwimlaneGroup,
  depth: number,
  selectedIds: ReadonlySet<string>,
  lanesByParent: ReadonlyMap<string | undefined, Swimlane[]>,
  groupsByParent: ReadonlyMap<string | undefined, SwimlaneGroup[]>,
): OutlineNode {
  const children = childrenOf(group.id, lanesByParent, groupsByParent).map((entry) =>
    entry.kind === "lane"
      ? buildLaneNode(program, entry.lane, depth + 1, selectedIds)
      : buildGroupNode(program, entry.group, depth + 1, selectedIds, lanesByParent, groupsByParent),
  );
  return {
    kind: "group",
    id: group.id,
    label: group.name,
    depth,
    collapsed: group.collapsed,
    children,
  };
}

function childrenOf(
  parentId: string | undefined,
  lanesByParent: ReadonlyMap<string | undefined, Swimlane[]>,
  groupsByParent: ReadonlyMap<string | undefined, SwimlaneGroup[]>,
): ChildEntry[] {
  const entries: ChildEntry[] = [
    ...(lanesByParent.get(parentId) ?? []).map((lane): ChildEntry => ({ order: lane.order, kind: "lane", lane })),
    ...(groupsByParent.get(parentId) ?? []).map((group): ChildEntry => ({ order: group.order, kind: "group", group })),
  ];
  entries.sort((a, b) => a.order - b.order);
  return entries;
}

/**
 * Builds the Program -> Group -> Lane -> Row -> leaf hierarchy for ONE
 * Program (the single-Program editing case, Task 4's OutlineTree). Returns
 * a one-element forest: `[programRootNode]`, whose `children` are that
 * Program's own top-level groups/lanes (depth 1) plus its Program-band
 * TopLevelItems (also depth 1, appended after — see this file's top doc for
 * why they can't nest inside any Lane). `selectedIds` is the exact
 * `Set<string>` `use-selection.ts` already hands the canvas/SelectionToolbar
 * — every lane-scoped Milestone leaf's `selected` flag, and (wayframe#t33)
 * every "milestone"/"phase" TopLevelItem leaf's, is read straight off it,
 * never a parallel selection concept.
 */
export function buildOutlineTree(program: Program, selectedIds: ReadonlySet<string>): OutlineNode[] {
  const groups = program.swimlaneGroups ?? [];
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const lanes = program.swimlanes.filter((l) => l.type === "lane");

  const lanesByParent = new Map<string | undefined, Swimlane[]>();
  for (const lane of lanes) {
    const key = resolvedGroupOfLane(groupById, lane);
    const bucket = lanesByParent.get(key);
    if (bucket) bucket.push(lane);
    else lanesByParent.set(key, [lane]);
  }
  const groupsByParent = new Map<string | undefined, SwimlaneGroup[]>();
  for (const g of groups) {
    const key = resolvedParentGroupOf(groupById, g);
    const bucket = groupsByParent.get(key);
    if (bucket) bucket.push(g);
    else groupsByParent.set(key, [g]);
  }

  const topChildren = childrenOf(undefined, lanesByParent, groupsByParent).map((entry) =>
    entry.kind === "lane"
      ? buildLaneNode(program, entry.lane, 1, selectedIds)
      : buildGroupNode(program, entry.group, 1, selectedIds, lanesByParent, groupsByParent),
  );
  const topLevelLeaves = program.topLevelItems.map((item) => buildTopLevelLeaf(item, 1, selectedIds));

  const programNode: OutlineNode = {
    kind: "program",
    id: program.id,
    label: program.programName,
    depth: 0,
    children: [...topChildren, ...topLevelLeaves],
  };
  return [programNode];
}

/**
 * Read-only multi-Program browsing (the All-Programs page, Task 5): one
 * root "program" node per Program, sorted by `.order`, each containing that
 * Program's own real tree (reuses `buildOutlineTree` per-Program — doesn't
 * reinvent it). Deliberately does NOT use merge-programs.ts's id-namespacing
 * (that's for the read-only *rendered chart* merge, a different concern) —
 * every Program's ids stay as-is, since this tree is read-only browsing,
 * never fed into `mergeForRender`. `portfolio` isn't read yet (nothing in
 * the tree currently needs Portfolio-level fields) but is kept in the
 * signature since the caller already has one at hand and a future need
 * (e.g. Portfolio-scoped legend/category display) shouldn't be a breaking
 * signature change.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept in the signature per this ticket's spec (a future Portfolio-scoped display need shouldn't be a breaking signature change); see the doc above.
export function buildMultiProgramOutlineTree(programs: readonly Program[], portfolio: Portfolio): OutlineNode[] {
  const emptySelection = new Set<string>();
  return [...programs].sort((a, b) => a.order - b.order).flatMap((program) => buildOutlineTree(program, emptySelection));
}

/** Bulk-adds every selectable descendant leaf's id — the tree's bridge into use-selection.ts's `addAll`, not a new selection primitive (mirrors the prototype's `selectAllInSubtree`/`descendantLeafIds`). A Program-band TopLevelItem leaf is walked and included when it's a "milestone"/"phase" kind (wayframe#t33); an "annotation" leaf is walked but never included, since it's never `selectable` (see this file's top doc). */
export function descendantLeafIds(node: OutlineNode): string[] {
  const out: string[] = [];
  const walk = (n: OutlineNode) => {
    if (n.selectable) out.push(n.id);
    for (const child of n.children) walk(child);
  };
  for (const child of node.children) walk(child);
  return out;
}

export interface ReparentCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Depth-walk cycle guard — mirrors RoadmapTimeline.tsx's `groupDepth` guard
 * shape ("a cycle... on bad data", "a `parentGroupId` pointing nowhere
 * real") and apply-document.ts's `isDescendantViaParentChain`: answers
 * "is `descendantId` findable by walking UP from `startId`'s own resolvable
 * `parentGroupId` chain". A deliberate parallel implementation (this module
 * has no dependency on apply-document.ts, by design — see this file's top
 * doc on being a pure projector+validator module), not a diverging one.
 */
function isDescendantViaParentChain(groupById: ReadonlyMap<string, SwimlaneGroup>, descendantId: string, startId: string): boolean {
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
 * Legality for reparenting a Group or a Lane (ported from the prototype's
 * `canReparent`, narrowed to this repo's real shape): a Group/Lane may move
 * onto the Program itself (`targetId === program.id`, meaning "ungroup to
 * top-level within this Program") or onto another real Group. A Lane may
 * target any real Group with no further restriction (a Lane can never be an
 * ancestor of anything). A Group may not target itself, nor a Group that is
 * its own descendant (would close a cycle once the reparent lands — see
 * isDescendantViaParentChain).
 *
 * "Family Program" (the prototype's cross-Program guard) reduces to nothing
 * to check here: every mutation this ticket wires (Task 1/2's ops) already
 * takes one `Program` object at a time, and the UI (Task 4) never offers a
 * different Program as a target — there is no control through which a
 * cross-Program reparent could even be attempted, so this predicate simply
 * never receives one.
 */
export function canReparentGroupOrLane(program: Program, node: { kind: "group" | "lane"; id: string }, targetId: string): ReparentCheck {
  if (targetId === program.id) return { ok: true };
  const groups = program.swimlaneGroups ?? [];
  const target = groups.find((g) => g.id === targetId);
  if (!target) return { ok: false, reason: `no such group "${targetId}"` };
  if (node.kind === "lane") return { ok: true };
  if (node.id === targetId) return { ok: false, reason: "a group can't move under itself" };
  const groupById = new Map(groups.map((g) => [g.id, g]));
  if (isDescendantViaParentChain(groupById, node.id, targetId)) {
    return { ok: false, reason: `moving under "${targetId}" would close a cycle — it's already nested under this group` };
  }
  return { ok: true };
}

/**
 * Legality for reparenting a leaf item onto a different Lane (ported from
 * the prototype's `canReparent`'s leaf branch). Only a real, lane-scoped
 * Milestone (found in `program.milestones`) is laneId-addressable at all —
 * see this file's top-of-module doc for why a Program-band TopLevelItem
 * (phase/annotation, or a Program-band "milestone") always fails this check,
 * unconditionally, rather than being narrowed some other way.
 */
export function canReparentLeaf(program: Program, leafId: string, targetLaneId: string): ReparentCheck {
  const milestone = program.milestones.find((m) => m.id === leafId);
  if (!milestone) {
    return { ok: false, reason: `"${leafId}" has no lane to move to — only a lane-scoped Milestone is laneId-addressable` };
  }
  const lane = program.swimlanes.find((l) => l.id === targetLaneId && l.type === "lane");
  if (!lane) return { ok: false, reason: `no such lane "${targetLaneId}"` };
  if (milestone.laneId === targetLaneId) return { ok: false, reason: "already in this lane" };
  return { ok: true };
}

/**
 * Hide (Swimlane.hidden, t22) is legal only on a "lane" node — mirrors the
 * prototype's `toggleHidden` guard. Collapse (below) is the Group
 * equivalent; the two are deliberately non-interchangeable (see this file's
 * top doc / apply-document.ts's setLaneHiddenOp/setSwimlaneGroupCollapsedOp
 * — neither validates the target kind itself, so the UI/this predicate is
 * what keeps the wrong control off the wrong kind).
 */
export function canToggleHidden(kind: OutlineNodeKind): ReparentCheck {
  if (kind !== "lane") return { ok: false, reason: `only a Lane can be hidden — a ${kind} has no hidden flag (that's what Collapse is for on a Group)` };
  return { ok: true };
}

/**
 * Collapse (SwimlaneGroup.collapsed, t21) is legal only on a "group" node.
 * The prototype's own `toggleCollapsed` allowed "program" as well (per
 * t26's gist, a Program is conceptually a depth-0 group) — narrowed here to
 * "group" only because, in this repo's REAL schema, `Program` has no
 * `collapsed` field at all; only `SwimlaneGroup` does. Task 4's OutlineTree
 * accordingly never renders a collapse control on the single-Program
 * tree's synthetic "program" root, and this predicate agrees with that
 * real-schema constraint rather than the prototype's more permissive
 * synthetic model.
 */
export function canToggleCollapsed(kind: OutlineNodeKind): ReparentCheck {
  if (kind !== "group") return { ok: false, reason: `only a Group can collapse — a ${kind} has no collapsed flag (that's what Hide is for on a Lane)` };
  return { ok: true };
}

/** True for the node kinds the prototype calls LEAF_KINDS — milestone/phase/annotation — regardless of `selectable` (a Program-band leaf is still a leaf, just not selection-bridgeable). Exported for callers (e.g. OutlineTree.tsx) that need to distinguish a leaf row from a structural one without re-deriving the kind set. */
export function isLeafKind(kind: OutlineNodeKind): boolean {
  return LEAF_KINDS.has(kind);
}
