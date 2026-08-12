"use client";

// Lighter editor for the top PROGRAM band's phase/milestone/annotation items
// (wayframe#19 — the "/phase" half of the ticket; annotation added in
// wayframe#59, closing the one PROGRAM-band kind that had no manual editor
// at all). No owner/comment/percent/critical-path/short-label (those don't
// exist on TopLevelItem) and no dependencies section (TopLevelItem has no
// dependsOn) — just the fields each variant actually has. Same modal shell
// as MilestoneEditorModal for a consistent editing surface, and the same
// instant-save behavior (#18).
import { useState } from "react";
import type { Status, TopLevelItem } from "@/components/timeline/types";
import type { TopLevelItemPatch } from "@/components/correction-box/use-correction-box";

const STATUS_OPTIONS: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];

export type EditableTopLevelItem = TopLevelItem;

// Every TopLevelItem kind is editable through this modal now (wayframe#59
// closed the annotation gap) — kept as a real predicate, not a bare `true`,
// so a future fourth kind fails loudly here instead of silently rendering.
export function isEditableTopLevelItem(t: TopLevelItem): t is EditableTopLevelItem {
  return t.type === "milestone" || t.type === "phase" || t.type === "annotation";
}

interface Draft {
  title: string;
  status: Status;
  date: string;
  startDate: string;
  endDate: string;
  showReferenceLine: boolean;
  message: string;
}

function toDraft(t: EditableTopLevelItem): Draft {
  if (t.type === "phase") return { title: t.title, status: t.status, date: "", startDate: t.startDate, endDate: t.endDate, showReferenceLine: false, message: "" };
  if (t.type === "annotation") return { title: t.title, status: "not-started", date: t.date, startDate: "", endDate: "", showReferenceLine: false, message: t.message };
  return { title: t.title, status: t.status, date: t.date, startDate: "", endDate: "", showReferenceLine: t.showReferenceLine ?? false, message: "" };
}

function toPatch(t: EditableTopLevelItem, draft: Draft): TopLevelItemPatch {
  if (t.type === "phase") return { title: draft.title, status: draft.status, startDate: draft.startDate, endDate: draft.endDate };
  if (t.type === "annotation") return { title: draft.title, date: draft.date, message: draft.message };
  return { title: draft.title, status: draft.status, date: draft.date, showReferenceLine: draft.showReferenceLine };
}

function ModalForm({
  item,
  onSave,
  onClose,
  onDelete,
}: {
  item: EditableTopLevelItem;
  onSave: (id: string, patch: TopLevelItemPatch) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
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
          {item.type === "phase" && (
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
          )}
          {item.type === "milestone" && (
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
          {item.type === "annotation" && (
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
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Message</span>
                <textarea
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  rows={3}
                  value={draft.message}
                  onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                />
              </label>
            </>
          )}
          {/* No status field for annotation — it has no status in the schema, unlike milestone/phase. */}
          {item.type !== "annotation" && (
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
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 p-4 dark:border-zinc-700">
          {/* No confirm dialog — same instant, undoable delete as
              MilestoneEditorModal (wayframe#38 item 3 / #58): a mistake is
              one Undo away from fixed, so a confirm step is just friction. */}
          <button
            onClick={() => {
              onDelete(item.id);
              onClose();
            }}
            className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600">
              Cancel
            </button>
            <button onClick={handleSave} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TopLevelItemEditorModal({
  item,
  onSave,
  onClose,
  onDelete,
}: {
  item: EditableTopLevelItem | null;
  onSave: (id: string, patch: TopLevelItemPatch) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  if (!item) return null;
  return <ModalForm key={item.id} item={item} onSave={onSave} onClose={onClose} onDelete={onDelete} />;
}
