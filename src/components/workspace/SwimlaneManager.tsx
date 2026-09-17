"use client";

// Add / rename / reorder / recolour / delete swimlanes, and organize them
// into Swimlane Groups (t21) — real containers that own an ordered set of
// member lanes, rendered as a full-width header band above them.
//
// This was in the product's stated scope from the start ("configurable L2
// swimlanes") and was the last piece of it missing: lanes could only be
// recoloured, and only ever came from whatever the extraction produced.
//
// It's a modal rather than another options-menu row because a row per lane
// with five controls each doesn't fit a 288px dropdown, and because
// deleting a lane needs enough room to say what it will take with it.
import { Fragment, useState } from "react";
import type { Rag, Program, Swimlane, SwimlaneGroup } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import { laneColorAt } from "@/components/timeline/lane-colors";

const RAG_OPTIONS: { value: Rag | "auto"; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "green", label: "Green" },
  { value: "amber", label: "Amber" },
  { value: "red", label: "Red" },
];

const DENSITY_OPTIONS: { value: "normal" | "lean"; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "lean", label: "Lean" },
];

export interface SwimlaneManagerProps {
  data: Program;
  theme: Theme;
  onAdd: (type: "lane" | "separator") => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onColor: (id: string, color: string | undefined) => void;
  /** Manual RAG override (wayframe#55/#58) — mirrors isCriticalPathOverride's pattern; "auto" clears back to the computed worst-status-wins rollup. Lanes only, mirroring onColor. */
  onRagOverride: (id: string, rag: Rag | "auto") => void;
  /** "Normal vs lean" row-height toggle — lanes only, mirrors onColor/onRagOverride's placement. */
  onDensity: (id: string, density: "normal" | "lean") => void;
  /** Lane-hide (t22) — excluded from layout entirely when true. Lanes only, mirrors onColor/onDensity's placement. */
  onHidden: (id: string, hidden: boolean) => void;
  /** Swimlane Groups (t21) — a new top-level container, appended "New group", editable after. */
  onAddGroup: () => void;
  onRenameGroup: (id: string, name: string) => void;
  /** Ungroups the group's member lanes rather than deleting them. */
  onRemoveGroup: (id: string) => void;
  onMoveGroup: (id: string, delta: -1 | 1) => void;
  onGroupColor: (id: string, color: string | undefined) => void;
  onToggleGroupCollapsed: (id: string, collapsed: boolean) => void;
  /** Direct group-picker reassignment (the per-lane <select>) — moves a lane into a different group, or ungroups it (`undefined`). */
  onAssignGroup: (laneId: string, groupId: string | undefined) => void;
  onClose: () => void;
}

/** One top-level row: either a real SwimlaneGroup or an ungrouped Swimlane — peers sharing one order space, same "merge by order" fork-1's computeRowsAndBands does. */
type TopLevelRow = { kind: "group"; group: SwimlaneGroup } | { kind: "lane"; lane: Swimlane };

