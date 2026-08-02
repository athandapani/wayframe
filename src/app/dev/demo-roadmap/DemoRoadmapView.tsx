"use client";

import { useState } from "react";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { ExecutiveView } from "@/components/executive-view/ExecutiveView";
import { demoRoadmap, demoToday } from "@/data/demo-roadmap";

type Mode = "executive" | "program";

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 overflow-hidden rounded-full border border-zinc-300 bg-white text-sm shadow dark:border-zinc-600 dark:bg-zinc-900">
      {(["executive", "program"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={
            "px-4 py-1.5 capitalize " +
            (mode === m ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-300")
          }
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function DemoRoadmapView() {
  const [mode, setMode] = useState<Mode>("program");

  return (
    <div className="min-h-screen bg-zinc-50 pb-8 dark:bg-black">
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === "program" ? (
        <div className="relative mx-auto max-w-[1600px] p-8 pt-16">
          <BlufCallout bluf={demoRoadmap.bluf} />
          <RoadmapTimeline data={demoRoadmap} today={demoToday} width={1600} />
        </div>
      ) : (
        <div className="pt-16">
          <ExecutiveView data={demoRoadmap} today={demoToday} />
        </div>
      )}
    </div>
  );
}
