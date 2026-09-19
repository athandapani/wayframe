"use client";

// Fast-path category rename/recolor, anchored right on the Legend's own
// swatch (wayframe UX-2026-09-18 §9) — the user's own ask was "I need to be
// able to edit [category colors] without having to open the options...
// right near the legend itself." `CategoryManager.tsx` (Options → Layout →
// Categories) stays the bulk-management surface (rename/recolor/delete,
// every category at once); this is the one-category, one-click-away
// alternative, not a replacement for it.
//
// Commits once, on outside-click/Escape/"Save" — never per keystroke or
// per color-drag frame like `CategoryManager`'s own inputs do (each one
// dispatches a full reducer action — a full document-snapshot push onto
// undo history, per use-correction-box.ts's own "every mutating case
// already grows history" convention — on every `input` event; a
// live-dragged color picker would make that far more visible here than it
// already is there). Local draft state during editing, one real edit on
// close, so Undo reverses the whole popover session in one step — with an
// explicit "Cancel" as the one path that discards the draft instead.
import { useCallback, useEffect, useRef, useState } from "react";
import type { LegendCategory } from "./types";

export interface CategoryPopoverProps {
  category: LegendCategory;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onClose: () => void;
}

export function CategoryPopover({ category, onRename, onRecolor, onClose }: CategoryPopoverProps) {
  const [draftName, setDraftName] = useState(category.name);
  const [draftColor, setDraftColor] = useState(category.color);
  const rootRef = useRef<HTMLDivElement>(null);

  const commitAndClose = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== category.name) onRename(category.id, trimmed);
    if (draftColor !== category.color) onRecolor(category.id, draftColor);
    onClose();
  }, [draftName, draftColor, category, onRename, onRecolor, onClose]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) commitAndClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") commitAndClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [commitAndClose]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`Edit ${category.name}`}
      onClick={(e) => e.stopPropagation()}
      style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
      className="absolute top-full left-0 z-50 mt-1.5 w-56 space-y-2 rounded-lg border p-2.5 text-xs shadow-xl"
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Colour for ${category.name}`}
          value={draftColor}
          onChange={(e) => setDraftColor(e.target.value)}
          style={{ borderColor: "var(--wf-border)" }}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border bg-transparent p-0"
        />
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitAndClose();
          }}
          aria-label={`Name of ${category.name}`}
          autoFocus
          style={{ borderColor: "var(--wf-border)" }}
          className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="text-[11px] opacity-60 hover:opacity-100">
          Cancel
        </button>
        <button
          type="button"
          onClick={commitAndClose}
          style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
        >
          Save
        </button>
      </div>
    </div>
  );
}
