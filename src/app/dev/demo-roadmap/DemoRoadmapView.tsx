"use client";

import { useState } from "react";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { ExecutiveView } from "@/components/executive-view/ExecutiveView";
import { useCorrectionBox } from "@/components/correction-box/use-correction-box";
import { CorrectionBoxSwitcher } from "@/components/correction-box/CorrectionBoxSwitcher";
import { demoRoadmap, demoToday } from "@/data/demo-roadmap";
// PROTOTYPE (wayframe#17) — click-to-edit surface exploration. Operates on
// its own copy of the demo data, independent of the correction box's copy
// below (unifying the two is wayframe#18's separate, not-yet-resolved
// question) — that's why RoadmapTimeline renders from `editor.data`, not
// `box.data`, while the prototype is mounted.
import { useMilestoneEditor } from "./_prototype-milestone-editor/use-milestone-editor";
import { MilestoneEditorPrototype } from "./_prototype-milestone-editor";

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
  const box = useCorrectionBox(demoRoadmap);
  const editor = useMilestoneEditor(demoRoadmap);

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
      <div className="min-w-0 flex-1 pb-40">
        <ModeToggle mode={mode} onChange={setMode} />
        {mode === "program" ? (
          <div className="relative mx-auto max-w-[1600px] p-8 pt-16">
            <BlufCallout bluf={editor.data.bluf} />
            <RoadmapTimeline
              data={editor.data}
              today={demoToday}
              width={1600}
              onMilestoneClick={editor.selectMilestone}
            />
          </div>
        ) : (
          <div className="pt-16">
            <ExecutiveView data={box.data} today={demoToday} />
          </div>
        )}
      </div>
      <CorrectionBoxSwitcher box={box} />
      <MilestoneEditorPrototype editor={editor} />
    </div>
  );
}
