"use client";

// PROTOTYPE VARIANT B — popover quick-edit anchored to the clicked marker.
// Deliberately cramped: only date/status/percent are visible by default,
// everything else sits behind "More fields" — the question this variant is
// meant to surface is whether that cramping is acceptable for a v1.
import { useEffect, useRef, useState } from "react";
import type { Milestone } from "@/components/timeline/types";
import { milestoneToFields, STATUS_OPTIONS } from "./fields";

export const name = "Popover on the marker";

const POPOVER_W = 288;

// Keyed on milestone.id by the wrapper below so a fresh draft mounts per
// selection — avoids resetting local state from an effect.
function PopoverForm({
  milestone,
  anchor,
  onSave,
  onClose,
}: {
  milestone: Milestone;
  anchor: { clientX: number; clientY: number };
  onSave: (id: string, patch: Partial<Milestone>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => milestoneToFields(milestone));
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  const left = Math.min(Math.max(anchor.clientX - POPOVER_W / 2, 8), window.innerWidth - POPOVER_W - 8);
  const top = anchor.clientY + 16;

  return (
    <div
      ref={ref}
      className="fixed z-40 rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left, top, width: POPOVER_W }}
    >
      <p className="mb-2 truncate text-xs font-semibold" title={draft.title}>
        {draft.title}
      </p>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          type="date"
          className="rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-600"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
        <select
          className="rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-600"
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as Milestone["status"] })}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <label className="mb-2 flex items-center gap-2 text-xs">
        <span className="w-20 shrink-0 text-zinc-500">% complete</span>
        <input
          type="range"
          min={0}
          max={100}
          value={draft.percentComplete}
          onChange={(e) => setDraft({ ...draft, percentComplete: Number(e.target.value) })}
          className="flex-1"
        />
        <span className="w-8 text-right tabular-nums">{draft.percentComplete}%</span>
      </label>

      {!expanded ? (
        <button onClick={() => setExpanded(true)} className="mb-2 text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300">
          More fields (owner, comment, short label, critical path)…
        </button>
      ) : (
        <div className="mb-2 space-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <input
            className="w-full rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-600"
            placeholder="Owner"
            value={draft.owner}
            onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
          />
          <input
            className="w-full rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-600"
            placeholder="Short label"
            value={draft.shortLabel}
            onChange={(e) => setDraft({ ...draft, shortLabel: e.target.value })}
          />
          <textarea
            rows={2}
            className="w-full rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-600"
            placeholder="Comment"
            value={draft.comment}
            onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={draft.isCriticalPath} onChange={(e) => setDraft({ ...draft, isCriticalPath: e.target.checked })} />
            Critical path
          </label>
          <p className="text-[11px] text-zinc-400">Dependencies &amp; attachments: edit from the full view (not here) — deferred.</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600">
          Cancel
        </button>
        <button
          onClick={() => {
            onSave(milestone.id, draft);
            onClose();
          }}
          className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function VariantB({
  milestone,
  anchor,
  onSave,
  onClose,
}: {
  milestone: Milestone | null;
  anchor: { clientX: number; clientY: number } | null;
  onSave: (id: string, patch: Partial<Milestone>) => void;
  onClose: () => void;
}) {
  if (!milestone || !anchor) return null;
  return <PopoverForm key={milestone.id} milestone={milestone} anchor={anchor} onSave={onSave} onClose={onClose} />;
}
