"use client";

// Add / rename / recolor / delete legend categories (later extended by
// the category-fill encoding) — mirrors SwimlaneManager.tsx's
// list/inline-confirm-delete shape exactly, same
// reasoning: a modal rather than an options-menu row, room to show what a
// delete will do (clear the tag off every milestone carrying it, not
// delete those milestones).
import { useState } from "react";
import type { RoadmapData } from "@/components/timeline/types";

export interface CategoryManagerProps {
  data: RoadmapData;
  onAdd: (name: string, color: string) => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

const NEW_CATEGORY_DEFAULT_COLOR = "#2563eb";

export function CategoryManager({ data, onAdd, onRename, onRecolor, onRemove, onClose }: CategoryManagerProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const categories = data.legendCategories ?? [];

  const taggedCount = (categoryId: string) => data.milestones.filter((m) => m.categoryId === categoryId).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)", borderWidth: 1 }}
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Legend categories"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--wf-border)" }}>
          <div>
            <h1 className="text-base font-semibold">Legend categories</h1>
            <p className="text-xs opacity-60">Named, colored tags a milestone can carry independent of its lane and status.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100">
            ✕
          </button>
        </div>

        {categories.length === 0 ? (
          <p className="p-5 text-xs opacity-60">No categories yet — add one below, then assign it from a milestone&apos;s editor.</p>
        ) : (
          <ul className="divide-y p-2" style={{ borderColor: "var(--wf-border)" }}>
            {categories.map((c) => {
              const count = taggedCount(c.id);
              const confirming = confirmingId === c.id;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-2 py-2">
                  <input
                    type="color"
                    aria-label={`Colour for ${c.name}`}
                    value={c.color}
                    onChange={(e) => onRecolor(c.id, e.target.value)}
                    style={{ borderColor: "var(--wf-border)" }}
                    className="h-6 w-7 shrink-0 cursor-pointer rounded border bg-transparent p-0"
                  />
                  <input
                    value={c.name}
                    onChange={(e) => onRename(c.id, e.target.value)}
                    aria-label={`Name of ${c.name}`}
                    style={{ borderColor: "var(--wf-border)" }}
                    className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-sm"
                  />
                  <span className="w-24 shrink-0 text-right text-[11px] opacity-55">
                    {count} milestone{count === 1 ? "" : "s"}
                  </span>
                  {confirming ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => {
                          onRemove(c.id);
                          setConfirmingId(null);
                        }}
                        className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white"
                      >
                        Delete
                      </button>
                      <button onClick={() => setConfirmingId(null)} className="text-[11px] opacity-60 hover:opacity-100">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(c.id)}
                      aria-label={`Delete ${c.name}`}
                      style={{ borderColor: "var(--wf-border)" }}
                      className="shrink-0 rounded border px-2 py-1 text-[11px] opacity-70 hover:opacity-100"
                    >
                      Delete
                    </button>
                  )}
                  {confirming && count > 0 && (
                    <p className="w-full text-[11px] text-red-500">
                      This clears the tag off {count} milestone{count === 1 ? "" : "s"} — it doesn&apos;t delete them. Undo reverses it.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-2 border-t p-4" style={{ borderColor: "var(--wf-border)" }}>
          <button
            onClick={() => onAdd("New category", NEW_CATEGORY_DEFAULT_COLOR)}
            style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
            className="rounded-full px-3 py-1.5 text-xs font-medium"
          >
            Add a category
          </button>
          <span className="ml-auto text-[11px] opacity-55">Every change here is undoable. Colour marker fill via Options → Chart symbols.</span>
        </div>
      </div>
    </div>
  );
}
