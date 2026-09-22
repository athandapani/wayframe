"use client";

// PROTOTYPE — throwaway. wayframe#125, Variant C: "band chip strip +
// structure drawer."
//
// The bet: nothing permanent should share the screen with the canvas except
// one slim strip. Programs are chips directly under the shared axis — the
// chip IS the band control (collapse, item count, health) and the chip's
// "⋯" is how you get at that Program's structure, which opens as a right
// drawer *over* the canvas and closes again. There are no tabs and no dock:
// the Program-tabbed structure editor is a Program-switching drawer header
// instead, so the editor is never on screen when you aren't using it.
//
// Cross-Program move is the modal's *title breadcrumb*: "Core Platform ›
// API › <title>", where the first two crumbs are dropdowns. Moving is
// re-aiming the breadcrumb; a confirm bar slides in the moment it's dirty.
// The bet there is that "where does this live" belongs at the top of the
// editor as identity, not in the middle of it as one more field.
import { useState } from "react";
import type { Program } from "@/components/timeline/types";
import { MergedCanvas, MockMilestoneEditorBody, ProtoStatePanel, droppedFor, type ProtoState } from "./shared";

const RAG = ["#059669", "#d97706", "#dc2626"];

export function VariantC({ state }: { state: ProtoState }) {
  const [drawerProgramId, setDrawerProgramId] = useState<string | null>(null);
  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-950">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        {state.programs.map((p, i) => (
          <ProgramChip
            key={p.id}
            program={p}
            state={state}
            accent={RAG[i % RAG.length]}
            onOpenStructure={() => {
              setDrawerProgramId(p.id);
              state.setActiveProgramId(p.id);
            }}
          />
        ))}
        <button className="rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-700">+ Program</button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <MergedCanvas state={state} />
      </div>

      <ProtoStatePanel state={state} />

      {drawerProgramId && <StructureDrawer state={state} programId={drawerProgramId} onPick={setDrawerProgramId} onClose={() => setDrawerProgramId(null)} />}
      {state.editing && <BreadcrumbModal state={state} />}
    </div>
  );
}

function ProgramChip({ program, state, accent, onOpenStructure }: { program: Program; state: ProtoState; accent: string; onOpenStructure: () => void }) {
  const collapsed = state.isCollapsed(program.id);
  return (
    <span
      className={"flex items-center gap-2 rounded-full border py-1 pl-2.5 pr-1.5 text-xs " + (collapsed ? "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900" : "border-zinc-300 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100")}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: collapsed ? "#d4d4d8" : accent }} />
      <button onClick={() => state.toggleBand(program.id)} aria-pressed={collapsed} className="font-medium">
        {program.programName}
      </button>
      <span className="text-[10px] opacity-60">{program.milestones.length}</span>
      <button onClick={onOpenStructure} aria-label={`Structure of ${program.programName}`} className="rounded-full px-1.5 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
        ⋯
      </button>
    </span>
  );
}

/** The Program-tabbed structure editor, re-cast as a drawer whose header IS the tab control. Over the canvas, never beside it. */
function StructureDrawer({ state, programId, onPick, onClose }: { state: ProtoState; programId: string; onPick: (id: string) => void; onClose: () => void }) {
  const program = state.programs.find((p) => p.id === programId)!;
  return (
    <div className="fixed inset-y-0 right-0 z-30 flex w-[440px] flex-col border-l border-zinc-300 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span className="text-xs text-zinc-500">Structure of</span>
        <select
          value={programId}
          onChange={(e) => {
            onPick(e.target.value);
            state.setActiveProgramId(e.target.value);
          }}
          aria-label="Program being structured"
          className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm font-medium dark:border-zinc-600"
        >
          {state.programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.programName}
            </option>
          ))}
        </select>
        <button onClick={onClose} aria-label="Close" className="ml-auto text-zinc-400">
          ✕
        </button>
      </div>
      <p className="border-b border-zinc-100 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-800">The canvas behind this still shows all {state.programs.length} Programs.</p>
      <ul className="min-h-0 flex-1 overflow-y-auto p-3">
        {(program.swimlaneGroups ?? []).map((g) => (
          <li key={g.id}>
            <div className="mb-1 rounded px-2 py-1 text-xs font-semibold" style={{ background: `${g.color}22`, color: g.color }}>
              {g.name}
            </div>
            <ul className="ml-3 border-l border-zinc-200 pl-2 dark:border-zinc-800">
              {program.swimlanes
                .filter((l) => l.type === "lane" && l.groupId === g.id)
                .map((lane) => (
                  <DrawerLaneRow key={lane.id} program={program} state={state} laneName={lane.name} count={program.milestones.filter((m) => m.laneId === lane.id).length} />
                ))}
            </ul>
          </li>
        ))}
        {program.swimlanes
          .filter((l) => l.type === "lane" && !l.groupId)
          .map((lane) => (
            <DrawerLaneRow key={lane.id} program={program} state={state} laneName={lane.name} count={program.milestones.filter((m) => m.laneId === lane.id).length} />
          ))}
      </ul>
    </div>
  );
}

