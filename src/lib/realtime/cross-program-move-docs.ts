import type * as Y from "yjs";
import type { Program } from "@/components/timeline/types";
import type { MilestoneMovePlan, SwimlaneMovePlan } from "@/lib/corrections/cross-program-move";
import { applyProgramPatch } from "./program-ydoc";

/**
 * Doc-level form of the cross-Program move primitive (wayframe#124) —
 * applies an already-computed plan (see
 * src/lib/corrections/cross-program-move.ts) directly to two `Y.Doc`s.
 *
 * NOT a production path. Production mutations always go through a Program's
 * own `useCorrectionBox` (see
 * src/components/correction-box/cross-program-move.ts), because
 * `useProgramRoom`'s local->remote sync effect diffs `box.data` against its
 * own last-seen snapshot and would fight a direct doc write it never
 * observed. This function exists purely so the primitive's insert-before-
 * remove ordering can be exercised against real `Y.Doc`s/simulated rooms in
 * tests (src/lib/realtime/multi-client-harness.ts) without React.
 *
 * Applies the destination write before the source write, matching the box
 * orchestrator's own ordering exactly — see that module's doc comment for
 * what this guarantees and doesn't.
 */
export function applyCrossProgramMoveToDocs(
  sourceDoc: Y.Doc,
  destDoc: Y.Doc,
  sourceBefore: Program,
  destBefore: Program,
  plan: MilestoneMovePlan | SwimlaneMovePlan,
  origin?: unknown,
): void {
  applyProgramPatch(destDoc, destBefore, plan.destNext, origin);
  applyProgramPatch(sourceDoc, sourceBefore, plan.sourceNext, origin);
}
