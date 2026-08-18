"use client";

// Floating toolbar for the rubber-band/checkbox multi-select system
// (mass-edit) — shown whenever a selection is non-empty. Self-contained
// like CorrectionBoxSwitcher: owns which bulk
// action is being configured and the diff-preview accept/reject state,
// exposes only the resolved commit outward via onBulkEdit.
import { useState } from "react";
import type { RoadmapData, Status } from "@/components/timeline/types";
import type { UseSelectionResult } from "@/components/timeline/use-selection";
import type { AcceptBaselineOp, PatchOp } from "@/lib/corrections/schema";
import { buildBulkEditPreview, bulkAcceptBaseline, bulkSetLane, bulkSetStatus, bulkShiftDates, type BulkEditOp } from "@/lib/bulk-edit/apply";
import { DiffBanner } from "@/components/shared/DiffBanner";
import { ShiftDatePopover } from "./ShiftDatePopover";

const STATUS_OPTIONS: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];

type Picker = "shift" | "status" | "lane" | null;

export function SelectionToolbar({ data, selection, onBulkEdit }: { data: RoadmapData; selection: UseSelectionResult; onBulkEdit: (patchOps: PatchOp[], laneReassignments: { id: string; laneId: string }[], acceptBaselineOps: AcceptBaselineOp[]) => void }) {
  const [picker, setPicker] = useState<Picker>(null);
  const [pendingOp, setPendingOp] = useState<BulkEditOp | null>(null);
  const [acceptedOverride, setAcceptedOverride] = useState<Set<string> | null>(null);

  const selectedIds = [...selection.selectedIds];
  if (selectedIds.length === 0) return null;

  const entries = pendingOp ? buildBulkEditPreview(data.milestones, data.swimlanes, selectedIds, pendingOp) : [];
  const accepted = acceptedOverride ?? new Set(entries.map((e) => e.id));

  function startOp(op: BulkEditOp) {
    setPendingOp(op);
    setAcceptedOverride(null);
    setPicker(null);
  }

  function discardPreview() {
    setPendingOp(null);
    setAcceptedOverride(null);
  }

  function toggleAccept(id: string) {
    const next = new Set(accepted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAcceptedOverride(next);
  }

  function apply() {
    if (!pendingOp) return;
    const ids = entries.filter((e) => accepted.has(e.id)).map((e) => e.id);
    if (ids.length === 0) return;
    const patchOps = pendingOp.kind === "shift" ? bulkShiftDates(data.milestones, ids, pendingOp.deltaDays) : pendingOp.kind === "status" ? bulkSetStatus(ids, pendingOp.status) : [];
    const laneReassignments = pendingOp.kind === "lane" ? bulkSetLane(ids, pendingOp.laneId) : [];
    const acceptBaselineOps = pendingOp.kind === "acceptBaseline" ? bulkAcceptBaseline(data.milestones, ids) : [];
    onBulkEdit(patchOps, laneReassignments, acceptBaselineOps);
    discardPreview();
    selection.clear();
  }

  const lanes = data.swimlanes.filter((l) => l.type === "lane");

  return (
    <div className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {pendingOp && (
        <DiffBanner
          title={`Bulk edit — ${selectedIds.length} selected`}
          entries={entries}
          accepted={accepted}
          onToggle={toggleAccept}
          onApply={apply}
          onDiscard={discardPreview}
        />
      )}
      {!pendingOp && (
        <div
          style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
          className="flex flex-wrap items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-2xl"
        >
          <span className="font-semibold">{selectedIds.length} selected</span>
          {picker === "shift" ? (
            <ShiftDatePopover onPreview={(deltaDays) => startOp({ kind: "shift", deltaDays })} onCancel={() => setPicker(null)} />
          ) : (
            <button onClick={() => setPicker("shift")} className="rounded-full border border-zinc-300 px-2.5 py-1 dark:border-zinc-600">
              Shift dates…
            </button>
          )}
          {picker === "status" ? (
            <select
              autoFocus
              onChange={(e) => startOp({ kind: "status", status: e.target.value as Status })}
              onBlur={() => setPicker(null)}
              aria-label="Set status to"
              defaultValue=""
              className="rounded-full border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
            >
              <option value="" disabled>
                Set status…
              </option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <button onClick={() => setPicker("status")} className="rounded-full border border-zinc-300 px-2.5 py-1 dark:border-zinc-600">
              Set status…
            </button>
          )}
          {picker === "lane" ? (
            <select
              autoFocus
              onChange={(e) => startOp({ kind: "lane", laneId: e.target.value })}
              onBlur={() => setPicker(null)}
              aria-label="Move to lane"
              defaultValue=""
              className="rounded-full border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
            >
              <option value="" disabled>
                Move to lane…
              </option>
              {lanes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          ) : (
            <button onClick={() => setPicker("lane")} className="rounded-full border border-zinc-300 px-2.5 py-1 dark:border-zinc-600">
              Move to lane…
            </button>
          )}
          <button onClick={() => startOp({ kind: "acceptBaseline" })} className="rounded-full border border-zinc-300 px-2.5 py-1 dark:border-zinc-600">
            Accept baseline
          </button>
          <button onClick={selection.clear} className="rounded-full border border-zinc-300 px-2.5 py-1 dark:border-zinc-600">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
