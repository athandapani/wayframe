"use client";

// Lighter editor for the top PROGRAM band's phase/milestone items
// (wayframe#19 — the "/phase" half of the ticket). No owner/comment/percent/
// critical-path/short-label (those don't exist on TopLevelItem) and no
// dependencies section (TopLevelItem has no dependsOn) — just the fields
// each variant actually has. Same modal shell as MilestoneEditorModal for a
// consistent editing surface, and the same instant-save behavior (#18).
import { useState } from "react";
import type { Status, TopLevelItem } from "@/components/timeline/types";
import type { TopLevelItemPatch } from "@/components/correction-box/use-correction-box";

const STATUS_OPTIONS: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];

export type EditableTopLevelItem = Extract<TopLevelItem, { type: "phase" }> | Extract<TopLevelItem, { type: "milestone" }>;

export function isEditableTopLevelItem(t: TopLevelItem): t is EditableTopLevelItem {
  return t.type === "phase" || t.type === "milestone";
}

interface Draft {
  title: string;
  status: Status;
  date: string;
  startDate: string;
  endDate: string;
  showReferenceLine: boolean;
}

function toDraft(t: EditableTopLevelItem): Draft {
  if (t.type === "phase") return { title: t.title, status: t.status, date: "", startDate: t.startDate, endDate: t.endDate, showReferenceLine: false };
  return { title: t.title, status: t.status, date: t.date, startDate: "", endDate: "", showReferenceLine: t.showReferenceLine ?? false };
}

function toPatch(t: EditableTopLevelItem, draft: Draft): TopLevelItemPatch {
  if (t.type === "phase") return { title: draft.title, status: draft.status, startDate: draft.startDate, endDate: draft.endDate };
  return { title: draft.title, status: draft.status, date: draft.date, showReferenceLine: draft.showReferenceLine };
}

function ModalForm({ item, onSave, onClose }: { item: EditableTopLevelItem; onSave: (id: string, patch: TopLevelItemPatch) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));

  function handleSave() {
    onSave(item.id, toPatch(item, draft));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
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
          {item.type === "phase" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Start date</span>
                <input
                  type="date"
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.startDate}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">End date</span>
                <input
                  type="date"
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.endDate}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                />
              </label>
            </>
          ) : (
            <>
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Date</span>
                <input
                  type="date"
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <label className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.showReferenceLine}
                  onChange={(e) => setDraft({ ...draft, showReferenceLine: e.target.checked })}
                />
                <span className="text-xs font-medium text-zinc-500">Show reference line on the chart</span>
              </label>
            </>
          )}
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Status</span>
            <select
              className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
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

export function TopLevelItemEditorModal({
  item,
  onSave,
  onClose,
}: {
  item: EditableTopLevelItem | null;
  onSave: (id: string, patch: TopLevelItemPatch) => void;
  onClose: () => void;
}) {
  if (!item) return null;
  return <ModalForm key={item.id} item={item} onSave={onSave} onClose={onClose} />;
}
