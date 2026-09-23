"use client";

// The cross-Program move control (wayframe#126) — the UI half of #124's
// primitive, in the two places #125's Variant B resolution put it: the
// milestone inspector's first line, and the rail's per-lane ⇄.
//
// #118 settled the shape: a Program picker plus a Swimlane picker scoped to
// it (changing Program re-scopes the lane list), never drag-and-drop, with a
// confirm step that NAMES what gets dropped. The naming is why this renders
// a preview at all: it runs the very same pure planner the move itself will
// run (src/lib/corrections/cross-program-move.ts) against the current source
// and destination Programs, and reads `droppedDependsOn`/
// `clearedTopLevelLinks` straight off the resulting plan. A hand-written
// "dependencies may be dropped" caption would be a second, driftable
// description of the primitive's behavior; this can only ever say what the
// primitive is actually about to do.
//
// The preview plan is thrown away — the real move re-plans inside the box
// orchestrator with freshly minted ids (the orchestrator, not this
// component, owns the destination-insert-before-source-release ordering that
// makes the primitive safe). Both planner calls are pure, so running it
// twice costs nothing but a couple of array passes.
//
// Only Programs the viewer can edit are offered. The box orchestrator
// refuses an un-writable side anyway (defense in depth, see its doc), but a
// dropdown that offers a destination the move will then silently refuse is
// its own bug.

import { useState } from "react";
import type { Program } from "@/components/timeline/types";
import { planMilestoneMove, planSwimlaneMove, type DroppedDependsOn } from "@/lib/corrections/cross-program-move";

/** Placeholder ids for the preview plan only — never written anywhere. The real move mints its own through the box orchestrator. */
const PREVIEW_ID = "preview-id";

function titlesFor(program: Program, dropped: DroppedDependsOn[]): string[] {
  const byId = new Map(program.milestones.map((m) => [m.id, m.title]));
  return dropped.map((d) => `${byId.get(d.milestoneId) ?? d.milestoneId} → ${byId.get(d.predecessorId) ?? d.predecessorId}`);
}

/** What the confirm step has to name before anything is dispatched — see this file's header for why it comes from the planner rather than from prose. */
function describeLosses(losses: { dependsOn: string[]; topLevelLinks: number; movedItems?: number; dropsGroup?: boolean }): string[] {
  const out: string[] = [];
  if (losses.dependsOn.length > 0) out.push(`${losses.dependsOn.length} dependency link${losses.dependsOn.length === 1 ? "" : "s"} (${losses.dependsOn.join("; ")})`);
  if (losses.topLevelLinks > 0) out.push(`${losses.topLevelLinks} link${losses.topLevelLinks === 1 ? "" : "s"} to a Program-band milestone`);
  if (losses.dropsGroup) out.push("Swimlane Group membership");
  return out;
}

export function CrossProgramMovePicker({
  kind,
  source,
  itemId,
  programs,
  currentLaneName,
  onMove,
  compact = false,
}: {
  kind: "milestone" | "swimlane";
  /** The live source Program (a box's own `data`, never the merged pseudo-Program). */
  source: Program;
  /** The item's id in `source`'s OWN id space. */
  itemId: string;
  /** Every Program the viewer can edit, including the source — the picker filters the source out of the destination list itself. */
  programs: Program[];
  /** Shown in the "Currently in" breadcrumb for a milestone; omitted for a lane, which IS the location. */
  currentLaneName?: string;
  /** Dispatches the real move. `destLaneId` is null for a swimlane move (the lane arrives as itself, not into another lane). */
  onMove: (destProgramId: string, destLaneId: string | null) => void;
  compact?: boolean;
}) {
  const destinations = programs.filter((p) => p.id !== source.id);
  const [destProgramId, setDestProgramId] = useState<string>("");
  const dest = destinations.find((p) => p.id === destProgramId);
  const destLanes = dest?.swimlanes.filter((l) => l.type !== "separator") ?? [];
  const [destLaneId, setDestLaneId] = useState<string>("");
  const effectiveLaneId = destLaneId || destLanes[0]?.id || "";

  const plan =
    dest && kind === "milestone" && effectiveLaneId
      ? planMilestoneMove(source, dest, itemId, effectiveLaneId, PREVIEW_ID)
      : dest && kind === "swimlane"
        ? planSwimlaneMove(source, dest, itemId, {
            lane: PREVIEW_ID,
            milestones: Object.fromEntries(source.milestones.filter((m) => m.laneId === itemId).map((m) => [m.id, `${PREVIEW_ID}-${m.id}`])),
          })
        : null;

  const movedItemCount = kind === "swimlane" ? source.milestones.filter((m) => m.laneId === itemId).length : 0;
  const losses = plan
    ? describeLosses({
        dependsOn: titlesFor(source, plan.droppedDependsOn),
        topLevelLinks: plan.clearedTopLevelLinks.length,
        dropsGroup: kind === "swimlane" && Boolean(source.swimlanes.find((l) => l.id === itemId)?.groupId),
      })
    : [];

  const ready = Boolean(dest) && (kind === "swimlane" || Boolean(effectiveLaneId));
  const size = compact ? "px-1.5 py-1 text-xs" : "px-2 py-1 text-sm";
  const selectClass = `w-full rounded border border-zinc-300 bg-transparent dark:border-zinc-600 ${size}`;

  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/60">
      <p className="mb-1.5 text-[11px] text-zinc-500">
        Currently in <b className="text-zinc-800 dark:text-zinc-200">{source.programName}</b>
        {currentLaneName ? ` / ${currentLaneName}` : ""}
      </p>

      {destinations.length === 0 ? (
        <p className="text-[11px] text-zinc-400">No other Program in this Roadmap is open for you to edit.</p>
      ) : (
        <div className="space-y-1.5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-zinc-500">Move to Program</span>
            <select
              aria-label="Move to Program"
              className={selectClass}
              value={destProgramId}
              onChange={(e) => {
                setDestProgramId(e.target.value);
                // Re-scoping the lane list is the behaviour #118 called out
                // by name: a lane id from the previously-chosen Program means
                // nothing in this one.
                setDestLaneId("");
              }}
            >
              <option value="">Stay in {source.programName}</option>
              {destinations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.programName}
                </option>
              ))}
            </select>
          </label>

          {kind === "milestone" && dest && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-zinc-500">Into swimlane</span>
              {destLanes.length === 0 ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">{dest.programName} has no swimlanes yet — add one there first.</p>
              ) : (
                <select aria-label="Into swimlane" className={selectClass} value={effectiveLaneId} onChange={(e) => setDestLaneId(e.target.value)}>
                  {destLanes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {kind === "swimlane" && dest && movedItemCount > 0 && (
            <p className="text-[11px] text-zinc-500">
              All {movedItemCount} item{movedItemCount === 1 ? "" : "s"} in this lane move with it.
            </p>
          )}

          {dest && losses.length > 0 && (
            <p className="rounded bg-amber-50 p-1.5 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Leaving {source.programName} drops: {losses.join("; ")}.
            </p>
          )}

          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              if (!dest) return;
              onMove(dest.id, kind === "milestone" ? effectiveLaneId : null);
            }}
            className="w-full rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
          >
            {dest ? `Move to ${dest.programName}` : "Move"}
          </button>
        </div>
      )}
    </div>
  );
}
