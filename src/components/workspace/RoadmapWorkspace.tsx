"use client";

// The shared roadmap experience (wayframe#24) — RoadmapTimeline/ExecutiveView
// toggle, correction box, milestone/top-level editors, structured import —
// mounted by both the real `/` entry page (wayframe#25, a visitor's own
// extracted document) and the `/dev/demo-roadmap` QA route (the hardcoded
// demo fixture). Parameterized by `initialData`/`today` so neither caller
// hand-maintains its own copy.
import { useRef, useState } from "react";
import type { RoadmapData } from "@/components/timeline/types";
import { RoadmapTimeline, type GhostMode } from "@/components/timeline/RoadmapTimeline";
import type { Theme } from "@/components/timeline/theme";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { ExecutiveView } from "@/components/executive-view/ExecutiveView";
import { useCorrectionBox } from "@/components/correction-box/use-correction-box";
import { useGhostMode } from "@/components/timeline/use-ghost-mode";
import { useCriticalPathVisibility } from "@/components/timeline/use-critical-path-visibility";
import { useTheme } from "@/components/timeline/use-theme";
import { THEME_LIST } from "@/components/timeline/theme";
import { LaneColorPicker } from "./LaneColorPicker";
import { CorrectionBoxSwitcher, type CorrectionBoxMode } from "@/components/correction-box/CorrectionBoxSwitcher";
import { MilestoneEditorModal } from "@/components/milestone-editor/MilestoneEditorModal";
import { TopLevelItemEditorModal, isEditableTopLevelItem } from "@/components/milestone-editor/TopLevelItemEditorModal";
import { ImportPanel } from "@/components/structured-import/ImportPanel";
import { OptionsMenu, OptionsMenuRow } from "./OptionsMenu";
import { exportToDeck } from "@/lib/export/export-to-deck";

type Mode = "executive" | "program";

// Export always ships both views regardless of the toggle (wayframe#27/#28). The
// inactive one is only mounted, off-screen and aria-hidden, for the duration of
// an export — ExecutiveView repeats the BLUF statement as subtext (per #8), so
// keeping both permanently mounted would duplicate accessible page content.
const OFFSCREEN_CLASS = "pointer-events-none absolute top-0 -left-[99999px]";

