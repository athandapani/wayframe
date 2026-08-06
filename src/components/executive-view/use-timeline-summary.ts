// Executive-view timeline summary state (wayframe#37). Lives in
// RoadmapWorkspace so the "Update Executive view" trigger can sit in the
// shared OptionsMenu chrome — reachable from Program view too, not just
// while looking at Executive view — and the generated summary survives a
// mode switch.
"use client";

import { useState } from "react";
import type { RoadmapData } from "@/components/timeline/types";
import { generateExecutiveSummary, type ExecutiveTimelineSummary } from "./timeline-summary";

export function useTimelineSummary(data: RoadmapData) {
  const [summary, setSummary] = useState<ExecutiveTimelineSummary | null>(null);

  function update() {
    setSummary(generateExecutiveSummary(data));
  }

  return { summary, update };
}
