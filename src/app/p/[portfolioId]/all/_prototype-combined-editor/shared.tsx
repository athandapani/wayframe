"use client";

// PROTOTYPE — throwaway. wayframe#125. The pieces that are the SAME in
// every variant, so each variant file is free to throw out the layout and
// keep only what it's actually proposing:
//
//   - MergedCanvas      the real RoadmapTimeline over the real
//                       mergeProgramsForAllView merge. Every variant shows
//                       every Program here, always — that's #118's
//                       resolution, not a thing to vary.
//   - MoveTargetPicker  the field-driven Program + Swimlane pair from
//                       #118/#124 (changing Program re-scopes the lane
//                       list). WHERE this surfaces is the whole question;
//                       WHAT it is, is settled.
//   - MockMilestoneEditor / MockStructureRows  stand-ins with roughly the
//                       real editors' density, so a variant can't look
//                       good by being emptier than the real thing.
//   - ProtoStatePanel   rule 5: print the full prototype state after every
//                       action so nothing is judged from memory.
//
// No Yjs, no fetch, no mutation: "moves" append to an in-memory log.
import { useMemo, useState } from "react";
import type { Milestone, Program } from "@/components/timeline/types";
import { mergeForRender } from "@/components/timeline/types";
import { mergeProgramsForAllView, namespaceId, splitNamespacedId } from "@/lib/portfolio/merge-programs";
import { resolvePortfolioTheme, defaultPortfolioTheme } from "@/components/timeline/theme";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { MOCK_PORTFOLIO, MOCK_PROGRAMS } from "./mock-data";

export const PROTO_TODAY = new Date("2026-05-15T00:00:00.000Z");

export interface MoveLogEntry {
  what: "milestone" | "swimlane";
  label: string;
  fromProgram: string;
  toProgram: string;
  toLane: string | null;
  dropped: string[];
}

/** Everything the three variants share as *state* — collapse, which Program tab is active, what's being edited, and the log of moves that would have been dispatched. */
export function useProtoState() {
  const [programs] = useState<Program[]>(MOCK_PROGRAMS);
  /** Band group ids (namespaced `programId::__program__`) this viewer has collapsed. */
  const [collapsedBands, setCollapsedBands] = useState<Set<string>>(new Set());
  const [activeProgramId, setActiveProgramId] = useState<string>(MOCK_PROGRAMS[0].id);
  const [editing, setEditing] = useState<{ programId: string; milestone: Milestone } | null>(null);
  const [moveLog, setMoveLog] = useState<MoveLogEntry[]>([]);

  function toggleBand(programId: string) {
    setCollapsedBands((prev) => {
      const next = new Set(prev);
      const bandId = namespaceId(programId, "__program__");
      if (next.has(bandId)) next.delete(bandId);
      else next.add(bandId);
      return next;
    });
  }

  function isCollapsed(programId: string) {
    return collapsedBands.has(namespaceId(programId, "__program__"));
  }

  function openFromCanvas(m: Milestone) {
    // Canvas ids are namespaced by mergeProgramsForAllView; the editor
    // needs the owning Program to seed the "currently in" side of the move
    // picker, so decode it back here (a display-layer decode, which is all
    // this is — the real move generates fresh ids, see CONTEXT.md).
    const split = splitNamespacedId(m.id);
    const owner = programs.find((p) => p.id === split?.programId);
    if (!owner || !split) return;
    const local = owner.milestones.find((x) => x.id === split.localId);
    if (local) setEditing({ programId: owner.id, milestone: local });
  }

  function logMove(entry: MoveLogEntry) {
    setMoveLog((prev) => [entry, ...prev]);
  }

  return { programs, collapsedBands, toggleBand, isCollapsed, activeProgramId, setActiveProgramId, editing, setEditing, openFromCanvas, moveLog, logMove };
}

export type ProtoState = ReturnType<typeof useProtoState>;

/** The combined canvas: one shared axis, every Program as a depth-0 band, collapse applied per-band. Identical in all three variants by design. */
export function MergedCanvas({ state, width }: { state: ProtoState; width?: number }) {
  const theme = resolvePortfolioTheme(MOCK_PORTFOLIO.theme ?? defaultPortfolioTheme);
  const data = useMemo(() => {
    const merged = mergeProgramsForAllView(MOCK_PORTFOLIO.id, state.programs);
    const renderable = mergeForRender(MOCK_PORTFOLIO, merged);
    return {
      ...renderable,
      swimlaneGroups: (renderable.swimlaneGroups ?? []).map((g) => (state.collapsedBands.has(g.id) ? { ...g, collapsed: true } : g)),
    };
  }, [state.programs, state.collapsedBands]);

  return (
    <RoadmapTimeline
      data={data}
      today={PROTO_TODAY}
      theme={theme}
      width={width}
      onMilestoneClick={(m) => state.openFromCanvas(m)}
      onToggleGroupCollapsed={(groupId) => {
        const split = splitNamespacedId(groupId);
        if (split?.localId === "__program__") state.toggleBand(split.programId);
      }}
    />
  );
}

