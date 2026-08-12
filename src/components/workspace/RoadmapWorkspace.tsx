"use client";

// The shared roadmap experience (wayframe#24) — RoadmapTimeline/ExecutiveView
// toggle, correction box, milestone/top-level editors, structured import —
// mounted by both the real `/` entry page (wayframe#25, a visitor's own
// extracted document) and the `/dev/demo-roadmap` QA route (the hardcoded
// demo fixture). Parameterized by `initialData`/`today` so neither caller
// hand-maintains its own copy.
import { useEffect, useRef, useState } from "react";
import type { RoadmapData } from "@/components/timeline/types";
import { RoadmapTimeline, type GhostMode } from "@/components/timeline/RoadmapTimeline";
import type { Theme } from "@/components/timeline/theme";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { ChartLegend } from "@/components/timeline/ChartLegend";
import { WayframeLogo } from "@/components/brand/WayframeLogo";
import { HelpPanel } from "./HelpPanel";
import { ExecutiveView } from "@/components/executive-view/ExecutiveView";
import { useCorrectionBox } from "@/components/correction-box/use-correction-box";
import { useGhostMode } from "@/components/timeline/use-ghost-mode";
import { useFontScale, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP } from "@/components/timeline/use-font-scale";
import { useFontFamily, FONT_FAMILY_CHOICES } from "@/components/timeline/use-font-family";
import { useCriticalPathVisibility } from "@/components/timeline/use-critical-path-visibility";
import { useLastUpdatedVisibility } from "@/components/timeline/use-last-updated-visibility";
import { useCriticalPathStyle, CRITICAL_PATH_STYLES, type CriticalPathStyle } from "@/components/timeline/use-critical-path-style";
import { useTopBandStyle, TOP_BAND_STYLES, type TopBandStyle } from "@/components/timeline/use-top-band-style";
import { useSoWhatStyle } from "@/components/timeline/use-so-what-style";
import { usePeriodGridlines, PERIOD_GRIDLINE_STYLES, type PeriodGridlineStyle } from "@/components/timeline/use-period-gridlines";
import { useLabelDensity, LABEL_DENSITIES } from "@/components/timeline/use-label-density";
import type { LabelDensity } from "@/components/timeline/title-layout";
import { useTheme } from "@/components/timeline/use-theme";
import { THEME_LIST } from "@/components/timeline/theme";
import { laneColors } from "@/components/timeline/lane-colors";
import { SwimlaneManager } from "./SwimlaneManager";
import { CorrectionBoxSwitcher, type CorrectionBoxMode } from "@/components/correction-box/CorrectionBoxSwitcher";
import { MilestoneEditorModal } from "@/components/milestone-editor/MilestoneEditorModal";
import { TopLevelItemEditorModal, isEditableTopLevelItem } from "@/components/milestone-editor/TopLevelItemEditorModal";
import { ImportPanel } from "@/components/structured-import/ImportPanel";
import { OptionsMenu, OptionsMenuRow } from "./OptionsMenu";
import { exportToDeck } from "@/lib/export/export-to-deck";
import { saveDocumentFile, parseDocumentFile } from "@/lib/document-file/document-file";
import { traceFrom, type TraceDirection } from "@/lib/critical-path/trace";
import { useTimelineSummary } from "@/components/executive-view/use-timeline-summary";
import type { ExecutiveTimelineSummary } from "@/components/executive-view/timeline-summary";

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
  criticalPathStyle,
  theme,
  blufOpen,
  onBlufOpenChange,
  onBlufEdit,
  soWhatFillColor,
  soWhatFillTransparency,
  onMilestoneClick,
  onTopLevelItemClick,
  onAddMilestone,
  onPickShape,
  placementMode,
  onAddTopLevelItem,
  topBandStyle,
  periodGridlineStyle,
  onMilestoneDateChange,
  tracedIds,
  chartWidth,
  labelDensity,
  legend,
  timelineSummary,
  fontScale,
  fontFamily,
}: {
  mode: Mode;
  data: RoadmapData;
  today: Date;
  ghostMode: GhostMode;
  showCriticalPath: boolean;
  criticalPathStyle: CriticalPathStyle;
  theme: Theme;
  blufOpen: boolean;
  onBlufOpenChange: (open: boolean) => void;
  /** Omit for the off-screen export capture — that copy has no document to write back into. */
  onBlufEdit?: (patch: Partial<RoadmapData["bluf"]>) => void;
  soWhatFillColor?: string | null;
  soWhatFillTransparency?: number;
  onMilestoneClick?: (m: { id: string }) => void;
  onTopLevelItemClick?: (t: { id: string }) => void;
  onAddMilestone?: (laneId: string, date: string, endDate?: string) => void;
  onPickShape?: (laneId: string, shape: "milestone" | "phase") => void;
  placementMode?: { laneId: string; shape: "milestone" | "phase" } | null;
  onAddTopLevelItem?: (kind: "milestone" | "phase") => void;
  topBandStyle?: TopBandStyle;
  periodGridlineStyle?: PeriodGridlineStyle;
  onMilestoneDateChange?: (id: string, date: string) => void;
  tracedIds?: Set<string>;
  /** Pinned width for the off-screen export capture; omitted on screen so the chart fits its container. */
  chartWidth?: number;
  labelDensity: LabelDensity;
  /** Rendered under the chart; omitted for the off-screen export capture keeps the slide clean. */
  legend?: React.ReactNode;
  /** Executive-view summary (wayframe#37) — undefined until "Generate" is clicked in the options menu. */
  timelineSummary?: ExecutiveTimelineSummary | null;
  /**
   * Font-scale system (wayframe#42/#50, revised) — drives text size and the
   * collision/width-estimate math (metricsScale mirrors it 1:1) so labels
   * never overlap at any size, but deliberately leaves `boxScale` at its
   * default: row/pill/axis/top-band heights stay fixed. #42's Variant B
   * (box heights scaling too) shipped first per that ticket's verdict, but
   * proved wrong against the real roadmap — text-only scaling with
   * collision-safe metrics (Variant C) is what's wanted.
   */
  fontScale?: number;
  fontFamily?: string;
}) {
  if (mode === "program") {
    return (
      <div className="relative mx-auto max-w-[1600px] p-8 pt-16" style={{ background: theme.ground }}>
        <RoadmapTimeline
          data={data}
          today={today}
          width={chartWidth}
          ghostMode={ghostMode}
          showCriticalPath={showCriticalPath}
          criticalPathStyle={criticalPathStyle}
          theme={theme}
          onMilestoneClick={onMilestoneClick}
          onTopLevelItemClick={onTopLevelItemClick}
          onAddMilestone={onAddMilestone}
          onPickShape={onPickShape}
          placementMode={placementMode}
          onAddTopLevelItem={onAddTopLevelItem}
          topBandStyle={topBandStyle}
          periodGridlineStyle={periodGridlineStyle}
          onMilestoneDateChange={onMilestoneDateChange}
          tracedIds={tracedIds}
          labelDensity={labelDensity}
          fontScale={fontScale}
          fontFamily={fontFamily}
          metricsScale={fontScale}
        />
        {legend}
        <BlufCallout
          bluf={data.bluf}
          open={blufOpen}
          onOpenChange={onBlufOpenChange}
          theme={theme}
          onEdit={onBlufEdit}
          fillColor={soWhatFillColor}
          fillTransparency={soWhatFillTransparency}
        />
      </div>
    );
  }
  return (
    <div className="pt-16" style={{ background: theme.ground, color: theme.ink }}>
      <ExecutiveView data={data} today={today} timelineSummary={timelineSummary} />
    </div>
  );
}

