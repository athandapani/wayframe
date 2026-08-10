"use client";

// PROTOTYPE — shared plumbing across all three variants (not the thing
// under comparison: the question is how the ambiguous moment *looks*, not
// the state machine driving it). Wraps the validated resolve.mts reducer
// from prototype/correction-box-scope-widening against a real RoadmapData
// copy so applying an edit visibly updates the real chart underneath.
import { useReducer } from "react";
import type { RoadmapData } from "@/components/timeline/types";
import { reduce, type PrototypeState } from "@/lib/corrections/prototype-scope-widening/resolve.mts";
import { toMilestoneRefs, toLanes, applyEdit } from "./adapter";

export function useCorrectionPrototype(initialData: RoadmapData) {
  const [data, setData] = useReducer((_: RoadmapData, next: RoadmapData) => next, initialData);
  const [state, dispatch] = useReducer(reduce, {
    milestones: toMilestoneRefs(initialData),
    lanes: toLanes(initialData),
    mode: "refuse-ambiguous",
    pending: null,
    log: [],
  } satisfies PrototypeState);

  return {
    data,
    pending: state.pending,
    log: state.log,
    submit: (text: string) => dispatch({ type: "submit", text }),
    apply: () => {
      if (!state.pending) return;
      let next = data;
      for (const edit of state.pending.edits) next = applyEdit(next, edit);
      setData(next);
      dispatch({ type: "applyPending" });
    },
    discard: () => dispatch({ type: "discardPending" }),
    resolveAmbiguous: (targetId: string) => dispatch({ type: "resolveAmbiguous", targetId }),
  };
}
