"use client";

// Floating toolbar for the rubber-band/checkbox multi-select system
// (mass-edit) — shown whenever a selection is non-empty. Self-contained
// like CorrectionBoxSwitcher: owns which bulk action is being configured
// and the diff-preview accept/reject state, exposes only the resolved
// commit outward via onBulkEdit.
//
// wayframe#t33 redesign: the old one-button-per-op row (Shift dates…/Set
// status…/Move to lane…) is replaced by a single "Set property…" dropdown
// over fork 1's generic `BulkPatchField` list, showing a field-appropriate
// value editor once a field is chosen, then the SAME DiffBanner
// accept/reject/apply flow this toolbar already had. Delete is new (there
// was none before); Accept baseline is unchanged in behavior, now just also
// flowing through the same DiffBanner plumbing for consistency.
//
// t33 fork 3: the field-dropdown + value-editor UI itself (what was this
// file's own private `FieldValueEditor` + "available fields" filter) now
// lives in `@/components/shared/BulkPatchFieldPicker` — extracted so the
// cross-Program bulk-edit toolbar (the All-Programs page) can reuse it
// instead of a third hand-written copy. This file's own single-Program
// behavior is unchanged: same fields offered, same value editors, same
// commit conventions — only the "where is this JSX defined" moved.
import { useState } from "react";
import type { Milestone, Program, TopLevelItem } from "@/components/timeline/types";
import type { UseSelectionResult } from "@/components/timeline/use-selection";
import type { AcceptBaselineOp } from "@/lib/corrections/schema";
import { bulkAcceptBaseline, buildAcceptBaselinePreview, buildBulkPatchPreview, type BulkPatchOp } from "@/lib/bulk-edit/apply";
import { DiffBanner, type DiffEntry } from "@/components/shared/DiffBanner";
import { BulkPatchFieldPicker } from "@/components/shared/BulkPatchFieldPicker";

const BUTTON_CLASS = "rounded-full border border-zinc-300 px-2.5 py-1 dark:border-zinc-600";

type PendingAction = { kind: "patch"; op: BulkPatchOp } | { kind: "delete" } | { kind: "acceptBaseline" };

export function SelectionToolbar({
  data,
  selection,
  onBulkEdit,
}: {
  data: Program;
  selection: UseSelectionResult;
  onBulkEdit: (bulkPatchOps: { op: BulkPatchOp; ids: string[] }[], deleteIds: string[], acceptBaselineOps: AcceptBaselineOp[]) => void;
}) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [acceptedOverride, setAcceptedOverride] = useState<Set<string> | null>(null);

  const selectedIds = [...selection.selectedIds];
  if (selectedIds.length === 0) return null;

  const milestoneById = new Map(data.milestones.map((m) => [m.id, m]));
  const topLevelById = new Map(data.topLevelItems.map((t) => [t.id, t]));
  const selectedItems: (Milestone | TopLevelItem)[] = selectedIds.map((id) => milestoneById.get(id) ?? topLevelById.get(id)).filter((item): item is Milestone | TopLevelItem => item !== undefined);

  const entries: DiffEntry[] =
    pendingAction?.kind === "patch"
      ? buildBulkPatchPreview(data, [{ op: pendingAction.op, ids: selectedIds }], [])
      : pendingAction?.kind === "delete"
        ? buildBulkPatchPreview(data, [], selectedIds)
        : pendingAction?.kind === "acceptBaseline"
          ? buildAcceptBaselinePreview(data, selectedIds)
          : [];
  const accepted = acceptedOverride ?? new Set(entries.map((e) => e.id));

  function commitField(op: BulkPatchOp) {
    setPendingAction({ kind: "patch", op });
    setAcceptedOverride(null);
  }

  function startAction(action: PendingAction) {
    setPendingAction(action);
    setAcceptedOverride(null);
  }

  function discardPreview() {
    setPendingAction(null);
    setAcceptedOverride(null);
  }

  function toggleAccept(id: string) {
    const next = new Set(accepted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAcceptedOverride(next);
  }

  function apply() {
    if (!pendingAction) return;
    const ids = entries.filter((e) => accepted.has(e.id)).map((e) => e.id);
    if (ids.length === 0) return;
    if (pendingAction.kind === "patch") onBulkEdit([{ op: pendingAction.op, ids }], [], []);
    else if (pendingAction.kind === "delete") onBulkEdit([], ids, []);
    else onBulkEdit([], [], bulkAcceptBaseline(data.milestones, ids));
    discardPreview();
    selection.clear();
  }

  return (
    // marginLeft: same --wf-dock-w shift CorrectionBox.tsx uses (see its
    // DOCK_SHIFT doc) — keeps this centered on the chart rather than the
    // window whenever an editor is docked to the right (wayframe#126).
    <div style={{ marginLeft: "calc(var(--wf-dock-w, 0px) / -2)" }} className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {pendingAction && (
        <DiffBanner
          title={
            pendingAction.kind === "delete"
              ? `Delete — ${selectedIds.length} selected`
              : pendingAction.kind === "acceptBaseline"
                ? `Accept baseline — ${selectedIds.length} selected`
                : `Bulk edit — ${selectedIds.length} selected`
          }
          entries={entries}
          accepted={accepted}
          onToggle={toggleAccept}
          onApply={apply}
          onDiscard={discardPreview}
          applyLabel={pendingAction.kind === "delete" ? "Delete" : "Apply"}
        />
      )}
      {!pendingAction && (
        <div
          style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
          className="flex flex-wrap items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-2xl"
        >
          <span className="font-semibold">{selectedIds.length} selected</span>

          <BulkPatchFieldPicker
            selectedItems={selectedItems}
            getLaneOptions={() => ({
              lanes: data.swimlanes.filter((l) => l.type === "lane").map((l) => ({ id: l.id, name: l.name })),
              maxLaneRow: Math.max(1, ...data.milestones.filter((m) => m.endDate).map((m) => m.laneRow ?? 1)),
            })}
            onCommit={commitField}
          />

          <button onClick={() => startAction({ kind: "acceptBaseline" })} className={BUTTON_CLASS}>
            Accept baseline
          </button>
          <button onClick={() => startAction({ kind: "delete" })} className={BUTTON_CLASS + " text-red-600 dark:text-red-400"}>
            Delete
          </button>
          <button onClick={selection.clear} className={BUTTON_CLASS}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