function pillToggle(active: boolean) {
  return "rounded-full border px-2.5 py-1 text-xs " + (active ? "" : "opacity-55");
}

// Absolute, not relative (wayframe#40/#49) — a relative "2h ago" label goes
// stale the moment it's painted without a ticking re-render, which nothing
// here does.
function formatLastUpdated(iso: string): string {
  const d = new Date(iso);
  const datePart = `${d.getMonth() + 1}/${d.getDate()}`;
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `Updated ${datePart} ${timePart}`;
}

/** Top-right, left of the Options-menu hamburger (top-4 right-4) and clear of BlufCallout (top-16 right-4). */
function LastUpdatedBadge({ lastUpdatedAt }: { lastUpdatedAt?: string }) {
  if (!lastUpdatedAt) return null;
  return (
    <div className="fixed top-4 right-16 z-50 text-xs font-semibold" style={{ color: "#e11d48" }}>
      {formatLastUpdated(lastUpdatedAt)}
    </div>
  );
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
  const timelineSummary = useTimelineSummary(box.data);
  const ghost = useGhostMode();
  const criticalPath = useCriticalPathVisibility();
  const lastUpdated = useLastUpdatedVisibility();
  const { themeId, theme, setTheme } = useTheme();
  const criticalPathLine = useCriticalPathStyle();
  const topBand = useTopBandStyle();
  const soWhat = useSoWhatStyle();
  const gridlines = usePeriodGridlines();
  const labels = useLabelDensity();
  const fontScale = useFontScale();
  const fontFamily = useFontFamily();
  const [correctionMode, setCorrectionMode] = useState<CorrectionBoxMode>("bar");
  const [blufOpen, setBlufOpen] = useState(true);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedTopLevelItemId, setSelectedTopLevelItemId] = useState<string | null>(null);
  // Shape-first manual creation (wayframe#45): a lane's "+" picker sets this
  // once a shape is chosen, arming RoadmapTimeline's placement gesture
  // (click for a milestone, click-drag for a phase). Lives here, not inside
  // RoadmapTimeline, so the "click a point.../Cancel" banner below can
  // render outside the chart — the same split trace/tracedIds already uses.
  const [placement, setPlacement] = useState<{ laneId: string; shape: "milestone" | "phase" } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [trace, setTrace] = useState<{ rootId: string; direction: TraceDirection } | null>(null);
  const [fileError, setFileError] = useState<{ message: string; issues: string[] } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lanesOpen, setLanesOpen] = useState(false);
  const openFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  const visibleCaptureRef = useRef<HTMLDivElement>(null);
  const offscreenCaptureRef = useRef<HTMLDivElement>(null);

  const selectedMilestone = box.data.milestones.find((m) => m.id === selectedMilestoneId) ?? null;
  const selectedTopLevelItemRaw = box.data.topLevelItems.find((t) => t.id === selectedTopLevelItemId) ?? null;
  const selectedTopLevelItem = selectedTopLevelItemRaw && isEditableTopLevelItem(selectedTopLevelItemRaw) ? selectedTopLevelItemRaw : null;

  const otherMode: Mode = mode === "program" ? "executive" : "program";

  // A trace is view state, not document content — nothing is written to the
  // roadmap, so it never competes with the computed critical path and two
  // readers can trace different milestones from the same file.
  const tracedIds = trace ? traceFrom(box.data.milestones, trace.rootId, trace.direction) : undefined;
  const traceRoot = trace ? box.data.milestones.find((m) => m.id === trace.rootId) : null;

  async function handleOpenFile(file: File) {
    setFileError(null);
    const result = parseDocumentFile(await file.text());
    if (result.ok) box.loadDocument(result.document);
    else setFileError({ message: result.message, issues: result.issues });
  }

  // Company-logo upload (wayframe#46/#54) — stored as a data URL directly on
  // the document (see RoadmapData.companyLogo), no blob store. A second
  // upload overwrites the first via the same setCompanyLogo action, so this
  // one handler covers both "upload" and "replace".
  function handleUploadLogo(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") box.setCompanyLogo(reader.result);
    };
    reader.readAsDataURL(file);
  }

  // The date (and, for a phase, endDate) come from wherever the user placed
  // it on the chart (wayframe#45) — no more defaulting to today and editing
  // the date afterward, the point of the shape-first picker + placement
  // gesture is picking the real date up front. Opens straight into the
  // editor either way — an untitled marker with no follow-up is a dead end.
  function handleAddMilestone(laneId: string, date: string, endDate?: string) {
    setSelectedMilestoneId(box.addMilestone(laneId, date, endDate));
    setPlacement(null);
  }

  // A lane's "+" resolves to a shape, not a milestone — picking one arms the
  // placement gesture above rather than creating anything itself.
  function handlePickShape(laneId: string, shape: "milestone" | "phase") {
    setPlacement({ laneId, shape });
  }

  // Escape is the keyboard equivalent of the banner's Cancel button below.
  useEffect(() => {
    if (!placement) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPlacement(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placement]);

  // Mirrors handleAddMilestone above, for the PROGRAM band's own "+"
  // (wayframe#41) — same "create empty, open for editing" pattern.
  function handleAddTopLevelItem(kind: "milestone" | "phase") {
    const iso = today.toISOString().slice(0, 10);
    setSelectedTopLevelItemId(box.addTopLevelItem(kind, iso));
  }

  // An AI-proposed add with no resolved date (wayframe#38 item 1 / #39)
  // falls back to the same "create empty, open for editing" behavior as the
  // manual "+" button above — this fires after Apply, once the new
  // milestone actually exists in box.data.
  function handleMilestonesNeedEditor(ids: string[]) {
    if (ids.length > 0) setSelectedMilestoneId(ids[ids.length - 1]);
  }

  // Mirrors handleAddMilestone's "close what pointed at it" cleanup in
  // reverse (wayframe#38 item 3 / #39): a trace rooted on the deleted
  // milestone would otherwise keep highlighting a ghost id.
  function handleDeleteMilestone(id: string) {
    box.removeMilestone(id);
    setSelectedMilestoneId(null);
    if (trace?.rootId === id) setTrace(null);
  }

  // Mirrors handleDeleteMilestone (wayframe#58) — clears the selection so
  // the modal (already closing itself via onClose) doesn't briefly try to
  // re-render against a deleted id.
  function handleDeleteTopLevelItem(id: string) {
    box.removeTopLevelItem(id);
    setSelectedTopLevelItemId(null);
  }

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
      {/* Clears the fixed correction bar at the bottom — the So-what panel
          now sits in flow at the end of the content and would otherwise run
          underneath it. */}
      <div className="min-w-0 flex-1 pb-56">
        <div className="fixed top-3 left-4 z-50 flex items-center gap-2" style={{ color: "var(--wf-ink)" }}>
          <WayframeLogo accent={theme.accent} caption="AI drafts it. You shape it. Leaders act on it." />
          <button
            onClick={() => setHelpOpen(true)}
            aria-label="What Wayframe can do"
            title="What Wayframe can do"
            style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
            className="ml-1 h-5 w-5 rounded-full border text-[11px] leading-none font-semibold opacity-70 hover:opacity-100"
          >
            ?
          </button>
        </div>
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2">
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        {/* An active trace needs a visible way out — dimmed markers with no
            explanation read as a rendering bug rather than a filter. */}
        {trace && traceRoot && (
          <div
            className="fixed top-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border px-3 py-1.5 text-xs shadow"
            style={{ background: "var(--wf-panel)", borderColor: theme.traceColor, color: "var(--wf-ink)" }}
          >
            <span>
              <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: theme.traceColor }} /> Highlighting{" "}
              {trace.direction === "upstream" ? "everything feeding" : trace.direction === "downstream" ? "everything waiting on" : "everything around"}{" "}
              <strong>{traceRoot.title}</strong> ({tracedIds ? tracedIds.size : 0} milestones)
            </span>
            <button onClick={() => setTrace(null)} className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--wf-border)" }}>
              Clear
            </button>
          </div>
        )}
        {/* Armed placement gesture (wayframe#45) — the chart itself has no other affordance for "never mind". */}
        {placement && (
          <div
            className="fixed top-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border px-3 py-1.5 text-xs shadow"
            style={{ background: "var(--wf-panel)", borderColor: theme.accent, color: "var(--wf-ink)" }}
          >
            <span>{placement.shape === "milestone" ? "Click a point on the lane to place the milestone." : "Click-drag on the lane to draw the phase."}</span>
            <button onClick={() => setPlacement(null)} className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--wf-border)" }}>
              Cancel
            </button>
          </div>
        )}
        {fileError && (
          <div className="fixed top-16 left-1/2 z-50 w-[420px] -translate-x-1/2 rounded-lg border border-red-400 bg-red-50 p-3 text-xs text-red-800 shadow dark:bg-red-950 dark:text-red-200">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{fileError.message}</p>
              <button onClick={() => setFileError(null)} aria-label="Dismiss" className="leading-none">
                ×
              </button>
            </div>
            {fileError.issues.length > 0 && (
              <ul className="mt-1 list-inside list-disc">
                {fileError.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {lastUpdated.visible && <LastUpdatedBadge lastUpdatedAt={box.data.lastUpdatedAt} />}
        <div className="fixed top-4 right-4 z-50">
          <OptionsMenu>
            <OptionsMenuRow label="Help">
              <button onClick={() => setHelpOpen(true)} style={PILL_STYLE} className={pillToggle(true)}>
                What can this do?
              </button>
            </OptionsMenuRow>
            <OptionsMenuRow label="File">
              <button onClick={() => saveDocumentFile(box.data)} style={PILL_STYLE} className={pillToggle(true)}>
                Save
              </button>
              <button onClick={() => openFileRef.current?.click()} style={PILL_STYLE} className={pillToggle(true)}>
                Open
              </button>
              <input
                ref={openFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleOpenFile(f);
                  e.target.value = "";
                }}
              />
            </OptionsMenuRow>
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
                      {laneColors(t.laneRamp, 3).map((c) => (
                        <span key={c} className="flex-1" style={{ background: c }} />
                      ))}
                      <span className="flex-1" style={{ background: t.statusColor.delayed }} />
                    </span>
                    <span className={themeId === t.id ? "font-semibold" : ""}>{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <OptionsMenuRow label="Company logo">
              <button onClick={() => logoFileRef.current?.click()} style={PILL_STYLE} className={pillToggle(true)}>
                {box.data.companyLogo ? "Replace" : "Upload"}
              </button>
              {box.data.companyLogo && (
                <button onClick={box.clearCompanyLogo} style={PILL_STYLE} className={pillToggle(true)}>
                  Remove
                </button>
              )}
              <input
                ref={logoFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadLogo(f);
                  e.target.value = "";
                }}
              />
            </OptionsMenuRow>
            <OptionsMenuRow label="Swimlanes">
              <button onClick={() => setLanesOpen(true)} style={PILL_STYLE} className={pillToggle(true)}>
                Add / edit lanes
              </button>
            </OptionsMenuRow>
            <OptionsMenuRow label="Marker labels">
              <select
                value={labels.density}
                onChange={(e) => labels.setDensity(e.target.value as LabelDensity)}
                aria-label="Marker label density"
                style={PILL_STYLE}
                className="rounded-full border px-2 py-1 text-xs"
              >
                {LABEL_DENSITIES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </OptionsMenuRow>
            <OptionsMenuRow label="Font size">
              <input
                type="range"
                min={FONT_SCALE_MIN}
                max={FONT_SCALE_MAX}
                step={FONT_SCALE_STEP}
                value={fontScale.scale}
                onChange={(e) => fontScale.setScale(parseFloat(e.target.value))}
                aria-label="Font size"
                className="w-24"
              />
              <span className="w-9 text-right font-mono opacity-70">{fontScale.scale.toFixed(2)}×</span>
            </OptionsMenuRow>
            <OptionsMenuRow label="Font family">
              <select
                value={fontFamily.familyId}
                onChange={(e) => fontFamily.setFamily(e.target.value as (typeof FONT_FAMILY_CHOICES)[number]["id"])}
                aria-label="Font family"
                style={PILL_STYLE}
                className="rounded-full border px-2 py-1 text-xs"
              >
                {FONT_FAMILY_CHOICES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </OptionsMenuRow>
            <OptionsMenuRow label="Program band">
              <select
                value={topBand.style}
                onChange={(e) => topBand.setStyle(e.target.value as TopBandStyle)}
                aria-label="Program band style"
                style={PILL_STYLE}
                className="rounded-full border px-2 py-1 text-xs"
              >
                {TOP_BAND_STYLES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </OptionsMenuRow>
            <OptionsMenuRow label="Gridlines">
              <select
                value={gridlines.style}
                onChange={(e) => gridlines.setStyle(e.target.value as PeriodGridlineStyle)}
                aria-label="Period gridline style"
                style={PILL_STYLE}
                className="rounded-full border px-2 py-1 text-xs"
              >
                {PERIOD_GRIDLINE_STYLES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </OptionsMenuRow>
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
            {criticalPath.visible && (
              <OptionsMenuRow label="Critical line">
                <select
                  value={criticalPathLine.style}
                  onChange={(e) => criticalPathLine.setStyle(e.target.value as CriticalPathStyle)}
                  aria-label="Critical path line style"
                  style={PILL_STYLE}
                  className="rounded-full border px-2 py-1 text-xs"
                >
                  {CRITICAL_PATH_STYLES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </OptionsMenuRow>
            )}
            <OptionsMenuRow label="Correction UI">
              <button onClick={() => setCorrectionMode((m) => (m === "bar" ? "sidebar" : "bar"))} style={PILL_STYLE} className={pillToggle(true)}>
                {correctionMode === "bar" ? "Sidebar mode" : "Bar mode"}
              </button>
            </OptionsMenuRow>
            <OptionsMenuRow label="Last updated">
              <button
                onClick={() => lastUpdated.setVisible(!lastUpdated.visible)}
                aria-pressed={lastUpdated.visible}
                aria-label={`Last updated: ${lastUpdated.visible ? "Shown" : "Hidden"}`}
                style={PILL_STYLE} className={pillToggle(lastUpdated.visible)}
              >
                {lastUpdated.visible ? "Shown" : "Hidden"}
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
            {blufOpen && (
              <OptionsMenuRow label="So-what fill">
                <input
                  type="color"
                  aria-label="So-what fill color"
                  value={soWhat.color ?? theme.panelBg}
                  onChange={(e) => soWhat.setColor(e.target.value)}
                  style={{ borderColor: "var(--wf-border)" }}
                  className="h-6 w-7 shrink-0 cursor-pointer rounded border bg-transparent p-0"
                />
              </OptionsMenuRow>
            )}
            {blufOpen && (
              <OptionsMenuRow label="So-what transparency">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={soWhat.transparency}
                  onChange={(e) => soWhat.setTransparency(parseInt(e.target.value, 10))}
                  aria-label="So-what transparency"
                  className="w-24"
                />
              </OptionsMenuRow>
            )}
            {blufOpen && (soWhat.color !== null || soWhat.transparency !== 0) && (
              <OptionsMenuRow label="So-what reset">
                <button onClick={soWhat.reset} style={PILL_STYLE} className={pillToggle(true)}>
                  Reset to theme
                </button>
              </OptionsMenuRow>
            )}
            <OptionsMenuRow label="Import">
              <button onClick={() => setImportOpen(true)} style={PILL_STYLE} className={pillToggle(true)}>
                Import a schedule
              </button>
            </OptionsMenuRow>
            <OptionsMenuRow label="Executive timeline">
              <button onClick={timelineSummary.update} style={PILL_STYLE} className={pillToggle(true)}>
                {timelineSummary.summary ? "Update Executive view" : "Generate"}
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
            criticalPathStyle={criticalPathLine.style}
            theme={theme}
            blufOpen={blufOpen}
            onBlufOpenChange={setBlufOpen}
            onBlufEdit={box.editBluf}
            soWhatFillColor={soWhat.color}
            soWhatFillTransparency={soWhat.transparency}
            onMilestoneClick={(m) => setSelectedMilestoneId(m.id)}
            onAddMilestone={handleAddMilestone}
            onPickShape={handlePickShape}
            placementMode={placement}
            onAddTopLevelItem={handleAddTopLevelItem}
            topBandStyle={topBand.style}
            periodGridlineStyle={gridlines.style}
            onMilestoneDateChange={box.setMilestoneDate}
            tracedIds={tracedIds}
            labelDensity={labels.density}
            timelineSummary={timelineSummary.summary}
            fontScale={fontScale.scale}
            fontFamily={fontFamily.fontFamily}
            legend={
              <ChartLegend
                theme={theme}
                criticalPathStyle={criticalPathLine.style}
                showCriticalPath={criticalPath.visible}
                ghostMode={ghost.mode}
                tracing={trace !== null}
                hasDurations={box.data.milestones.some((m) => m.endDate)}
              />
            }
            onTopLevelItemClick={(t) => setSelectedTopLevelItemId(t.id)}
          />
        </div>
        {exporting && (
          <div ref={offscreenCaptureRef} className={OFFSCREEN_CLASS} aria-hidden="true" inert>
            <RoadmapView
              mode={otherMode}
              chartWidth={1600}
              labelDensity={labels.density}
              data={box.data}
              today={today}
              ghostMode={ghost.mode}
              showCriticalPath={criticalPath.visible}
              criticalPathStyle={criticalPathLine.style}
              topBandStyle={topBand.style}
              periodGridlineStyle={gridlines.style}
              theme={theme}
              blufOpen={blufOpen}
              onBlufOpenChange={setBlufOpen}
              soWhatFillColor={soWhat.color}
              soWhatFillTransparency={soWhat.transparency}
              fontScale={fontScale.scale}
              fontFamily={fontFamily.fontFamily}
            />
          </div>
        )}
      </div>
      <CorrectionBoxSwitcher box={box} mode={correctionMode} onMilestonesNeedEditor={handleMilestonesNeedEditor} />
      <MilestoneEditorModal
        data={box.data}
        milestone={selectedMilestone}
        onSave={box.editMilestone}
        onClose={() => setSelectedMilestoneId(null)}
        onDelete={handleDeleteMilestone}
        onToggleDependency={box.toggleDependency}
        onTrace={(direction) => {
          if (selectedMilestoneId) setTrace({ rootId: selectedMilestoneId, direction });
          setSelectedMilestoneId(null);
        }}
      />
      <TopLevelItemEditorModal
        item={selectedTopLevelItem}
        onSave={box.editTopLevelItem}
        onClose={() => setSelectedTopLevelItemId(null)}
        onDelete={handleDeleteTopLevelItem}
      />
      {importOpen && <ImportPanel onExtracted={box.loadDocument} onClose={() => setImportOpen(false)} />}
      {helpOpen && <HelpPanel theme={theme} onClose={() => setHelpOpen(false)} />}
      {lanesOpen && (
        <SwimlaneManager
          data={box.data}
          theme={theme}
          onAdd={box.addSwimlane}
          onRename={box.renameSwimlane}
          onRemove={box.removeSwimlane}
          onMove={box.moveSwimlane}
          onColor={box.setLaneColor}
          onRagOverride={box.setRagOverride}
          onClose={() => setLanesOpen(false)}
        />
      )}
    </div>
  );
}
