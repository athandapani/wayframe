"use client";

// PROTOTYPE VARIANT A — slide-in side panel, docked to the same right-hand
// slot CorrectionSidebar occupies. Full field set with labels, since a panel
// has room. dependsOn/attachments shown read-only (deferred to a later v).
import { useState } from "react";
import type { Milestone, RoadmapData } from "@/components/timeline/types";
import { dependencyTitles, milestoneToFields, STATUS_OPTIONS } from "./fields";

export const name = "Slide-in side panel";

// Keyed on milestone.id by the wrapper below so a fresh draft mounts per
// selection — avoids resetting local state from an effect.
function PanelForm({
  data,
  milestone,
  onSave,
  onClose,
}: {
  data: RoadmapData;
  milestone: Milestone;
  onSave: (id: string, patch: Partial<Milestone>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => milestoneToFields(milestone));

  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold">Edit milestone</h2>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          Close
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Title</span>
          <input
            className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Short label (timeline marker)</span>
          <input
            className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
            value={draft.shortLabel}
            onChange={(e) => setDraft({ ...draft, shortLabel: e.target.value })}
            placeholder="auto-derived if blank"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Comment</span>
          <textarea
            rows={3}
            className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
            value={draft.comment}
            onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
          />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.isCriticalPath} onChange={(e) => setDraft({ ...draft, isCriticalPath: e.target.checked })} />
          <span className="text-xs font-medium text-zinc-500">On critical path</span>
        </label>

        <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="mb-1 text-xs font-medium text-zinc-400">Depends on (read-only — deferred)</p>
          {dependencyTitles(data, milestone).length === 0 ? (
            <p className="text-xs text-zinc-400">None</p>
          ) : (
            <ul className="text-xs text-zinc-500">
              {dependencyTitles(data, milestone).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-zinc-400">Attachments ({milestone.attachments?.length ?? 0}) — deferred</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-700">
        <button onClick={onClose} className="rounded border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600">
          Cancel
        </button>
        <button
          onClick={() => {
            onSave(milestone.id, draft);
            onClose();
          }}
          className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white"
        >
          Save
        </button>
      </div>
    </>
  );
}

export function VariantA({
  data,
  milestone,
  onSave,
  onClose,
}: {
  data: RoadmapData;
  milestone: Milestone | null;
  onSave: (id: string, patch: Partial<Milestone>) => void;
  onClose: () => void;
}) {
  const open = milestone !== null;

  return (
    <aside
      className={
        "fixed top-0 right-0 z-40 flex h-full w-96 shrink-0 flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform duration-200 dark:border-zinc-700 dark:bg-zinc-900 " +
        (open ? "translate-x-0" : "translate-x-full")
      }
    >
      {milestone && <PanelForm key={milestone.id} data={data} milestone={milestone} onSave={onSave} onClose={onClose} />}
    </aside>
  );
}
