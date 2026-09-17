"use client";

// Outline/tree view (wayframe t32) — a single-Program editing surface,
// structured Program -> Group -> Lane -> Row -> leaf (see
// src/lib/outline-tree/tree.ts for the pure projector this renders).
// Mirrors SwimlaneManager.tsx's own conventions closely: a fixed-overlay
// panel, `--wf-*` theming, the same close-button/header idiom. Expansion
// (which nodes are folded) is local, view-only UI state here — not
// document content, and not a viewer preference either (same category as
// SwimlaneManager's own `confirmingId`).
//
// Only for whichever Program is currently open for live editing — see this
// ticket's own scope note: there's no Program-selector yet, so this is
// always "the one Program RoadmapWorkspace has open," never a picker.
import { useState } from "react";
import type { Program } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import { laneColorAt } from "@/components/timeline/lane-colors";
import type { AcceptBaselineOp, PatchOp } from "@/lib/corrections/schema";
import type { UseSelectionResult } from "@/components/timeline/use-selection";
import { buildOutlineTree, canReparentGroupOrLane, canReparentLeaf, descendantLeafIds, isLeafKind, type OutlineNode } from "@/lib/outline-tree/tree";

export interface OutlineTreeProps {
  data: Program;
  theme: Theme;
  /** The exact `useSelection()` instance RoadmapWorkspace already owns (shared with the canvas/SelectionToolbar) — not a second selection concept. */
  selection: UseSelectionResult;
  onMove: (id: string, delta: -1 | 1) => void;
  onMoveGroup: (id: string, delta: -1 | 1) => void;
  onAssignGroup: (laneId: string, groupId: string | undefined) => void;
  onSetGroupParentId: (groupId: string, newParentGroupId: string | undefined) => void;
  onHidden: (laneId: string, hidden: boolean) => void;
  onToggleGroupCollapsed: (groupId: string, collapsed: boolean) => void;
  /** Leaf-item reparent (Task 2) — reuses bulkEdit's existing `laneReassignments` with a one-item array rather than a new op. */
  onBulkEdit: (patchOps: PatchOp[], laneReassignments: { id: string; laneId: string }[], acceptBaselineOps: AcceptBaselineOp[]) => void;
  onClose: () => void;
}

const KIND_LABEL: Record<OutlineNode["kind"], string> = {
  program: "prog",
  group: "grp",
  lane: "lane",
  row: "row",
  milestone: "mile",
  phase: "phase",
  annotation: "note",
};

