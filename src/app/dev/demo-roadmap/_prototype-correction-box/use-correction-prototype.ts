"use client";

// PROTOTYPE — throwaway. Adapts the validated correction-patch contract
// (src/lib/corrections/prototype-patch-logic.ts, wayframe#9) to drive the
// real RoadmapTimeline against the real demo dataset, so the three UI
// variants are judged against real data/density rather than a vacuum.
import { useMemo, useState, useCallback } from "react";
import { demoRoadmap, demoToday } from "@/data/demo-roadmap";
import type { RoadmapData } from "@/components/timeline/types";
import {
  initState,
  reduce,
  type CorrectionState,
  type WorkingDocument,
} from "@/lib/corrections/prototype-patch-logic";

function toWorkingDocument(data: RoadmapData): WorkingDocument {
  return {
    lanes: data.swimlanes.filter((l) => l.type === "lane").map((l) => ({ id: l.id, name: l.name })),
    milestones: data.milestones as unknown as WorkingDocument["milestones"],
  };
}

export function useCorrectionPrototype() {
  const [patchState, setPatchState] = useState<CorrectionState>(() =>
    initState(toWorkingDocument(demoRoadmap)),
  );

  const submit = useCallback((text: string) => {
    if (!text.trim()) return;
    setPatchState((s) => reduce(s, { type: "submit", text }));
  }, []);
  const submitForSelection = useCallback((text: string, selectedIds: string[]) => {
    if (!text.trim()) return;
    setPatchState((s) => reduce(s, { type: "submitForSelection", text, selectedIds }));
  }, []);
  const apply = useCallback(() => setPatchState((s) => reduce(s, { type: "apply" })), []);
  const discard = useCallback(() => setPatchState((s) => reduce(s, { type: "discard" })), []);
  const undo = useCallback(() => setPatchState((s) => reduce(s, { type: "undo" })), []);

  const roadmap: RoadmapData = useMemo(
    () => ({ ...demoRoadmap, milestones: patchState.document.milestones as unknown as RoadmapData["milestones"] }),
    [patchState.document],
  );

  return { roadmap, today: demoToday, patchState, submit, submitForSelection, apply, discard, undo };
}
