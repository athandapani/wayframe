"use client";

// Thin wrapper around the shared RoadmapWorkspace (wayframe#24), seeded with
// the hardcoded demo fixture and never persisting to localStorage — the QA
// route must always show the same fixed snapshot, not a real visitor's saved
// document, once both routes share the same underlying component.
import { RoadmapWorkspace } from "@/components/workspace/RoadmapWorkspace";
import { demoRoadmap, demoToday } from "@/data/demo-roadmap";

export function DemoRoadmapView() {
  return <RoadmapWorkspace initialData={demoRoadmap} today={demoToday} persist={false} />;
}
