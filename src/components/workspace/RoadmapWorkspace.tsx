"use client";

// The shared roadmap experience (wayframe#24) — RoadmapTimeline/ExecutiveView
// toggle, correction box, milestone/top-level editors, structured import —
// mounted by both the real `/` entry page (wayframe#25, a visitor's own
// extracted document) and the `/dev/demo-roadmap` QA route (the hardcoded
// demo fixture). Parameterized by `initialData`/`today` so neither caller
// hand-maintains its own copy.
import { useState } from "react";
import type { RoadmapData } from "@/components/timeline/types";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { ExecutiveView } from "@/components/executive-view/ExecutiveView";
import { useCorrectionBox } from "@/components/correction-box/use-correction-box";
import { CorrectionBoxSwitcher } from "@/components/correction-box/CorrectionBoxSwitcher";
import { MilestoneEditorModal } from "@/components/milestone-editor/MilestoneEditorModal";
import { TopLevelItemEditorModal, isEditableTopLevelItem } from "@/components/milestone-editor/TopLevelItemEditorModal";
import { ImportPanel } from "@/components/structured-import/ImportPanel";

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

export function RoadmapWorkspace({
  initialData,
  today,
  persist = true,
}: {
  initialData: RoadmapData;
  today: Date;
  persist?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("program");
  const box = useCorrectionBox(initialData, persist);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedTopLevelItemId, setSelectedTopLevelItemId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const selectedMilestone = box.data.milestones.find((m) => m.id === selectedMilestoneId) ?? null;
  const selectedTopLevelItemRaw = box.data.topLevelItems.find((t) => t.id === selectedTopLevelItemId) ?? null;
  const selectedTopLevelItem = selectedTopLevelItemRaw && isEditableTopLevelItem(selectedTopLevelItemRaw) ? selectedTopLevelItemRaw : null;

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
      <div className="min-w-0 flex-1 pb-40">
        <ModeToggle mode={mode} onChange={setMode} />
        <button
          onClick={() => setImportOpen(true)}
          className="fixed top-14 right-4 z-50 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs shadow dark:border-zinc-600 dark:bg-zinc-900"
        >
          Import a schedule
        </button>
        {mode === "program" ? (
          <div className="relative mx-auto max-w-[1600px] p-8 pt-16">
            <BlufCallout bluf={box.data.bluf} />
            <RoadmapTimeline
              data={box.data}
              today={today}
              width={1600}
              onMilestoneClick={(m) => setSelectedMilestoneId(m.id)}
              onTopLevelItemClick={(t) => setSelectedTopLevelItemId(t.id)}
            />
          </div>
        ) : (
          <div className="pt-16">
            <ExecutiveView data={box.data} today={today} />
          </div>
        )}
      </div>
      <CorrectionBoxSwitcher box={box} />
      <MilestoneEditorModal data={box.data} milestone={selectedMilestone} onSave={box.editMilestone} onClose={() => setSelectedMilestoneId(null)} />
      <TopLevelItemEditorModal item={selectedTopLevelItem} onSave={box.editTopLevelItem} onClose={() => setSelectedTopLevelItemId(null)} />
      {importOpen && <ImportPanel onExtracted={box.loadDocument} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
