"use client";

// PROTOTYPE VARIANT C — Jira-style centered modal. Heaviest/most disruptive
// of the three, but has room for every field including a real (if inert)
// dependencies/attachments section, without the side panel's "does it cover
// the marker it's editing" ambiguity or the popover's cramping.
import { useEffect, useState } from "react";
import type { Milestone, RoadmapData } from "@/components/timeline/types";
import { dependencyTitles, milestoneToFields, STATUS_OPTIONS } from "./fields";

export const name = "Modal dialog";

// Keyed on milestone.id by the wrapper below so a fresh draft mounts per
// selection — avoids resetting local state from an effect.
function ModalForm({
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          <button onClick={onClose} className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
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
            <span className="text-xs font-medium text-zinc-500">On critical path</span>
          </label>

          <div className="col-span-2 rounded border border-dashed border-zinc-200 p-3 dark:border-zinc-700">
            <p className="mb-1 text-xs font-semibold text-zinc-500">Dependencies</p>
            {dependencyTitles(data, milestone).length === 0 ? (
              <p className="text-xs text-zinc-400">None</p>
            ) : (
              <ul className="text-xs text-zinc-500">
                {dependencyTitles(data, milestone).map((t) => (
                  <li key={t}>→ {t}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-zinc-400">Attachments: {milestone.attachments?.length ?? 0}</p>
            <p className="mt-1 text-[11px] text-zinc-400">Read-only in v1 — editing these is a deferred follow-up, not this ticket.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
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
      </div>
    </div>
  );
}

export function VariantC({
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
  if (!milestone) return null;
  return <ModalForm key={milestone.id} data={data} milestone={milestone} onSave={onSave} onClose={onClose} />;
}
