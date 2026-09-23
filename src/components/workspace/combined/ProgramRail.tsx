"use client";

// The left Program rail (wayframe#126) — #125's Variant B, built for real.
//
// There are no structure-editor tabs anywhere on this surface: the rail IS
// the tab strip. Every Program in the Roadmap gets a permanent card, and the
// expanded card is the "selected tab" — which keeps #118's rule ("tabs scope
// the structure-editing panel only, never the always-combined canvas") while
// spending no vertical room on a tab bar.
//
// Two affordances per card, deliberately independent (this is the thing
// Variant B was picked FOR):
//
//   ◼/◻  collapses that Program's BAND on the canvas
//   ▸/▾  expands this card into that Program's structure editor
//
// so a Program's lanes can be restructured while its band is collapsed, and
// all 3-4 collapse states are readable at once instead of being hunted for
// in band headers that may be scrolled past. Band collapse is viewer-local:
// the band is a synthetic merge-time group with no field in any Program's
// doc to write (see merge-programs.ts's `isProgramBandId`), unlike a real
// Swimlane Group's `collapsed`, which stays document content and routes to
// its Program's box like any other edit.
//
// A lane's cross-Program move sits behind a ⇄ that expands the picker inline
// beneath the row, rather than a fourth always-visible dropdown — at rail
// width a permanent picker pushes every lane name into an ellipsis. The
// row's remaining controls are the ones you reach for while scanning
// (reorder, hide, rename, colour, delete); the rest of SwimlaneManager's
// surface (RAG override, density, group assignment) stays one click away
// behind "All lane options…", which opens the existing modal for that one
// Program rather than growing a second copy of it here.

import { useState } from "react";
import Link from "next/link";
import type { Program, Swimlane } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import { laneColorAt } from "@/components/timeline/lane-colors";
import type { ConnectionStatus } from "@/lib/realtime/use-program-room";
import { CrossProgramMovePicker } from "./CrossProgramMovePicker";
import type { ProgramConnection } from "./ProgramRoomHost";