/** "Move to…" as a menu item rather than an always-visible select — in a drawer this narrow, a fourth dropdown per row is what pushes the lane name to an ellipsis. */
function DrawerLaneRow({ program, state, laneName, count }: { program: Program; state: ProtoState; laneName: string; count: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const others = state.programs.filter((p) => p.id !== program.id);
  return (
    <li className="relative mb-1 flex items-center gap-2 rounded border border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
      <span className="min-w-0 flex-1 truncate text-sm">{laneName}</span>
      <span className="text-[11px] text-zinc-400">{count}</span>
      <button onClick={() => setMenuOpen((v) => !v)} aria-label={`Actions for ${laneName}`} className="rounded px-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
        ⋯
      </button>
      {menuOpen && (
        <div className="absolute right-1 top-full z-10 mt-1 w-56 rounded border border-zinc-300 bg-white py-1 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-400">Move to another Program</p>
          {others.map((dest) => (
            <button
              key={dest.id}
              onClick={() => {
                state.logMove({ what: "swimlane", label: laneName, fromProgram: program.programName, toProgram: dest.programName, toLane: null, dropped: ["Swimlane Group membership", `${count} item${count === 1 ? "" : "s"} move with the lane`] });
                setMenuOpen(false);
              }}
              className="block w-full px-2 py-1.5 text-left hover:bg-amber-50 dark:hover:bg-amber-950"
            >
              → {dest.programName} <span className="text-zinc-400">({count} items follow)</span>
            </button>
          ))}
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
          <button className="block w-full px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">Rename</button>
          <button className="block w-full px-2 py-1.5 text-left text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">Delete lane</button>
        </div>
      )}
    </li>
  );
}

/** The move control as editable identity: the modal's own breadcrumb. */
function BreadcrumbModal({ state }: { state: ProtoState }) {
  const { programId, milestone } = state.editing!;
  const owner = state.programs.find((p) => p.id === programId)!;
  const dropped = droppedFor(owner, milestone);
  const [toProgramId, setToProgramId] = useState(programId);
  const [toLaneId, setToLaneId] = useState(milestone.laneId);
  const dest = state.programs.find((p) => p.id === toProgramId)!;
  const destLanes = dest.swimlanes.filter((l) => l.type === "lane");
  const dirty = toProgramId !== programId || toLaneId !== milestone.laneId;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => state.setEditing(null)}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 p-3 dark:border-zinc-700">
          <select
            value={toProgramId}
            aria-label="Program"
            onChange={(e) => {
              setToProgramId(e.target.value);
              const lanes = state.programs.find((p) => p.id === e.target.value)!.swimlanes.filter((l) => l.type === "lane");
              setToLaneId(lanes[0]?.id ?? "");
            }}
            className={"rounded border bg-transparent px-1.5 py-0.5 text-sm " + (toProgramId !== programId ? "border-amber-500 text-amber-800 dark:text-amber-300" : "border-transparent text-zinc-500 hover:border-zinc-300")}
          >
            {state.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.programName}
              </option>
            ))}
          </select>
          <span className="text-zinc-300">›</span>
          <select
            value={toLaneId}
            aria-label="Swimlane"
            onChange={(e) => setToLaneId(e.target.value)}
            className={"rounded border bg-transparent px-1.5 py-0.5 text-sm " + (toLaneId !== milestone.laneId ? "border-amber-500 text-amber-800 dark:text-amber-300" : "border-transparent text-zinc-500 hover:border-zinc-300")}
          >
            {destLanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <span className="text-zinc-300">›</span>
          <span className="text-lg font-semibold">{milestone.title}</span>
          <button onClick={() => state.setEditing(null)} aria-label="Close" className="ml-auto text-zinc-400">
            ✕
          </button>
        </div>

        {dirty && (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <span>
              Move to <b>{dest.programName}</b> / {destLanes.find((l) => l.id === toLaneId)?.name}
              {toProgramId !== programId && dropped.length > 0 ? ` — drops ${dropped.join(", ")}` : ""}
            </span>
            <button
              onClick={() => {
                state.logMove({ what: "milestone", label: milestone.title, fromProgram: owner.programName, toProgram: dest.programName, toLane: destLanes.find((l) => l.id === toLaneId)?.name ?? null, dropped: toProgramId !== programId ? dropped : [] });
                state.setEditing(null);
              }}
              className="ml-auto rounded bg-amber-600 px-2.5 py-1 font-medium text-white"
            >
              Confirm move
            </button>
            <button
              onClick={() => {
                setToProgramId(programId);
                setToLaneId(milestone.laneId);
              }}
              className="text-amber-800 dark:text-amber-300"
            >
              Revert
            </button>
          </div>
        )}

        <div className="max-h-[65vh] overflow-y-auto p-4">
          <MockMilestoneEditorBody milestone={milestone} />
        </div>
      </div>
    </div>
  );
}