export function OutlineTree({ data, theme, selection, onMove, onMoveGroup, onAssignGroup, onSetGroupParentId, onHidden, onToggleGroupCollapsed, onBulkEdit, onClose }: OutlineTreeProps) {
  // Nodes the viewer has manually folded — everything is expanded by
  // default (mirrors the prototype's `expanded = new Set(containerIds)`
  // starting state), so this set only ever holds ids someone collapsed.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const roots = buildOutlineTree(data, selection.selectedIds);

  const groupTargets = [{ id: data.id, label: `${data.programName} (top level)` }, ...(data.swimlaneGroups ?? []).map((g) => ({ id: g.id, label: g.name }))];
  const laneTargets = data.swimlanes.filter((l) => l.type === "lane");
  // Same fallback-color idiom SwimlaneManager.tsx's own `fallbackColor` uses
  // — a lane row's swatch reads its explicit Swimlane.color when set, else
  // cycles through the active theme's lane ramp by that lane's own index.
  const laneIndexById = new Map(laneTargets.map((l, i) => [l.id, i]));
  const laneById = new Map(data.swimlanes.map((l) => [l.id, l]));
  function laneSwatchColor(laneId: string): string {
    const lane = laneById.get(laneId);
    return lane?.color ?? laneColorAt(theme.laneRamp, laneIndexById.get(laneId) ?? 0, Math.max(laneTargets.length, 1));
  }

  function toggleExpanded(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveToLane(leafId: string, laneId: string) {
    // Simplest existing mechanism that already does the job (Task 2's own
    // resolution) — a one-item laneReassignments array through bulkEdit,
    // rather than a new dedicated op.
    onBulkEdit([], [{ id: leafId, laneId }], []);
  }

  function renderNode(node: OutlineNode): React.ReactNode {
    const isContainer = node.kind === "program" || node.kind === "group" || node.kind === "lane";
    const isLeaf = isLeafKind(node.kind);
    const isExpanded = !collapsedIds.has(node.id);
    const hasChildren = node.children.length > 0;
    const program = data;

    return (
      <li key={node.id}>
        <div
          className="flex flex-wrap items-center gap-1.5 rounded px-1.5 py-1 text-xs"
          style={{ paddingLeft: `${node.depth * 1.1}rem`, opacity: node.hidden ? 0.5 : 1 }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpanded(node.id)}
              aria-label={isExpanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
              className="w-4 shrink-0 text-center opacity-60 hover:opacity-100"
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <span
            className="shrink-0 rounded px-1 text-[10px] uppercase tracking-wide opacity-70"
            style={{ background: "var(--wf-border)" }}
          >
            {KIND_LABEL[node.kind]}
          </span>

          {node.kind === "lane" && (
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: laneSwatchColor(node.id) }} />
          )}

          <span
            onClick={node.selectable ? () => selection.toggle(node.id) : undefined}
            className={"min-w-0 flex-1 truncate" + (node.selectable ? " cursor-pointer hover:underline" : "") + (node.selected ? " font-semibold" : "")}
            style={{ color: node.selected ? "var(--wf-accent)" : undefined, textDecoration: node.hidden ? "line-through" : undefined }}
          >
            {node.label}
          </span>

          {/* Reorder — every reorderable kind (lane, group, nested group) via
              adjacent-swap. Always enabled: the underlying ops
              (moveSwimlaneOp/moveSwimlaneGroupOp) already no-op harmlessly
              at a boundary, so there's no need to replicate their sibling-
              scoping logic here just to disable a button. */}
          {node.kind === "lane" && (
            <span className="flex shrink-0 gap-0.5">
              <button onClick={() => onMove(node.id, -1)} aria-label={`Move ${node.label} up`} className="px-1 opacity-60 hover:opacity-100">▲</button>
              <button onClick={() => onMove(node.id, 1)} aria-label={`Move ${node.label} down`} className="px-1 opacity-60 hover:opacity-100">▼</button>
            </span>
          )}
          {node.kind === "group" && (
            <span className="flex shrink-0 gap-0.5">
              <button onClick={() => onMoveGroup(node.id, -1)} aria-label={`Move ${node.label} up`} className="px-1 opacity-60 hover:opacity-100">▲</button>
              <button onClick={() => onMoveGroup(node.id, 1)} aria-label={`Move ${node.label} down`} className="px-1 opacity-60 hover:opacity-100">▼</button>
            </span>
          )}

          {/* "Move to..." — Group/Lane reparent, offering every legal target per canReparentGroupOrLane. */}
          {(node.kind === "lane" || node.kind === "group") && (
            <select
              value=""
              onChange={(e) => {
                const targetId = e.target.value;
                if (!targetId) return;
                if (node.kind === "lane") onAssignGroup(node.id, targetId === program.id ? undefined : targetId);
                else onSetGroupParentId(node.id, targetId === program.id ? undefined : targetId);
                e.target.value = "";
              }}
              aria-label={`Move ${node.label} to…`}
              style={{ borderColor: "var(--wf-border)" }}
              className="shrink-0 rounded border bg-transparent px-1 py-0.5 text-[11px]"
            >
              <option value="">Move to…</option>
              {groupTargets
                .filter((t) => canReparentGroupOrLane(program, { kind: node.kind as "group" | "lane", id: node.id }, t.id).ok)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </select>
          )}

          {/* "Move to..." — leaf lane reassignment (Task 2), only for a
              lane-scoped Milestone; a Program-band phase/annotation/
              milestone has no laneId at all, so this is simply omitted. */}
          {isLeaf && node.laneAddressable && (
            <select
              value=""
              onChange={(e) => {
                const laneId = e.target.value;
                if (!laneId) return;
                moveToLane(node.id, laneId);
                e.target.value = "";
              }}
              aria-label={`Move ${node.label} to a different lane…`}
              style={{ borderColor: "var(--wf-border)" }}
              className="shrink-0 rounded border bg-transparent px-1 py-0.5 text-[11px]"
            >
              <option value="">Move to lane…</option>
              {laneTargets.filter((l) => canReparentLeaf(program, node.id, l.id).ok).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}

          {/* Hide — Lane only. */}
          {node.kind === "lane" && (
            <button
              onClick={() => onHidden(node.id, !node.hidden)}
              aria-label={node.hidden ? `Show ${node.label}` : `Hide ${node.label}`}
              style={{ borderColor: "var(--wf-border)" }}
              className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] opacity-70 hover:opacity-100"
            >
              {node.hidden ? "Hidden" : "Visible"}
            </button>
          )}

          {/* Collapse — Group only (no real "collapse the Program" concept
              in this single-Program tree — see tree.ts's own doc). */}
          {node.kind === "group" && (
            <button
              onClick={() => onToggleGroupCollapsed(node.id, !node.collapsed)}
              aria-label={node.collapsed ? `Expand ${node.label}` : `Collapse ${node.label}`}
              style={{ borderColor: "var(--wf-border)" }}
              className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] opacity-70 hover:opacity-100"
            >
              {node.collapsed ? "Collapsed" : "Expanded"}
            </button>
          )}

          {/* Select all in subtree — Program/Group/Lane. */}
          {isContainer && (
            <button
              onClick={() => selection.addAll(descendantLeafIds(node))}
              aria-label={`Select all in ${node.label}`}
              style={{ borderColor: "var(--wf-border)" }}
              className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] opacity-70 hover:opacity-100"
            >
              Select all
            </button>
          )}
        </div>

        {hasChildren && isExpanded && <ul>{node.children.map((child) => renderNode(child))}</ul>}
      </li>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)", borderWidth: 1 }}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Outline"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--wf-border)" }}>
          <div>
            <h1 className="text-base font-semibold">Outline</h1>
            <p className="text-xs opacity-60">Program → Group → Lane → Row → item. Click a milestone to select it; use &quot;Select all&quot; on a container.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100">
            ✕
          </button>
        </div>

        <ul className="p-2">{roots.map((root) => renderNode(root))}</ul>
      </div>
    </div>
  );
}