/** The #118/#124 move primitive's UI: Program picker + Swimlane picker scoped to it. Re-scoping on Program change is the one behaviour worth feeling in all three layouts. */
export function MoveTargetPicker({
  programs,
  currentProgramId,
  currentLaneId,
  onConfirm,
  compact,
}: {
  programs: Program[];
  currentProgramId: string;
  /** null for a whole-swimlane move — the destination lane picker is then meaningless and hidden. */
  currentLaneId: string | null;
  onConfirm: (toProgramId: string, toLaneId: string | null) => void;
  compact?: boolean;
}) {
  const [toProgramId, setToProgramId] = useState(currentProgramId);
  const destLanes = programs.find((p) => p.id === toProgramId)?.swimlanes.filter((l) => l.type === "lane") ?? [];
  const [toLaneId, setToLaneId] = useState<string | null>(currentLaneId);
  const dirty = toProgramId !== currentProgramId;
  const size = compact ? "px-1.5 py-1 text-xs" : "px-2 py-1 text-sm";

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">Program</span>
        <select
          className={`rounded border border-zinc-300 bg-transparent dark:border-zinc-600 ${size}`}
          value={toProgramId}
          onChange={(e) => {
            setToProgramId(e.target.value);
            // Re-scope: the old lane id belongs to the old Program's id
            // space and means nothing here. Default to the destination's
            // first lane rather than leaving it empty.
            const lanes = programs.find((p) => p.id === e.target.value)?.swimlanes.filter((l) => l.type === "lane") ?? [];
            setToLaneId(currentLaneId === null ? null : (lanes[0]?.id ?? null));
          }}
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.programName}
            </option>
          ))}
        </select>
      </label>
      {currentLaneId !== null && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Swimlane</span>
          <select
            className={`rounded border border-zinc-300 bg-transparent dark:border-zinc-600 ${size}`}
            value={toLaneId ?? ""}
            onChange={(e) => setToLaneId(e.target.value || null)}
          >
            {destLanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        disabled={!dirty}
        onClick={() => onConfirm(toProgramId, toLaneId)}
        className="rounded border border-amber-500 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 disabled:opacity-40 dark:bg-amber-950 dark:text-amber-200"
      >
        {dirty ? "Move…" : "Move"}
      </button>
    </div>
  );
}

/** What #124's planner reports back as dropped when an item crosses a Program boundary — shown so the confirm step isn't a silent one. */
export function droppedFor(program: Program, m: Milestone): string[] {
  const dropped: string[] = [];
  if (m.dependsOn.length > 0) dropped.push(`${m.dependsOn.length} dependency edge${m.dependsOn.length === 1 ? "" : "s"}`);
  const successors = program.milestones.filter((x) => x.dependsOn.some((d) => d.id === m.id)).length;
  if (successors > 0) dropped.push(`${successors} successor link${successors === 1 ? "" : "s"}`);
  if (m.linksToTopLevelMilestone) dropped.push("Program-band link");
  return dropped;
}

/** Stand-in for MilestoneEditorModal's field grid — enough density that a variant can't win by being emptier than the real editor. `moveSlot` is where the variant chose to put the cross-Program control. */
export function MockMilestoneEditorBody({ milestone, moveSlot, headerSlot }: { milestone: Milestone; moveSlot?: React.ReactNode; headerSlot?: React.ReactNode }) {
  return (
    <>
      {headerSlot}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Date" value={milestone.date} />
        <Field label="End date" value={milestone.endDate ?? ""} placeholder="blank = milestone" />
        <Field label="Status" value={milestone.status} />
        <Field label="% complete" value={String(milestone.percentComplete ?? 0)} />
        <Field label="Owner" value={milestone.owner ?? ""} />
        <Field label="Category" value="None" />
        <div className="col-span-2">
          <Field label="Short label" value={milestone.shortLabel ?? ""} placeholder="auto-derived if blank" />
        </div>
      </div>
      {moveSlot}
      <div className="mt-3 space-y-1 text-xs text-zinc-400">
        <p className="rounded border border-dashed border-zinc-300 px-2 py-1.5 dark:border-zinc-700">▸ Appearance — {milestone.styleOverride ? "1 override" : "default"}</p>
        <p className="rounded border border-dashed border-zinc-300 px-2 py-1.5 dark:border-zinc-700">▸ Relationships — {milestone.dependsOn.length > 0 ? `${milestone.dependsOn.length} linked` : "none"}</p>
        <p className="rounded border border-dashed border-zinc-300 px-2 py-1.5 dark:border-zinc-700">▸ Attachments — none</p>
      </div>
    </>
  );
}

function Field({ label, value, placeholder }: { label: string; value: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
      <input readOnly value={value} placeholder={placeholder} className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-600" />
    </label>
  );
}

/** Rule 5 — the full prototype state, re-rendered after every action, so "did that do what I meant" never needs a guess. */
export function ProtoStatePanel({ state }: { state: ProtoState }) {
  const collapsed = state.programs.filter((p) => state.isCollapsed(p.id)).map((p) => p.programName);
  return (
    <div className="border-t border-zinc-200 bg-zinc-50 px-3 pb-14 pt-2 font-mono text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
      <div>
        collapsed: [{collapsed.join(", ") || "—"}] · structure tab: {state.programs.find((p) => p.id === state.activeProgramId)?.programName} · editing:{" "}
        {state.editing ? state.editing.milestone.title : "—"}
      </div>
      {state.moveLog.length === 0 ? (
        <div className="opacity-60">moves: none yet</div>
      ) : (
        <ul>
          {state.moveLog.map((e, i) => (
            <li key={i}>
              move#{state.moveLog.length - i} {e.what} &quot;{e.label}&quot;: {e.fromProgram} → {e.toProgram}
              {e.toLane ? ` / ${e.toLane}` : ""} {e.dropped.length > 0 ? `· dropped: ${e.dropped.join(", ")}` : "· nothing dropped"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
