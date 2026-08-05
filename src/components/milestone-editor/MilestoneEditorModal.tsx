"use client";

// Manual milestone editor — Jira-style centered modal, the winning shape
// from wayframe#17's UI exploration (full prototype preserved on
// prototype/milestone-editor-ui). Save behavior per wayframe#18: instant
// apply (no preview step) through useCorrectionBox's shared reducer, so
// undo covers this alongside AI corrections. dependsOn/attachments are
// read-only here — editing those is a separate, deferred follow-up.
import { useState } from "react";
import type { Milestone, RoadmapData, Status } from "@/components/timeline/types";
import { buildMilestoneEditOps, milestoneToEditableFields, type EditableMilestoneFields } from "@/lib/corrections/build-milestone-ops";
import type { PatchOp } from "@/lib/corrections/schema";

const STATUS_OPTIONS: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];

interface EdgeRef {
  id: string;
  title: string;
}

/**
 * Add/remove one direction of the dependency graph. Both directions use
 * this — a successor is just a predecessor edge read from the other end,
 * so the parent swaps which id it passes as dependent vs dependency.
 *
 * Edits apply immediately rather than on Save, matching wayframe#18: the
 * graph shape drives the cascade and the critical-path recompute, and
 * batching those into the Save button would mean the modal shows a stale
 * critical-path checkbox while you're still editing edges.
 */
function EdgeEditor({
  label,
  hint,
  edges,
  candidates,
  onAdd,
  onRemove,
}: {
  label: string;
  hint: string;
  edges: EdgeRef[];
  candidates: EdgeRef[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-zinc-500">
        {label} <span className="font-normal text-zinc-400">— {hint}</span>
      </p>
      {edges.length === 0 ? (
        <p className="mb-1.5 text-xs text-zinc-400">None</p>
      ) : (
        <ul className="mb-1.5 space-y-1">
          {edges.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              <button
                onClick={() => onRemove(e.id)}
                aria-label={`Remove ${e.title} from ${label.toLowerCase()}`}
                className="shrink-0 rounded border border-zinc-300 px-1.5 text-[11px] text-zinc-500 hover:text-zinc-800 dark:border-zinc-600 dark:hover:text-zinc-200"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <select
        value=""
        aria-label={`Add a ${label.toLowerCase().replace(/s$/, "")}`}
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
        }}
        disabled={candidates.length === 0}
        className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-600"
      >
        <option value="">{candidates.length === 0 ? "Nothing available" : `Add a ${label.toLowerCase().replace(/s$/, "")}…`}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </div>
  );
}

// Keyed on milestone.id by the wrapper below so a fresh draft mounts per
// selection, rather than resetting local state from an effect.
function ModalForm({
  data,
  milestone,
  onSave,
  onClose,
  onToggleDependency,
}: {
  data: RoadmapData;
  milestone: Milestone;
  onSave: (ops: PatchOp[]) => void;
  onClose: () => void;
  onToggleDependency: (dependentId: string, dependencyId: string, add: boolean) => void;
}) {
  const [draft, setDraft] = useState<EditableMilestoneFields>(() => milestoneToEditableFields(milestone));

  const byId = new Map(data.milestones.map((x) => [x.id, x]));
  const ref = (id: string): EdgeRef => ({ id, title: byId.get(id)?.title ?? id });
  const predecessors = milestone.dependsOn.map((d) => ref(d.id));
  const successors = data.milestones.filter((o) => o.dependsOn.some((d) => d.id === milestone.id)).map((o) => ref(o.id));
  const otherMilestones = data.milestones.filter((o) => o.id !== milestone.id).map((o) => ref(o.id));

  function handleSave() {
    const ops = buildMilestoneEditOps(milestone, draft);
    if (ops.length > 0) onSave(ops);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-700">
          <input
            className="w-full bg-transparent text-lg font-semibold outline-none"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <button onClick={onClose} className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Date</span>
            <input
              type="date"
              className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Status</span>
            <select
              className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as Milestone["status"] })}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">% complete</span>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
              value={draft.percentComplete}
              onChange={(e) => setDraft({ ...draft, percentComplete: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Owner</span>
            <input
              className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
              value={draft.owner}
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
            />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Short label (timeline marker)</span>
            <input
              className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
              value={draft.shortLabel}
              onChange={(e) => setDraft({ ...draft, shortLabel: e.target.value })}
              placeholder="auto-derived if blank"
            />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Comment</span>
            <textarea
              rows={3}
              className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
            />
          </label>
          <label className="col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={draft.isCriticalPath} onChange={(e) => setDraft({ ...draft, isCriticalPath: e.target.checked })} />
            <span className="text-xs font-medium text-zinc-500">On critical path (override)</span>
          </label>

          <div className="col-span-2 space-y-3 rounded border border-dashed border-zinc-200 p-3 dark:border-zinc-700">
            <EdgeEditor
              label="Predecessors"
              hint="Must finish before this milestone"
              edges={predecessors}
              candidates={otherMilestones.filter((o) => !predecessors.some((p) => p.id === o.id))}
              onAdd={(otherId) => onToggleDependency(milestone.id, otherId, true)}
              onRemove={(otherId) => onToggleDependency(milestone.id, otherId, false)}
            />
            <EdgeEditor
              label="Successors"
              hint="Wait on this milestone"
              edges={successors}
              candidates={otherMilestones.filter((o) => !successors.some((s) => s.id === o.id))}
              // A successor edge is the same edge read from the other end —
              // it lives on the *other* milestone's dependsOn, so the ids swap.
              onAdd={(otherId) => onToggleDependency(otherId, milestone.id, true)}
              onRemove={(otherId) => onToggleDependency(otherId, milestone.id, false)}
            />
            <p className="text-xs text-zinc-400">Attachments: {milestone.attachments?.length ?? 0} — read-only for now.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <button onClick={onClose} className="rounded border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600">
            Cancel
          </button>
          <button onClick={handleSave} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function MilestoneEditorModal({
  data,
  milestone,
  onSave,
  onClose,
  onToggleDependency,
}: {
  data: RoadmapData;
  milestone: Milestone | null;
  onSave: (ops: PatchOp[]) => void;
  onClose: () => void;
  onToggleDependency: (dependentId: string, dependencyId: string, add: boolean) => void;
}) {
  if (!milestone) return null;
  return <ModalForm key={milestone.id} data={data} milestone={milestone} onSave={onSave} onClose={onClose} onToggleDependency={onToggleDependency} />;
}
