"use client";

// Lighter editor for the top PROGRAM band's phase/milestone/annotation items
// (wayframe#19 — the "/phase" half of the ticket; annotation added in
// wayframe#59, closing the one PROGRAM-band kind that had no manual editor
// at all). No owner/comment/percent/critical-path/short-label (those don't
// exist on TopLevelItem) and no dependencies section (TopLevelItem has no
// dependsOn) — just the fields each variant actually has. Same shell as
// MilestoneEditorInspector for a consistent editing surface, and the same
// instant-save behavior (#18).
//
// That shared shell is why this followed the milestone editor into the
// right-hand dock in wayframe#126 rather than staying a modal: the two were
// deliberately built to the same shape, so leaving one docked and the other
// centered over the canvas would have reintroduced, between two kinds of
// item on the SAME surface, exactly the inconsistency #126 docked the
// milestone editor on both surfaces to avoid. It carries no `locationSlot`:
// a TopLevelItem belongs to its Program's own band, and #124's move
// primitive covers milestones and swimlanes only.
import { useState } from "react";
import type { RenderableProgram, Status, StyleOverride, TopLevelItem } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import type { TopLevelItemPatch } from "@/components/correction-box/use-correction-box";
import { AppearanceBody, Section, TOP_LEVEL_MILESTONE_CAPABILITIES, TOP_LEVEL_PHASE_CAPABILITIES, overrideCount } from "./AppearanceEditor";
import { EDITOR_DOCK_CLASS } from "./editor-dock";

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
  /** Forward-looking slip-risk projection (wayframe#61/#72) — milestone/phase only, blank on annotation. */
  potentialDate: string;
}

function toDraft(t: EditableTopLevelItem): Draft {
  if (t.type === "phase")
    return { title: t.title, status: t.status, date: "", startDate: t.startDate, endDate: t.endDate, showReferenceLine: false, message: "", potentialDate: t.potentialDate ?? "" };
  if (t.type === "annotation") return { title: t.title, status: "not-started", date: t.date, startDate: "", endDate: "", showReferenceLine: false, message: t.message, potentialDate: "" };
  return { title: t.title, status: t.status, date: t.date, startDate: "", endDate: "", showReferenceLine: t.showReferenceLine ?? false, message: "", potentialDate: t.potentialDate ?? "" };
}

function toPatch(t: EditableTopLevelItem, draft: Draft): TopLevelItemPatch {
  if (t.type === "phase") return { title: draft.title, status: draft.status, startDate: draft.startDate, endDate: draft.endDate, potentialDate: draft.potentialDate || undefined };
  if (t.type === "annotation") return { title: draft.title, date: draft.date, message: draft.message };
  return { title: draft.title, status: draft.status, date: draft.date, showReferenceLine: draft.showReferenceLine, potentialDate: draft.potentialDate || undefined };
}

function InspectorForm({
  item,
  data,
  theme,
  legendCategoryFillEnabled,
  onSave,
  onClose,
  onDelete,
  onSetStyleOverride,
  onClearStyleOverride,
}: {
  item: EditableTopLevelItem;
  data: RenderableProgram;
  theme: Theme;
  legendCategoryFillEnabled: boolean;
  onSave: (id: string, patch: TopLevelItemPatch) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSetStyleOverride: (id: string, patch: Partial<StyleOverride>) => void;
  onClearStyleOverride: (id: string, field: keyof StyleOverride) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const appearanceOverrides = overrideCount(item.type === "annotation" ? undefined : item.styleOverride);

  function handleSave() {
    onSave(item.id, toPatch(item, draft));
    onClose();
  }

  return (
    <aside aria-label="Program-band item editor" className={EDITOR_DOCK_CLASS}>
      <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-700">
        <input
          aria-label="Title"
          className="w-full min-w-0 bg-transparent text-base font-semibold outline-none"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <button onClick={onClose} className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
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
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Potential end date <span className="font-normal text-zinc-400">— at risk of slipping to</span>
                </span>
                <input
                  type="date"
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.potentialDate}
                  onChange={(e) => setDraft({ ...draft, potentialDate: e.target.value })}
                  placeholder="blank = no projected risk"
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
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Potential date <span className="font-normal text-zinc-400">— at risk of slipping to</span>
                </span>
                <input
                  type="date"
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.potentialDate}
                  onChange={(e) => setDraft({ ...draft, potentialDate: e.target.value })}
                  placeholder="blank = no projected risk"
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

        {/* Appearance (wayframe UX-2026-09-18 §2) — annotation has no
            styleOverride field at all (see TopLevelItem's own union in
            types.ts), so it gets no Appearance section, same as it gets no
            Status field above. */}
        {item.type !== "annotation" && (
          <Section title="Appearance" badgeText={appearanceOverrides > 0 ? `${appearanceOverrides} override${appearanceOverrides === 1 ? "" : "s"}` : "default"} badgeActive={appearanceOverrides > 0}>
            <AppearanceBody
              item={item}
              data={data}
              theme={theme}
              legendCategoryFillEnabled={legendCategoryFillEnabled}
              capabilities={item.type === "phase" ? TOP_LEVEL_PHASE_CAPABILITIES : TOP_LEVEL_MILESTONE_CAPABILITIES}
              onSetStyleOverride={onSetStyleOverride}
              onClearStyleOverride={onClearStyleOverride}
            />
          </Section>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 p-3 dark:border-zinc-700">
        {/* No confirm dialog — same instant, undoable delete as
            MilestoneEditorInspector (wayframe#38 item 3 / #58): a mistake is
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
    </aside>
  );
}

export function TopLevelItemEditorInspector({
  item,
  data,
  theme,
  legendCategoryFillEnabled,
  onSave,
  onClose,
  onDelete,
  onSetStyleOverride,
  onClearStyleOverride,
}: {
  item: EditableTopLevelItem | null;
  data: RenderableProgram;
  theme: Theme;
  legendCategoryFillEnabled: boolean;
  onSave: (id: string, patch: TopLevelItemPatch) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSetStyleOverride: (id: string, patch: Partial<StyleOverride>) => void;
  onClearStyleOverride: (id: string, field: keyof StyleOverride) => void;
}) {
  if (!item) return null;
  return (
    <InspectorForm
      key={item.id}
      item={item}
      data={data}
      theme={theme}
      legendCategoryFillEnabled={legendCategoryFillEnabled}
      onSave={onSave}
      onClose={onClose}
      onDelete={onDelete}
      onSetStyleOverride={onSetStyleOverride}
      onClearStyleOverride={onClearStyleOverride}
    />
  );
}
