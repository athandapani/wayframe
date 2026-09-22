"use client";

// PROTOTYPE — throwaway. wayframe#125, Variant A: "canvas over docked
// structure tabs."
//
// The bet: the canvas is the document, so it gets the whole width and the
// whole top of the screen, and every editor is a drawer *under* it. Program
// tabs live in a docked bottom panel — the same place a spreadsheet puts
// sheet tabs — so switching which Program you're restructuring never moves
// the canvas or costs it a pixel of width. Collapse lives twice on purpose:
// on the canvas band headers (where you're looking) and as a pill row above
// the canvas (where you can see all three states at once).
//
// Cross-Program move surfaces as a bordered "Location" block inside the
// milestone editor's own field grid — it reads as one more field, which is
// the cheapest possible thing to learn, and the riskiest to fat-finger.
import { useState } from "react";
import type { Program } from "@/components/timeline/types";
import { MergedCanvas, MockMilestoneEditorBody, MoveTargetPicker, ProtoStatePanel, droppedFor, type ProtoState } from "./shared";

export function VariantA({ state }: { state: ProtoState }) {
  const [dockOpen, setDockOpen] = useState(true);
  const active = state.programs.find((p) => p.id === state.activeProgramId)!;

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-950">
      {/* Band pills — every Program's collapse state readable at a glance. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-2 text-xs dark:border-zinc-800">
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">All Programs</span>
        <span className="text-zinc-400">·</span>
        {state.programs.map((p) => (
          <button
            key={p.id}
            onClick={() => state.toggleBand(p.id)}
            aria-pressed={state.isCollapsed(p.id)}
            className={
              "rounded-full border px-2.5 py-1 " +
              (state.isCollapsed(p.id)
                ? "border-zinc-300 text-zinc-400 dark:border-zinc-700"
                : "border-zinc-800 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900")
            }
          >
            {state.isCollapsed(p.id) ? "▸" : "▾"} {p.programName}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <MergedCanvas state={state} />
      </div>

      {/* Docked structure editor — tabs along the bottom, spreadsheet-style. */}
      <div className="shrink-0 border-t border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center gap-1 px-3 pt-2">
          {state.programs.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                state.setActiveProgramId(p.id);
                setDockOpen(true);
              }}
              className={
                "rounded-t border border-b-0 px-3 py-1.5 text-xs " +
                (p.id === state.activeProgramId && dockOpen
                  ? "border-zinc-300 bg-white font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200")
              }
            >
              {p.programName}
            </button>
          ))}
          <button onClick={() => setDockOpen((v) => !v)} className="ml-auto px-2 py-1 text-xs text-zinc-500">
            {dockOpen ? "Hide structure ▾" : "Show structure ▴"}
          </button>
        </div>
        {dockOpen && (
          <div className="max-h-[34vh] overflow-y-auto border-t border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="mb-2 text-[11px] text-zinc-500">
              Editing the structure of <b>{active.programName}</b> only — the canvas above still shows all {state.programs.length} Programs.
            </p>
            <LaneTable program={active} state={state} />
          </div>
        )}
        <ProtoStatePanel state={state} />
      </div>

      {state.editing && <MilestoneModal state={state} />}
    </div>
  );
}

/** Lane rows with the cross-Program "Program" select sitting directly beside the existing "Group" select — the two reassignment dropdowns become peers. */
function LaneTable({ program, state }: { program: Program; state: ProtoState }) {
  const groups = program.swimlaneGroups ?? [];
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {program.swimlanes
        .filter((l) => l.type === "lane")
        .map((lane) => {
          const count = program.milestones.filter((m) => m.laneId === lane.id).length;
          return (
            <li key={lane.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="flex shrink-0 flex-col text-[9px] leading-tight text-zinc-400">
                <button>▲</button>
                <button>▼</button>
              </span>
              <span className="h-5 w-5 shrink-0 rounded border border-zinc-300" style={{ background: lane.color ?? "#cbd5e1" }} />
              <input readOnly value={lane.name} className="w-40 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-600" />
              <select defaultValue={lane.groupId ?? ""} className="rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-600" aria-label={`Group for ${lane.name}`}>
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {/* The lane-level cross-Program move: same widget, whole-lane scope, with the confirm step #118 asked for rendered inline (a native confirm() would block the whole page). */}
              <LaneProgramSelect program={program} state={state} laneName={lane.name} count={count} />
              <span className="w-16 text-right text-[11px] text-zinc-400">{count} items</span>
              <button className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-500 dark:border-zinc-600">Delete</button>
            </li>
          );
        })}
    </ul>
  );
}

/** Lane "Program" dropdown + its inline confirm — the whole-lane half of the same move primitive the milestone editor uses. */
function LaneProgramSelect({ program, state, laneName, count }: { program: Program; state: ProtoState; laneName: string; count: number }) {
  const [pending, setPending] = useState<string | null>(null);
  const dest = state.programs.find((p) => p.id === pending);
  return (
    <span className="flex items-center gap-1.5">
      <select
        value={pending ?? program.id}
        aria-label={`Program for ${laneName}`}
        className="rounded border border-amber-400 bg-amber-50 px-1.5 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        onChange={(e) => setPending(e.target.value === program.id ? null : e.target.value)}
      >
        {state.programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.programName}
          </option>
        ))}
      </select>
      {dest && (
        <>
          <button
            onClick={() => {
              state.logMove({ what: "swimlane", label: laneName, fromProgram: program.programName, toProgram: dest.programName, toLane: null, dropped: ["Swimlane Group membership", `${count} item${count === 1 ? "" : "s"} move with the lane`] });
              setPending(null);
            }}
            className="rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white"
          >
            Move {count} item{count === 1 ? "" : "s"}
          </button>
          <button onClick={() => setPending(null)} className="text-[11px] text-zinc-500">
            Cancel
          </button>
        </>
      )}
    </span>
  );
}

function MilestoneModal({ state }: { state: ProtoState }) {
  const { programId, milestone } = state.editing!;
  const owner = state.programs.find((p) => p.id === programId)!;
  const dropped = droppedFor(owner, milestone);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => state.setEditing(null)}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-2xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-700">
          <span className="text-lg font-semibold">{milestone.title}</span>
          <button onClick={() => state.setEditing(null)} aria-label="Close" className="text-zinc-400">
            ✕
          </button>
        </div>
        <MockMilestoneEditorBody
          milestone={milestone}
          moveSlot={
            <div className="mt-4 rounded border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Location</p>
              <MoveTargetPicker
                programs={state.programs}
                currentProgramId={programId}
                currentLaneId={milestone.laneId}
                onConfirm={(toProgramId, toLaneId) => {
                  const dest = state.programs.find((p) => p.id === toProgramId)!;
                  const lane = dest.swimlanes.find((l) => l.id === toLaneId);
                  state.logMove({ what: "milestone", label: milestone.title, fromProgram: owner.programName, toProgram: dest.programName, toLane: lane?.name ?? null, dropped });
                  state.setEditing(null);
                }}
              />
              {dropped.length > 0 && <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300">Moving out of {owner.programName} drops: {dropped.join(", ")}.</p>}
            </div>
          }
        />
      </div>
    </div>
  );
}
