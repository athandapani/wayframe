"use client";

// Cross-Program bulk edit toolbar (wayframe#t33, fork 3 of 3) — the
// All-Programs page's counterpart to SelectionToolbar.tsx, operating over a
// selection whose ids are ALL namespaced (`namespaceId`/`splitNamespacedId`,
// src/lib/portfolio/merge-programs.ts) because they came off the merged
// canvas (mergeProgramsForAllView -> mergeForRender) rather than one
// Program's own id space. Reuses the exact same field-dropdown/value-editor
// UI (`BulkPatchFieldPicker`, extracted from SelectionToolbar.tsx for this
// reuse) and the exact same DiffBanner preview/apply convention
// SelectionToolbar already established — the real differences:
//   - `laneId`/`laneRow` are excluded from the field dropdown entirely (see
//     `EXCLUDED_FIELDS` below) — both are Program-scoped concepts with no
//     coherent cross-Program meaning (this fork's own task doc): laneId's
//     option list is drawn from ONE Program's `data.swimlanes`, and moving
//     an item into a lane in a DIFFERENT Program isn't a real operation
//     (lane ids are Program-scoped, never global). Excluded unconditionally
//     regardless of whether the current selection happens to be single- or
//     multi-Program at a given moment — simpler than a rule that flips on
//     selection composition.
//   - every preview/apply step groups selected ids by their owning Program
//     (`splitNamespacedId`), builds each Program's own preview/patch against
//     ITS OWN real (non-merged) object (from `programs`, i.e.
//     `result.data.programs` on the page), and re-namespaces preview entries
//     so a combined multi-Program DiffBanner list can't collide on two
//     Programs' identical local ids — only de-namespaced again when
//     building the final per-Program apply request.
//   - apply POSTs one request to `.../programs/bulk-patch` (grouped by
//     programId, de-namespaced back to local ids) instead of dispatching a
//     local reducer action — there is no single client-side Program
//     document this selection could ever belong to.
//   - after a successful apply, the caller (`onApplied`) is responsible for
//     refetching the page's data (mirrors `handleMoveProgram`'s own
//     convention on this page and the reorder route's own reasoning for why
//     a client-side optimistic recompute would be the wrong tradeoff here)
//     — this component never tries to locally patch `programs` itself.
//
// Deliberately NO undo wiring for this surface — call this out explicitly
// since it's a real, deliberate scope cut, not an oversight: t38's live
// per-(user, Program) undo manager (src/lib/realtime/undo-manager.ts) only
// ever activates for an open `useProgramRoom` WebSocket connection (see the
// reorder route's own comment — realtime editing is scoped to one already-
// open Program), and the All-Programs page holds no live per-Program
// realtime connections at all. Building N of them just to get undo here
// would be a real scope expansion beyond this ticket — left for a future
// one.
import { useState } from "react";
import type { Milestone, Program, TopLevelItem } from "@/components/timeline/types";
import type { UseSelectionResult } from "@/components/timeline/use-selection";
import { namespaceId, splitNamespacedId } from "@/lib/portfolio/merge-programs";
import { bulkAcceptBaseline, buildAcceptBaselinePreview, buildBulkPatchPreview, type BulkPatchField, type BulkPatchOp } from "@/lib/bulk-edit/apply";
import type { AcceptBaselineOp } from "@/lib/corrections/schema";
import { DiffBanner, type DiffEntry } from "@/components/shared/DiffBanner";
import { BulkPatchFieldPicker } from "@/components/shared/BulkPatchFieldPicker";

const BUTTON_CLASS = "rounded-full border border-zinc-300 px-2.5 py-1 dark:border-zinc-600";

/** See this file's top doc — both fields are Program-scoped, no coherent cross-Program meaning. */
const EXCLUDED_FIELDS: readonly BulkPatchField[] = ["laneId", "laneRow"];

type PendingAction = { kind: "patch"; op: BulkPatchOp } | { kind: "delete" } | { kind: "acceptBaseline" };

type OpsForProgram = { bulkPatchOps: { op: BulkPatchOp; ids: string[] }[]; deleteIds: string[]; acceptBaselineOps: AcceptBaselineOp[] };

/** Groups namespaced ids by owning Program, dropping ids that don't parse or don't resolve to a Program present in `programsById`. */
function groupByProgram(ids: readonly string[], programsById: ReadonlyMap<string, Program>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const split = splitNamespacedId(id);
    if (!split || !programsById.has(split.programId)) continue;
    const list = groups.get(split.programId) ?? [];
    list.push(split.localId);
    groups.set(split.programId, list);
  }
  return groups;
}

