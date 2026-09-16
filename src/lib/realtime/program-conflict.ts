import type { Program } from "@/components/timeline/types";

/**
 * Program-level "I edited this offline, someone else deleted it" conflict
 * detection (wayframe t38) — generalizes t13's `ScenarioConflict` idiom
 * (src/lib/scenario/resolve.ts's `orphaned` variant: an override whose
 * target no longer exists in the Program) from a Scenario-override target to
 * any offline-edited Baseline milestone/topLevelItem.
 *
 * Distinct from src/lib/invariants/referential-scan.ts, which detects
 * dangling *references* (e.g. a dependsOn edge pointing at a deleted
 * milestone) inside an already-merged document — a different problem from
 * this file's "the item I was editing is itself gone" detection. Not touched
 * or reused here.
 */
export type ProgramConflict = {
  type: "orphaned";
  itemKind: "milestone" | "topLevelItem";
  targetId: string;
  message: string;
};

/**
 * Pure function, no side effects, no doc/awareness knowledge — the caller
 * (fork 2's room-connection hook) is responsible for tracking which ids were
 * locally edited while offline and calling this once reconnected/resynced,
 * passing the just-merged `mergedProgram`.
 *
 * For each entry in `pendingEdits`, checks whether `mergedProgram`'s
 * `milestones`/`topLevelItems` (selected by `kind`) still contains that id.
 * An id no longer present emits an `orphaned` conflict with human-readable
 * wording specific to `itemKind`; an id still present is silently skipped
 * (returns `[]` for that entry). Multiple pending edits are handled
 * independently — one missing id never short-circuits checking the rest.
 */
export function detectOrphanedEdits(
  pendingEdits: { id: string; kind: "milestone" | "topLevelItem" }[],
  mergedProgram: Program,
): ProgramConflict[] {
  const milestoneIds = new Set(mergedProgram.milestones.map((m) => m.id));
  const topLevelItemIds = new Set(mergedProgram.topLevelItems.map((t) => t.id));

  const conflicts: ProgramConflict[] = [];
  for (const edit of pendingEdits) {
    const stillExists = edit.kind === "milestone" ? milestoneIds.has(edit.id) : topLevelItemIds.has(edit.id);
    if (stillExists) continue;
    conflicts.push({
      type: "orphaned",
      itemKind: edit.kind,
      targetId: edit.id,
      message:
        edit.kind === "milestone"
          ? "This milestone was deleted by another collaborator while you were offline."
          : "This item was deleted by another collaborator while you were offline.",
    });
  }
  return conflicts;
}
