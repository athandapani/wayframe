"use client";

// PROTOTYPE (wayframe#17) — throwaway state for the "direct field edit"
// question. Deliberately has no cascade/undo (that's wayframe#18's separate
// question) — this only answers "what should the editing surface look
// like", so a save just writes the field straight onto local state.

import { useCallback, useState } from "react";
import type { Milestone, RoadmapData, TopLevelItem } from "@/components/timeline/types";

export type Selected =
  | { kind: "milestone"; id: string; clientX: number; clientY: number }
  | { kind: "topLevel"; id: string; clientX: number; clientY: number };

export interface MilestoneEditorResult {
  data: RoadmapData;
  selected: Selected | null;
  selectMilestone: (m: Milestone, evt: React.MouseEvent) => void;
  selectTopLevel: (t: TopLevelItem, evt: React.MouseEvent) => void;
  close: () => void;
  saveMilestone: (id: string, patch: Partial<Milestone>) => void;
  saveTopLevel: (id: string, patch: Partial<Extract<TopLevelItem, { type: "phase" | "milestone" }>>) => void;
}

export function useMilestoneEditor(initialData: RoadmapData): MilestoneEditorResult {
  const [data, setData] = useState(initialData);
  const [selected, setSelected] = useState<Selected | null>(null);

  const selectMilestone = useCallback((m: Milestone, evt: React.MouseEvent) => {
    setSelected({ kind: "milestone", id: m.id, clientX: evt.clientX, clientY: evt.clientY });
  }, []);

  const selectTopLevel = useCallback((t: TopLevelItem, evt: React.MouseEvent) => {
    setSelected({ kind: "topLevel", id: t.id, clientX: evt.clientX, clientY: evt.clientY });
  }, []);

  const close = useCallback(() => setSelected(null), []);

  const saveMilestone = useCallback((id: string, patch: Partial<Milestone>) => {
    setData((d) => ({ ...d, milestones: d.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  }, []);

  const saveTopLevel = useCallback((id: string, patch: Partial<Extract<TopLevelItem, { type: "phase" | "milestone" }>>) => {
    setData((d) => ({
      ...d,
      topLevelItems: d.topLevelItems.map((t) => (t.id === id ? ({ ...t, ...patch } as TopLevelItem) : t)),
    }));
  }, []);

  return { data, selected, selectMilestone, selectTopLevel, close, saveMilestone, saveTopLevel };
}