export function CrossProgramSelectionToolbar({
  portfolioId,
  programs,
  selection,
  onApplied,
}: {
  portfolioId: string;
  /** Each Program's own REAL (non-merged, own-id-space) object — `result.data.programs` on the All-Programs page, never the merged/namespaced canvas data. */
  programs: readonly Program[];
  selection: UseSelectionResult;
  onApplied: () => Promise<void> | void;
}) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [acceptedOverride, setAcceptedOverride] = useState<Set<string> | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const selectedIds = [...selection.selectedIds];
  if (selectedIds.length === 0) return null;

  const programsById = new Map(programs.map((p) => [p.id, p]));
  const groups = groupByProgram(selectedIds, programsById);

  const selectedItems: (Milestone | TopLevelItem)[] = [];
  for (const [programId, localIds] of groups) {
    const program = programsById.get(programId)!;
    const milestoneById = new Map(program.milestones.map((m) => [m.id, m]));
    const topLevelById = new Map(program.topLevelItems.map((t) => [t.id, t]));
    for (const localId of localIds) {
      const item = milestoneById.get(localId) ?? topLevelById.get(localId);
      if (item) selectedItems.push(item);
    }
  }

  // Combined preview across every affected Program — each Program's own
  // preview is built against its own real object, then re-namespaced before
  // merging (see this file's top doc: two Programs could share a local
  // milestone id, so staying namespaced is what keeps the combined list's
  // entries unique).
  const entries: DiffEntry[] = (() => {
    if (!pendingAction) return [];
    const rows: DiffEntry[] = [];
    for (const [programId, localIds] of groups) {
      const program = programsById.get(programId)!;
      const localEntries =
        pendingAction.kind === "patch"
          ? buildBulkPatchPreview(program, [{ op: pendingAction.op, ids: localIds }], [])
          : pendingAction.kind === "delete"
            ? buildBulkPatchPreview(program, [], localIds)
            : buildAcceptBaselinePreview(program, localIds);
      for (const e of localEntries) rows.push({ ...e, id: namespaceId(programId, e.id) });
    }
    return rows;
  })();
  const accepted = acceptedOverride ?? new Set(entries.map((e) => e.id));

  function startAction(action: PendingAction) {
    setPendingAction(action);
    setAcceptedOverride(null);
    setApplyError(null);
  }

  function discardPreview() {
    setPendingAction(null);
    setAcceptedOverride(null);
    setApplyError(null);
  }

  function toggleAccept(id: string) {
    const next = new Set(accepted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAcceptedOverride(next);
  }

  async function apply() {
    if (!pendingAction || applying) return;
    const acceptedNamespacedIds = entries.filter((e) => accepted.has(e.id)).map((e) => e.id);
    if (acceptedNamespacedIds.length === 0) return;

    // De-namespace back to each Program's own local ids only here, at the
    // final apply-request-building step — the combined preview above stays
    // namespaced throughout (see this file's top doc).
    const acceptedGroups = groupByProgram(acceptedNamespacedIds, programsById);
    const opsByProgram: Record<string, OpsForProgram> = {};
    for (const [programId, localIds] of acceptedGroups) {
      const program = programsById.get(programId)!;
      opsByProgram[programId] =
        pendingAction.kind === "patch"
          ? { bulkPatchOps: [{ op: pendingAction.op, ids: localIds }], deleteIds: [], acceptBaselineOps: [] }
          : pendingAction.kind === "delete"
            ? { bulkPatchOps: [], deleteIds: localIds, acceptBaselineOps: [] }
            : { bulkPatchOps: [], deleteIds: [], acceptBaselineOps: bulkAcceptBaseline(program.milestones, localIds) };
    }

    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/programs/bulk-patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opsByProgram }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        setApplyError(errBody?.error ?? `Couldn't apply (${res.status}).`);
        return;
      }
      // Refetch-after-success, not a local optimistic recompute — mirrors
      // handleMoveProgram's own convention on this page (see this file's
      // top doc).
      await onApplied();
      discardPreview();
      selection.clear();
    } catch {
      setApplyError("Something went wrong applying this edit.");
    } finally {
      setApplying(false);
    }
  }

  const programCountLabel = `${groups.size} Program${groups.size === 1 ? "" : "s"}`;

  return (
    <div className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {pendingAction && (
        <DiffBanner
          title={
            pendingAction.kind === "delete"
              ? `Delete — ${selectedIds.length} selected across ${programCountLabel}`
              : pendingAction.kind === "acceptBaseline"
                ? `Accept baseline — ${selectedIds.length} selected across ${programCountLabel}`
                : `Bulk edit — ${selectedIds.length} selected across ${programCountLabel}`
          }
          entries={entries}
          accepted={accepted}
          onToggle={toggleAccept}
          onApply={apply}
          onDiscard={discardPreview}
          applyLabel={applying ? "Applying…" : pendingAction.kind === "delete" ? "Delete" : "Apply"}
        />
      )}
      {applyError && <p className="text-xs text-red-600">{applyError}</p>}
      {!pendingAction && (
        <div
          style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
          className="flex flex-wrap items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-2xl"
        >
          <span className="font-semibold">
            {selectedIds.length} selected across {programCountLabel}
          </span>

          <BulkPatchFieldPicker selectedItems={selectedItems} excludeFields={EXCLUDED_FIELDS} onCommit={(op) => startAction({ kind: "patch", op })} />

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
