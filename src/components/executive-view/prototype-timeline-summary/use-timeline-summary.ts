// PROTOTYPE (wayframe#37) — throwaway. Lifts the mocked-summary state up to
// RoadmapWorkspace so the trigger button can live in the shared OptionsMenu
// chrome (visible from Program view too), not just inside ExecutiveView.
"use client";

import { useState } from "react";
import type { RoadmapData } from "@/components/timeline/types";
import { generateExecutiveSummary, type ExecutiveTimelineSummary } from "./generate-summary";

export function useTimelineSummary(data: RoadmapData, today: Date) {
  const [summary, setSummary] = useState<ExecutiveTimelineSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function update() {
    setLoading(true);
    try {
      setSummary(await generateExecutiveSummary(data, today));
    } finally {
      setLoading(false);
    }
  }

  return { summary, loading, update };
}
