"use client";

// PROTOTYPE — throwaway. wayframe#125, Variant B: "left Program rail,
// canvas right."
//
// The bet: with 3-4 Programs, the thing you do constantly is *scan and
// collapse*, not restructure — so the Program list deserves permanent,
// always-visible real estate, and collapse should never mean hunting a
// chevron inside a band header you may have just scrolled past. The rail is
// both the collapse control set AND the structure editor: there are no tabs
// at all, because "which Program am I editing" is just "which rail card is
// expanded." Selection and collapse are deliberately independent — you can
// edit a Program's lanes while its band is collapsed on the canvas.
//
// Cross-Program move never opens a modal: clicking a marker docks a right
// inspector, and the move control is the inspector's first line — a
// "Currently in" breadcrumb you edit in place. Lanes move from a ⇄ button
// on the rail row, which expands into the same picker beneath it.
import { useState } from "react";
import type { Program } from "@/components/timeline/types";
import { MergedCanvas, MockMilestoneEditorBody, MoveTargetPicker, ProtoStatePanel, droppedFor, type ProtoState } from "./shared";

export function VariantB({ state }: { state: ProtoState }) {
  return (
    <div className="flex h-screen bg-white dark:bg-zinc-950">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
          Programs in this Roadmap
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.programs.map((p) => (
            <RailCard key={p.id} program={p} state={state} />
          ))}
          <button className="m-3 rounded border border-dashed border-zinc-300 px-2 py-1.5 text-xs text-zinc-500 dark:border-zinc-700">+ New Program</button>
        </div>
        <ProtoStatePanel state={state} />
      </aside>

      <main className="min-w-0 flex-1 overflow-auto p-4">
        <MergedCanvas state={state} />
      </main>

      {state.editing && <Inspector state={state} />}
    </div>
  );
}

/** One Program: collapse eye (canvas band) + expand chevron (structure editing). Two independent affordances, deliberately. */
function RailCard({ program, state }: { program: Program; state: ProtoState }) {
  const expanded = state.activeProgramId === program.id;
  const collapsed = state.isCollapsed(program.id);
  const items = program.milestones.length;
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => state.toggleBand(program.id)}
          title={collapsed ? "Band collapsed on the canvas — click to expand" : "Band expanded on the canvas — click to collapse"}
          aria-pressed={collapsed}
          className={"shrink-0 rounded border px-1.5 py-0.5 text-[11px] " + (collapsed ? "border-zinc-300 text-zinc-400 dark:border-zinc-700" : "border-emerald-500 text-emerald-700 dark:text-emerald-300")}
        >
          {collapsed ? "◻" : "◼"}
        </button>
        <button onClick={() => state.setActiveProgramId(expanded ? "" : program.id)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{program.programName}</div>
          <div className="text-[11px] text-zinc-500">
            {program.swimlanes.filter((l) => l.type === "lane").length} lanes · {items} items · {program.owner}
          </div>
        </button>
        <span className="shrink-0 text-xs text-zinc-400">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <ul className="border-t border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
          {program.swimlanes
            .filter((l) => l.type === "lane")
            .map((lane) => (
              <RailLaneRow key={lane.id} program={program} state={state} laneName={lane.name} count={program.milestones.filter((m) => m.laneId === lane.id).length} />
            ))}
          <li className="py-1.5">
            <button className="rounded border border-dashed border-zinc-300 px-2 py-1 text-[11px] text-zinc-500 dark:border-zinc-700">+ Lane</button>
            <button className="ml-1.5 rounded border border-dashed border-zinc-300 px-2 py-1 text-[11px] text-zinc-500 dark:border-zinc-700">+ Group</button>
          </li>
        </ul>
      )}
    </div>
  );
}

/** Lane row in the rail. The move picker is hidden behind ⇄ rather than always-on: the rail is 320px, and five permanent controls per lane don't fit one. */
function RailLaneRow({ program, state, laneName, count }: { program: Program; state: ProtoState; laneName: string; count: number }) {
  const [moving, setMoving] = useState(false);
  return (
    <li className="border-b border-zinc-100 py-1.5 last:border-0 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 shrink-0 rounded-sm border border-zinc-300" style={{ background: "#cbd5e1" }} />
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-800 dark:text-zinc-200">{laneName}</span>
        <span className="shrink-0 text-[11px] text-zinc-400">{count}</span>
        <button
          onClick={() => setMoving((v) => !v)}
          title="Move this lane to another Program"
          aria-label={`Move ${laneName} to another Program`}
          className={"shrink-0 rounded border px-1.5 py-0.5 text-[11px] " + (moving ? "border-amber-500 bg-amber-100 text-amber-900" : "border-zinc-300 text-zinc-500 dark:border-zinc-600")}
        >
          ⇄
        </button>
      </div>
      {moving && (
        <div className="mt-1.5 rounded border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/50">
          <MoveTargetPicker
            compact
            programs={state.programs}
            currentProgramId={program.id}
            currentLaneId={null}
            onConfirm={(toProgramId) => {
              const dest = state.programs.find((p) => p.id === toProgramId)!;
              state.logMove({ what: "swimlane", label: laneName, fromProgram: program.programName, toProgram: dest.programName, toLane: null, dropped: ["Swimlane Group membership", `${count} item${count === 1 ? "" : "s"} move with the lane`] });
              setMoving(false);
            }}
          />
          <p className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-300">All {count} item{count === 1 ? "" : "s"} go with it. Group membership is dropped.</p>
        </div>
      )}
    </li>
  );
}

/** Right-docked inspector rather than a modal: the canvas stays visible, so you can see the band you're about to move something out of. */
function Inspector({ state }: { state: ProtoState }) {
  const { programId, milestone } = state.editing!;
  const owner = state.programs.find((p) => p.id === programId)!;
  const lane = owner.swimlanes.find((l) => l.id === milestone.laneId);
  const dropped = droppedFor(owner, milestone);
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span className="truncate text-sm font-semibold">{milestone.title}</span>
        <button onClick={() => state.setEditing(null)} aria-label="Close" className="text-zinc-400">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <MockMilestoneEditorBody
          milestone={milestone}
          headerSlot={
            <div className="mb-3 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-1.5 text-[11px] text-zinc-500">
                Currently in <b className="text-zinc-800 dark:text-zinc-200">{owner.programName}</b> / {lane?.name}
              </p>
              <MoveTargetPicker
                compact
                programs={state.programs}
                currentProgramId={programId}
                currentLaneId={milestone.laneId}
                onConfirm={(toProgramId, toLaneId) => {
                  const dest = state.programs.find((p) => p.id === toProgramId)!;
                  state.logMove({
                    what: "milestone",
                    label: milestone.title,
                    fromProgram: owner.programName,
                    toProgram: dest.programName,
                    toLane: dest.swimlanes.find((l) => l.id === toLaneId)?.name ?? null,
                    dropped,
                  });
                  state.setEditing(null);
                }}
              />
              {dropped.length > 0 && <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">Leaving {owner.programName} drops: {dropped.join(", ")}.</p>}
            </div>
          }
        />
      </div>
    </aside>
  );
}