export function SwimlaneManager({
  data,
  theme,
  onAdd,
  onRename,
  onRemove,
  onMove,
  onColor,
  onRagOverride,
  onDensity,
  onHidden,
  onAddGroup,
  onRenameGroup,
  onRemoveGroup,
  onMoveGroup,
  onGroupColor,
  onToggleGroupCollapsed,
  onAssignGroup,
  onClose,
}: SwimlaneManagerProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const groups = [...(data.swimlaneGroups ?? [])].sort((a, b) => a.order - b.order);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // Lingering `type: "separator"` rows (a not-yet-migrated or hand-edited
  // document) are defensive: rendered with today's flat-row treatment,
  // unchanged, rather than dropped or crashing.
  const topLevelLanes = data.swimlanes.filter((l) => l.type === "separator" || !l.groupId || !groupById.has(l.groupId));
  const topLevel: TopLevelRow[] = [
    ...groups.map((group): TopLevelRow => ({ kind: "group", group })),
    ...topLevelLanes.map((lane): TopLevelRow => ({ kind: "lane", lane })),
  ].sort((a, b) => (a.kind === "group" ? a.group.order : a.lane.order) - (b.kind === "group" ? b.group.order : b.lane.order));

  const laneIndexById = new Map<string, number>();
  data.swimlanes.filter((l) => l.type === "lane").forEach((l, i) => laneIndexById.set(l.id, i));
  const laneCount = laneIndexById.size;

  const milestoneCount = (laneId: string) => data.milestones.filter((m) => m.laneId === laneId).length;
  const memberCount = (groupId: string) => data.swimlanes.filter((l) => l.groupId === groupId).length;

  function fallbackColor(lane: Swimlane): string {
    return laneColorAt(theme.laneRamp, laneIndexById.get(lane.id) ?? 0, Math.max(laneCount, 1));
  }

  function renderLaneRow(lane: Swimlane, i: number, siblingCount: number, indented: boolean) {
    const isLane = lane.type === "lane";
    const count = isLane ? milestoneCount(lane.id) : 0;
    const confirming = confirmingId === lane.id;
    return (
      <li
        key={lane.id}
        className={"flex flex-wrap items-center gap-2 px-2 py-2 " + (indented ? "ml-6 border-l pl-3" : "")}
        style={{ borderColor: "var(--wf-border)", opacity: lane.hidden ? 0.5 : 1 }}
      >
        <div className="flex shrink-0 flex-col">
          <button
            onClick={() => onMove(lane.id, -1)}
            disabled={i === 0}
            aria-label={`Move ${lane.name} up`}
            className="px-1 text-[10px] leading-tight opacity-60 hover:opacity-100 disabled:opacity-20"
          >
            ▲
          </button>
          <button
            onClick={() => onMove(lane.id, 1)}
            disabled={i === siblingCount - 1}
            aria-label={`Move ${lane.name} down`}
            className="px-1 text-[10px] leading-tight opacity-60 hover:opacity-100 disabled:opacity-20"
          >
            ▼
          </button>
        </div>

        {isLane ? (
          <input
            type="color"
            aria-label={`Colour for ${lane.name}`}
            value={lane.color ?? fallbackColor(lane)}
            onChange={(e) => onColor(lane.id, e.target.value)}
            style={{ borderColor: "var(--wf-border)" }}
            className="h-6 w-7 shrink-0 cursor-pointer rounded border bg-transparent p-0"
          />
        ) : (
          <span className="w-7 shrink-0 text-center text-[10px] opacity-50">grp</span>
        )}

        <input
          value={lane.name}
          onChange={(e) => onRename(lane.id, e.target.value)}
          aria-label={`Name of ${lane.name}`}
          style={{ borderColor: "var(--wf-border)" }}
          className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-sm"
        />

        {isLane && (
          <select
            value={lane.ragOverride ?? "auto"}
            onChange={(e) => onRagOverride(lane.id, e.target.value as Rag | "auto")}
            aria-label={`RAG override for ${lane.name}`}
            style={{ borderColor: "var(--wf-border)" }}
            className="shrink-0 rounded border bg-transparent px-1.5 py-1 text-xs"
          >
            {RAG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {isLane && (
          <select
            value={lane.density ?? "normal"}
            onChange={(e) => onDensity(lane.id, e.target.value as "normal" | "lean")}
            aria-label={`Row height for ${lane.name}`}
            title="Row height — Lean is 75% of Normal"
            style={{ borderColor: "var(--wf-border)" }}
            className="shrink-0 rounded border bg-transparent px-1.5 py-1 text-xs"
          >
            {DENSITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {isLane && (
          <select
            value={lane.groupId ?? ""}
            onChange={(e) => onAssignGroup(lane.id, e.target.value || undefined)}
            aria-label={`Group for ${lane.name}`}
            title="Move to a different group, or ungroup"
            style={{ borderColor: "var(--wf-border)" }}
            className="shrink-0 rounded border bg-transparent px-1.5 py-1 text-xs"
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}

        {isLane && (
          <button
            onClick={() => onHidden(lane.id, !lane.hidden)}
            aria-label={lane.hidden ? `Show ${lane.name}` : `Hide ${lane.name}`}
            title={lane.hidden ? "Hidden from the chart — click to show" : "Click to hide from the chart"}
            style={{ borderColor: "var(--wf-border)" }}
            className="shrink-0 rounded border px-2 py-1 text-[11px] opacity-70 hover:opacity-100"
          >
            {lane.hidden ? "Hidden" : "Visible"}
          </button>
        )}

        <span className="w-20 shrink-0 text-right text-[11px] opacity-55">
          {isLane ? `${count} item${count === 1 ? "" : "s"}` : "group"}
        </span>

        {confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => {
                onRemove(lane.id);
                setConfirmingId(null);
              }}
              className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white"
            >
              {count > 0 ? `Delete + ${count}` : "Delete"}
            </button>
            <button onClick={() => setConfirmingId(null)} className="text-[11px] opacity-60 hover:opacity-100">
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmingId(lane.id)}
            aria-label={`Delete ${lane.name}`}
            style={{ borderColor: "var(--wf-border)" }}
            className="shrink-0 rounded border px-2 py-1 text-[11px] opacity-70 hover:opacity-100"
          >
            Delete
          </button>
        )}

        {/* Named before it happens rather than after — the milestones go
            with the lane, and a count is the only honest warning. */}
        {confirming && count > 0 && (
          <p className="w-full text-[11px] text-red-500">
            This also deletes {count} milestone{count === 1 ? "" : "s"} in this lane, and any dependency on them. Undo reverses it.
          </p>
        )}
      </li>
    );
  }

  function renderGroupRow(group: SwimlaneGroup, i: number) {
    const confirming = confirmingId === group.id;
    const count = memberCount(group.id);
    return (
      <li
        key={group.id}
        className="flex flex-wrap items-center gap-2 border-b px-2 py-2"
        style={{ borderColor: "var(--wf-border)" }}
      >
        <div className="flex shrink-0 flex-col">
          <button
            onClick={() => onMoveGroup(group.id, -1)}
            disabled={i === 0}
            aria-label={`Move ${group.name} up`}
            className="px-1 text-[10px] leading-tight opacity-60 hover:opacity-100 disabled:opacity-20"
          >
            ▲
          </button>
          <button
            onClick={() => onMoveGroup(group.id, 1)}
            disabled={i === topLevel.length - 1}
            aria-label={`Move ${group.name} down`}
            className="px-1 text-[10px] leading-tight opacity-60 hover:opacity-100 disabled:opacity-20"
          >
            ▼
          </button>
        </div>

        <input
          type="color"
          aria-label={`Colour for ${group.name}`}
          value={group.color ?? "#94a3b8"}
          onChange={(e) => onGroupColor(group.id, e.target.value)}
          style={{ borderColor: "var(--wf-border)" }}
          className="h-6 w-7 shrink-0 cursor-pointer rounded border bg-transparent p-0"
        />

        <input
          value={group.name}
          onChange={(e) => onRenameGroup(group.id, e.target.value)}
          aria-label={`Name of ${group.name}`}
          style={{ borderColor: "var(--wf-border)" }}
          className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-sm font-medium"
        />

        <button
          onClick={() => onToggleGroupCollapsed(group.id, !group.collapsed)}
          aria-label={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
          title={group.collapsed ? "Collapsed — click to expand" : "Click to collapse"}
          style={{ borderColor: "var(--wf-border)" }}
          className="shrink-0 rounded border px-2 py-1 text-[11px] opacity-70 hover:opacity-100"
        >
          {group.collapsed ? "Collapsed" : "Expanded"}
        </button>

        <span className="w-20 shrink-0 text-right text-[11px] opacity-55">
          {count} lane{count === 1 ? "" : "s"}
        </span>

        {confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => {
                onRemoveGroup(group.id);
                setConfirmingId(null);
              }}
              className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white"
            >
              Delete
            </button>
            <button onClick={() => setConfirmingId(null)} className="text-[11px] opacity-60 hover:opacity-100">
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmingId(group.id)}
            aria-label={`Delete ${group.name}`}
            style={{ borderColor: "var(--wf-border)" }}
            className="shrink-0 rounded border px-2 py-1 text-[11px] opacity-70 hover:opacity-100"
          >
            Delete
          </button>
        )}

        {confirming && count > 0 && (
          <p className="w-full text-[11px] text-red-500">
            This ungroups {count} lane{count === 1 ? "" : "s"}; they aren&apos;t deleted. Undo reverses it.
          </p>
        )}
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
        aria-label="Swimlanes"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--wf-border)" }}>
          <div>
            <h1 className="text-base font-semibold">Swimlanes</h1>
            <p className="text-xs opacity-60">Rename, reorder, recolour. Groups own the lanes nested under them.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100">
            ✕
          </button>
        </div>

        <ul className="divide-y p-2" style={{ borderColor: "var(--wf-border)" }}>
          {topLevel.map((row, i) => {
            if (row.kind === "group") {
              const members = data.swimlanes.filter((l) => l.groupId === row.group.id).sort((a, b) => a.order - b.order);
              return (
                <Fragment key={row.group.id}>
                  {renderGroupRow(row.group, i)}
                  {!row.group.collapsed && members.map((lane, mi) => renderLaneRow(lane, mi, members.length, true))}
                </Fragment>
              );
            }
            return renderLaneRow(row.lane, i, topLevel.length, false);
          })}
        </ul>

        <div className="flex items-center gap-2 border-t p-4" style={{ borderColor: "var(--wf-border)" }}>
          <button
            onClick={() => onAdd("lane")}
            style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
            className="rounded-full px-3 py-1.5 text-xs font-medium"
          >
            Add a lane
          </button>
          <button onClick={onAddGroup} style={{ borderColor: "var(--wf-border)" }} className="rounded-full border px-3 py-1.5 text-xs">
            Add a group
          </button>
          <span className="ml-auto text-[11px] opacity-55">Every change here is undoable.</span>
        </div>
      </div>
    </div>
  );
}