function StatusDot({ status }: { status: ConnectionStatus }) {
  const color = status === "connected" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-400" : "bg-red-500";
  return <span aria-label={`Connection: ${status}`} title={`Connection: ${status}`} className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

export function ProgramRail({
  connections,
  theme,
  portfolioId,
  canEdit,
  editablePrograms,
  collapsedProgramIds,
  onToggleBand,
  expandedProgramId,
  onExpandProgram,
  onMoveSwimlane,
  onOpenLaneOptions,
  onReorderProgram,
  reorderErrors,
  footer,
  readOnlyPrograms,
  viewOnlyNote,
}: {
  /** In render order (Program `order`), each with its live box. */
  connections: ProgramConnection[];
  theme: Theme;
  portfolioId: string;
  canEdit: boolean;
  /** Every Program the viewer can edit — the destination list for a lane's ⇄ picker. */
  editablePrograms: Program[];
  collapsedProgramIds: Set<string>;
  onToggleBand: (programId: string) => void;
  expandedProgramId: string | null;
  onExpandProgram: (programId: string | null) => void;
  /** Dispatches #124's swimlane move primitive — the rail never calls the planner itself. */
  onMoveSwimlane: (sourceProgramId: string, laneId: string, destProgramId: string) => void;
  onOpenLaneOptions: (programId: string) => void;
  onReorderProgram?: (programId: string, direction: "up" | "down") => void;
  reorderErrors: Record<string, string>;
  /** Rendered under the last card — "+ New Program" on the combined surface. */
  footer?: React.ReactNode;
  /**
   * Version-History read-only mode (wayframe#128): when set, every card
   * renders the Program document from THIS map — the Version currently being
   * read — instead of its live box's, and no card offers editing. A live
   * Program missing from the map didn't exist yet when that Version was saved,
   * and its card says so rather than quietly showing live content beside a
   * frozen canvas. Band collapse stays live either way: it's viewer-local, with
   * no document field behind it (see this file's header).
   */
  readOnlyPrograms?: Map<string, Program>;
  /** Replaces the structure editor's body whenever a card can't be edited — so "you're reading a saved Version" and "you have viewer access" can say different things. */
  viewOnlyNote?: string;
}) {
  const readingVersion = readOnlyPrograms != null;
  return (
    <aside aria-label="Programs in this Roadmap" className="sticky top-0 flex h-screen w-[320px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
        Programs in this Roadmap
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {connections.map((connection, index) => (
          <RailCard
            key={connection.programId}
            connection={connection}
            theme={theme}
            portfolioId={portfolioId}
            canEdit={canEdit && !readingVersion}
            editablePrograms={editablePrograms}
            displayProgram={readingVersion ? readOnlyPrograms.get(connection.programId) ?? null : null}
            missingFromVersion={readingVersion && !readOnlyPrograms.has(connection.programId)}
            viewOnlyNote={viewOnlyNote}
            bandCollapsed={collapsedProgramIds.has(connection.programId)}
            onToggleBand={() => onToggleBand(connection.programId)}
            expanded={expandedProgramId === connection.programId}
            onExpand={() => onExpandProgram(expandedProgramId === connection.programId ? null : connection.programId)}
            onMoveSwimlane={onMoveSwimlane}
            onOpenLaneOptions={() => onOpenLaneOptions(connection.programId)}
            onReorderProgram={onReorderProgram}
            canMoveUp={index > 0}
            canMoveDown={index < connections.length - 1}
            reorderError={reorderErrors[connection.programId]}
          />
        ))}
        {footer}
      </div>
    </aside>
  );
}

function RailCard({
  connection,
  theme,
  portfolioId,
  canEdit,
  editablePrograms,
  displayProgram,
  missingFromVersion,
  viewOnlyNote,
  bandCollapsed,
  onToggleBand,
  expanded,
  onExpand,
  onMoveSwimlane,
  onOpenLaneOptions,
  onReorderProgram,
  canMoveUp,
  canMoveDown,
  reorderError,
}: {
  connection: ProgramConnection;
  theme: Theme;
  portfolioId: string;
  canEdit: boolean;
  editablePrograms: Program[];
  /** The frozen Program document to render instead of the live box's (see ProgramRail's `readOnlyPrograms`), or null in the normal live case. */
  displayProgram: Program | null;
  /** This Program exists live but not in the Version being read. */
  missingFromVersion: boolean;
  viewOnlyNote?: string;
  bandCollapsed: boolean;
  onToggleBand: () => void;
  expanded: boolean;
  onExpand: () => void;
  onMoveSwimlane: (sourceProgramId: string, laneId: string, destProgramId: string) => void;
  onOpenLaneOptions: () => void;
  onReorderProgram?: (programId: string, direction: "up" | "down") => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  reorderError?: string;
}) {
  const program = displayProgram ?? connection.box.data;
  const lanes = program.swimlanes.filter((l) => l.type === "lane");
  const groups = [...(program.swimlaneGroups ?? [])].sort((a, b) => a.order - b.order);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={onToggleBand}
          aria-pressed={bandCollapsed}
          aria-label={`${bandCollapsed ? "Expand" : "Collapse"} ${program.programName}'s band on the canvas`}
          title={bandCollapsed ? "Band collapsed on the canvas — click to expand" : "Band expanded on the canvas — click to collapse"}
          className={
            "shrink-0 rounded border px-1.5 py-0.5 text-[11px] " +
            (bandCollapsed ? "border-zinc-300 text-zinc-400 dark:border-zinc-700" : "border-emerald-500 text-emerald-700 dark:text-emerald-300")
          }
        >
          {bandCollapsed ? "◻" : "◼"}
        </button>
        <button onClick={onExpand} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <StatusDot status={connection.status} />
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{program.programName}</span>
          </div>
          <div className="truncate text-[11px] text-zinc-500">
            {missingFromVersion ? (
              "Not in this Version"
            ) : (
              <>
                {lanes.length} lane{lanes.length === 1 ? "" : "s"} · {program.milestones.length} item{program.milestones.length === 1 ? "" : "s"}
                {program.owner ? ` · ${program.owner}` : ""}
              </>
            )}
          </div>
        </button>
        <span aria-hidden="true" className="shrink-0 text-xs text-zinc-400">
          {expanded ? "▾" : "▸"}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Link href={`/p/${portfolioId}?programId=${encodeURIComponent(program.id)}`} className="rounded border border-zinc-300 px-1.5 py-0.5 text-blue-600 hover:underline dark:border-zinc-700">
              Open on its own
            </Link>
            {canEdit && onReorderProgram && (
              <>
                <button
                  onClick={() => onReorderProgram(program.id, "up")}
                  disabled={!canMoveUp}
                  aria-label={`Move ${program.programName} up`}
                  className="rounded border border-zinc-300 px-1.5 py-0.5 text-zinc-600 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300"
                >
                  ▲
                </button>
                <button
                  onClick={() => onReorderProgram(program.id, "down")}
                  disabled={!canMoveDown}
                  aria-label={`Move ${program.programName} down`}
                  className="rounded border border-zinc-300 px-1.5 py-0.5 text-zinc-600 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300"
                >
                  ▼
                </button>
              </>
            )}
            {reorderError && <span className="w-full text-[11px] text-red-600">{reorderError}</span>}
          </div>

          {!canEdit ? (
            <p className="py-1 text-[11px] text-zinc-400">{viewOnlyNote ?? "You have view-only access to this Roadmap."}</p>
          ) : (
            <>
              <ul>
                {lanes.map((lane, i) => (
                  <RailLaneRow
                    key={lane.id}
                    lane={lane}
                    laneIndex={i}
                    laneCount={lanes.length}
                    groupName={lane.groupId ? groupById.get(lane.groupId)?.name : undefined}
                    itemCount={program.milestones.filter((m) => m.laneId === lane.id).length}
                    theme={theme}
                    program={program}
                    editablePrograms={editablePrograms}
                    box={connection.box}
                    onMoveSwimlane={onMoveSwimlane}
                  />
                ))}
                {lanes.length === 0 && <li className="py-1 text-[11px] text-zinc-400">No swimlanes yet.</li>}
              </ul>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button onClick={() => connection.box.addSwimlane("lane")} className="rounded border border-dashed border-zinc-300 px-2 py-1 text-[11px] text-zinc-500 dark:border-zinc-700">
                  + Lane
                </button>
                <button onClick={connection.box.addSwimlaneGroup} className="rounded border border-dashed border-zinc-300 px-2 py-1 text-[11px] text-zinc-500 dark:border-zinc-700">
                  + Group
                </button>
                <button onClick={onOpenLaneOptions} className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-500 dark:border-zinc-700">
                  All lane options…
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RailLaneRow({
  lane,
  laneIndex,
  laneCount,
  groupName,
  itemCount,
  theme,
  program,
  editablePrograms,
  box,
  onMoveSwimlane,
}: {
  lane: Swimlane;
  laneIndex: number;
  laneCount: number;
  groupName?: string;
  itemCount: number;
  theme: Theme;
  program: Program;
  editablePrograms: Program[];
  box: ProgramConnection["box"];
  onMoveSwimlane: (sourceProgramId: string, laneId: string, destProgramId: string) => void;
}) {
  const [moving, setMoving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <li className="border-b border-zinc-100 py-1.5 last:border-0 dark:border-zinc-800" style={{ opacity: lane.hidden ? 0.5 : 1 }}>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`Colour for ${lane.name}`}
          value={lane.color ?? laneColorAt(theme.laneRamp, laneIndex, Math.max(laneCount, 1))}
          onChange={(e) => box.setLaneColor(lane.id, e.target.value)}
          className="h-5 w-5 shrink-0 cursor-pointer rounded border border-zinc-300 bg-transparent p-0 dark:border-zinc-600"
        />
        <input
          value={lane.name}
          onChange={(e) => box.renameSwimlane(lane.id, e.target.value)}
          aria-label={`Name of ${lane.name}`}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-zinc-300 focus:border-zinc-400 dark:hover:border-zinc-700"
        />
        <span className="shrink-0 text-[11px] text-zinc-400">{itemCount}</span>
        <div className="flex shrink-0 flex-col">
          <button onClick={() => box.moveSwimlane(lane.id, -1)} disabled={laneIndex === 0} aria-label={`Move ${lane.name} up`} className="px-0.5 text-[9px] leading-tight opacity-60 hover:opacity-100 disabled:opacity-20">
            ▲
          </button>
          <button onClick={() => box.moveSwimlane(lane.id, 1)} disabled={laneIndex === laneCount - 1} aria-label={`Move ${lane.name} down`} className="px-0.5 text-[9px] leading-tight opacity-60 hover:opacity-100 disabled:opacity-20">
            ▼
          </button>
        </div>
        <button
          onClick={() => box.setLaneHidden(lane.id, !lane.hidden)}
          aria-pressed={Boolean(lane.hidden)}
          aria-label={`${lane.hidden ? "Show" : "Hide"} ${lane.name}`}
          title={lane.hidden ? "Hidden from the chart" : "Hide from the chart"}
          className="shrink-0 rounded border border-zinc-300 px-1 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-600"
        >
          {lane.hidden ? "◌" : "◉"}
        </button>
        <button
          onClick={() => setMoving((v) => !v)}
          aria-expanded={moving}
          aria-label={`Move ${lane.name} to another Program`}
          title="Move this lane to another Program"
          className={"shrink-0 rounded border px-1 py-0.5 text-[10px] " + (moving ? "border-amber-500 bg-amber-100 text-amber-900" : "border-zinc-300 text-zinc-500 dark:border-zinc-600")}
        >
          ⇄
        </button>
        <button
          onClick={() => setConfirmingDelete((v) => !v)}
          aria-label={`Delete ${lane.name}`}
          className="shrink-0 rounded border border-zinc-300 px-1 py-0.5 text-[10px] text-red-600 dark:border-zinc-600"
        >
          ✕
        </button>
      </div>

      {groupName && <p className="mt-0.5 pl-6 text-[10px] text-zinc-400">in {groupName}</p>}

      {confirmingDelete && (
        // Mirrors SwimlaneManager's own inline-expand delete confirm rather
        // than a dialog — a lane takes its items with it, which is the one
        // thing the confirm exists to say out loud.
        <div className="mt-1.5 rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          Delete {lane.name}
          {itemCount > 0 ? ` and its ${itemCount} item${itemCount === 1 ? "" : "s"}` : ""}?
          <div className="mt-1 flex gap-1.5">
            <button
              onClick={() => {
                box.removeSwimlane(lane.id);
                setConfirmingDelete(false);
              }}
              className="rounded bg-red-600 px-2 py-0.5 text-[11px] text-white"
            >
              Delete
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="rounded border border-red-300 px-2 py-0.5 text-[11px] dark:border-red-900">
              Cancel
            </button>
          </div>
        </div>
      )}

      {moving && (
        <div className="mt-1.5">
          <CrossProgramMovePicker
            compact
            kind="swimlane"
            source={program}
            itemId={lane.id}
            programs={editablePrograms}
            onMove={(destProgramId) => {
              onMoveSwimlane(program.id, lane.id, destProgramId);
              setMoving(false);
            }}
          />
        </div>
      )}
    </li>
  );
}