function deckFileName(programName: string): string {
  const slug = programName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "roadmap"}-deck.pptx`;
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex overflow-hidden rounded-full border text-sm shadow" style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}>
      {(["executive", "program"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={mode === m ? { background: "var(--wf-accent)", color: "var(--wf-panel)" } : undefined}
          className={"px-4 py-1.5 capitalize " + (mode === m ? "font-semibold" : "opacity-60")}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function RoadmapView({
  mode,
  data,
  today,
  ghostMode,
  showCriticalPath,
  theme,
  blufOpen,
  onBlufOpenChange,
  onMilestoneClick,
  onTopLevelItemClick,
}: {
  mode: Mode;
  data: RoadmapData;
  today: Date;
  ghostMode: GhostMode;
  showCriticalPath: boolean;
  theme: Theme;
  blufOpen: boolean;
  onBlufOpenChange: (open: boolean) => void;
  onMilestoneClick?: (m: { id: string }) => void;
  onTopLevelItemClick?: (t: { id: string }) => void;
}) {
  if (mode === "program") {
    return (
      <div className="relative mx-auto max-w-[1600px] p-8 pt-16" style={{ background: theme.ground }}>
        <BlufCallout bluf={data.bluf} open={blufOpen} onOpenChange={onBlufOpenChange} theme={theme} />
        <RoadmapTimeline
          data={data}
          today={today}
          width={1600}
          ghostMode={ghostMode}
          showCriticalPath={showCriticalPath}
          theme={theme}
          onMilestoneClick={onMilestoneClick}
          onTopLevelItemClick={onTopLevelItemClick}
        />
      </div>
    );
  }
  return (
    <div className="pt-16" style={{ background: theme.ground, color: theme.ink }}>
      <ExecutiveView data={data} today={today} />
    </div>
  );
}

function pillToggle(active: boolean) {
  return "rounded-full border px-2.5 py-1 text-xs " + (active ? "" : "opacity-55");
}

/** Chrome surfaces read the theme through the CSS vars published on the workspace root. */
const PILL_STYLE: React.CSSProperties = { background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" };

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
  const box = useCorrectionBox(initialData, persist, today);
  const ghost = useGhostMode();
  const criticalPath = useCriticalPathVisibility();
  const { themeId, theme, setTheme } = useTheme();
  const [correctionMode, setCorrectionMode] = useState<CorrectionBoxMode>("bar");
  const [blufOpen, setBlufOpen] = useState(true);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedTopLevelItemId, setSelectedTopLevelItemId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const visibleCaptureRef = useRef<HTMLDivElement>(null);
  const offscreenCaptureRef = useRef<HTMLDivElement>(null);

  const selectedMilestone = box.data.milestones.find((m) => m.id === selectedMilestoneId) ?? null;
  const selectedTopLevelItemRaw = box.data.topLevelItems.find((t) => t.id === selectedTopLevelItemId) ?? null;
  const selectedTopLevelItem = selectedTopLevelItemRaw && isEditableTopLevelItem(selectedTopLevelItemRaw) ? selectedTopLevelItemRaw : null;

  const otherMode: Mode = mode === "program" ? "executive" : "program";

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      // Mount the inactive view off-screen, wait for it to paint, then capture both.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const visibleEl = visibleCaptureRef.current;
      const offscreenEl = offscreenCaptureRef.current;
      if (!visibleEl || !offscreenEl) return;
      const programEl = mode === "program" ? visibleEl : offscreenEl;
      const executiveEl = mode === "executive" ? visibleEl : offscreenEl;
      await exportToDeck(
        [
          { label: "Program", element: programEl },
          { label: "Executive", element: executiveEl },
        ],
        deckFileName(box.data.programName),
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen"
      // Chrome (mode toggle, options menu, correction bar) renders as
      // siblings rather than children of the chart, so the theme is
      // published here as CSS custom properties instead of being
      // prop-drilled into every one of them.
      style={
        {
          background: theme.pageBg,
          "--wf-panel": theme.panelBg,
          "--wf-border": theme.panelBorder,
          "--wf-ink": theme.panelInk,
          "--wf-accent": theme.accent,
        } as React.CSSProperties
      }
    >
      <div className="min-w-0 flex-1 pb-40">
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2">
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <div className="fixed top-4 right-4 z-50">
          <OptionsMenu>
            <OptionsMenuRow label="Export">
              <button onClick={handleExport} disabled={exporting} style={PILL_STYLE} className={pillToggle(true) + " disabled:opacity-50"}>
                {exporting ? "Exporting…" : "Export to Deck"}
              </button>
            </OptionsMenuRow>
            <div className="border-b pb-3" style={{ borderColor: "var(--wf-border)" }}>
              <p className="mb-1.5 opacity-70">Theme</p>
              <div className="grid grid-cols-3 gap-1.5">
                {THEME_LIST.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    aria-pressed={themeId === t.id}
                    title={t.tagline}
                    style={{
                      // Selection has to come from the theme's own accent —
                      // an OS-dark-mode class here rendered the *inactive*
                      // themes as the highlighted ones on a dark panel.
                      borderColor: themeId === t.id ? "var(--wf-accent)" : "var(--wf-border)",
                      borderWidth: themeId === t.id ? 2 : 1,
                    }}
                    className="rounded-lg border p-1.5 text-left text-[11px]"
                  >
                    {/* a real swatch of the theme, not just its name */}
                    <span className="mb-1 flex h-6 overflow-hidden rounded" style={{ background: t.ground }}>
                      {t.laneTint.slice(0, 3).map((c) => (
                        <span key={c} className="flex-1" style={{ background: c }} />
                      ))}
                      <span className="flex-1" style={{ background: t.statusColor.delayed }} />
                    </span>
                    <span className={themeId === t.id ? "font-semibold" : ""}>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-b pb-3" style={{ borderColor: "var(--wf-border)" }}>
              <p className="mb-1.5 opacity-70">Lane colours</p>
              <LaneColorPicker swimlanes={box.data.swimlanes} theme={theme} onChange={box.setLaneColor} />
            </div>
            <OptionsMenuRow label="Ghosts">
              <button
                onClick={() => ghost.setEnabled(!ghost.enabled)}
                aria-pressed={ghost.enabled}
                aria-label={`Ghosts: ${ghost.enabled ? "On" : "Off"}`}
                style={PILL_STYLE} className={pillToggle(ghost.enabled)}
              >
                {ghost.enabled ? "On" : "Off"}
              </button>
            </OptionsMenuRow>
            {ghost.enabled && (
              <OptionsMenuRow label="Ghost style">
                <div className="flex overflow-hidden rounded-full border text-xs" style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}>
                  {(["badge", "outline"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => ghost.setStyle(s)}
                      style={ghost.style === s ? { background: "var(--wf-accent)", color: "var(--wf-panel)" } : undefined}
                      className={
                        "px-2.5 py-1 capitalize " + (ghost.style === s ? "font-semibold" : "opacity-60")
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </OptionsMenuRow>
            )}
            <OptionsMenuRow label="Critical path">
              <button
                onClick={() => criticalPath.setVisible(!criticalPath.visible)}
                aria-pressed={criticalPath.visible}
                aria-label={`Critical path: ${criticalPath.visible ? "Shown" : "Hidden"}`}
                style={PILL_STYLE} className={pillToggle(criticalPath.visible)}
              >
                {criticalPath.visible ? "Shown" : "Hidden"}
              </button>
            </OptionsMenuRow>
            <OptionsMenuRow label="Correction UI">
              <button onClick={() => setCorrectionMode((m) => (m === "bar" ? "sidebar" : "bar"))} style={PILL_STYLE} className={pillToggle(true)}>
                {correctionMode === "bar" ? "Sidebar mode" : "Bar mode"}
              </button>
            </OptionsMenuRow>
            <OptionsMenuRow label="So what">
              <button
                onClick={() => setBlufOpen((v) => !v)}
                aria-pressed={blufOpen}
                aria-label={`So what: ${blufOpen ? "Shown" : "Hidden"}`}
                style={PILL_STYLE} className={pillToggle(blufOpen)}
              >
                {blufOpen ? "Shown" : "Hidden"}
              </button>
            </OptionsMenuRow>
            <OptionsMenuRow label="Import">
              <button onClick={() => setImportOpen(true)} style={PILL_STYLE} className={pillToggle(true)}>
                Import a schedule
              </button>
            </OptionsMenuRow>
          </OptionsMenu>
        </div>
        <div ref={visibleCaptureRef}>
          <RoadmapView
            mode={mode}
            data={box.data}
            today={today}
            ghostMode={ghost.mode}
            showCriticalPath={criticalPath.visible}
            theme={theme}
            blufOpen={blufOpen}
            onBlufOpenChange={setBlufOpen}
            onMilestoneClick={(m) => setSelectedMilestoneId(m.id)}
            onTopLevelItemClick={(t) => setSelectedTopLevelItemId(t.id)}
          />
        </div>
        {exporting && (
          <div ref={offscreenCaptureRef} className={OFFSCREEN_CLASS} aria-hidden="true" inert>
            <RoadmapView mode={otherMode} data={box.data} today={today} ghostMode={ghost.mode} showCriticalPath={criticalPath.visible} theme={theme} blufOpen={blufOpen} onBlufOpenChange={setBlufOpen} />
          </div>
        )}
      </div>
      <CorrectionBoxSwitcher box={box} mode={correctionMode} />
      <MilestoneEditorModal data={box.data} milestone={selectedMilestone} onSave={box.editMilestone} onClose={() => setSelectedMilestoneId(null)} />
      <TopLevelItemEditorModal item={selectedTopLevelItem} onSave={box.editTopLevelItem} onClose={() => setSelectedTopLevelItemId(null)} />
      {importOpen && <ImportPanel onExtracted={box.loadDocument} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
