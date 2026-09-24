"use client";

// The shared roadmap experience (wayframe#24) — RoadmapTimeline/ExecutiveView
// toggle, correction box, milestone/top-level editors, structured import —
// mounted by both the real `/` entry page (wayframe#25, a visitor's own
// extracted document) and the `/dev/demo-roadmap` QA route (the hardcoded
// demo fixture). Parameterized by `initialData`/`today` so neither caller
// hand-maintains its own copy.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import { mergeForRender, type Portfolio, type PortfolioDocument, type Program, type RenderableProgram } from "@/components/timeline/types";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { defaultPortfolioTheme, resolvePortfolioTheme, type Theme } from "@/components/timeline/theme";
import { BlufCallout } from "@/components/timeline/BlufCallout";
import { ChartLegend } from "@/components/timeline/ChartLegend";
import { WayframeLogo } from "@/components/brand/WayframeLogo";
import { HelpPanel } from "./HelpPanel";
import { ExecutiveView } from "@/components/executive-view/ExecutiveView";
import { useCorrectionBox, type AppliedIds } from "@/components/correction-box/use-correction-box";
import { useDeltaAnnotations } from "@/components/timeline/use-delta-annotations";
import { useFontScale, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP } from "@/components/timeline/use-font-scale";
import { useFontFamily, FONT_FAMILY_CHOICES } from "@/components/timeline/use-font-family";
import { useCriticalPathVisibility } from "@/components/timeline/use-critical-path-visibility";
import { useLastUpdatedVisibility } from "@/components/timeline/use-last-updated-visibility";
import { useCriticalPathStyle, CRITICAL_PATH_STYLES, type CriticalPathStyle } from "@/components/timeline/use-critical-path-style";
import { useTopBandStyle, TOP_BAND_STYLES, type TopBandStyle } from "@/components/timeline/use-top-band-style";
import { useSoWhatStyle } from "@/components/timeline/use-so-what-style";
import { usePeriodGridlines, PERIOD_GRIDLINE_STYLES, type PeriodGridlineStyle } from "@/components/timeline/use-period-gridlines";
import { useAxisTiers } from "@/components/timeline/use-axis-tiers";
import type { AxisTierConfig } from "@/components/timeline/axis-tiers";
import { useLabelDensity, LABEL_DENSITIES } from "@/components/timeline/use-label-density";
import type { LabelDensity } from "@/components/timeline/title-layout";
import { THEME_LIST } from "@/components/timeline/theme";
import { laneColors } from "@/components/timeline/lane-colors";
import { SwimlaneManager } from "./SwimlaneManager";
import { OutlineTree } from "./OutlineTree";
import { CorrectionBoxSwitcher, type CorrectionBoxMode } from "@/components/correction-box/CorrectionBoxSwitcher";
import { MilestoneEditorInspector } from "@/components/milestone-editor/MilestoneEditorInspector";
import { TopLevelItemEditorInspector, isEditableTopLevelItem } from "@/components/milestone-editor/TopLevelItemEditorInspector";
import { EDITOR_DOCK_WIDTH } from "@/components/milestone-editor/editor-dock";
import { ImportPanel } from "@/components/structured-import/ImportPanel";
import { OptionsMenu, OptionsMenuRow, OptionsMenuSection } from "./OptionsMenu";
import { useOptionsSections } from "./use-options-sections";
import { NewDocumentBanner } from "./NewDocumentBanner";
import { ExportDialog, type ExportDestination } from "./ExportDialog";
import { saveDocumentFile, parseDocumentFile } from "@/lib/document-file/document-file";
import { traceFrom, type TraceDirection } from "@/lib/critical-path/trace";
import { useTimelineSummary } from "@/components/executive-view/use-timeline-summary";
import type { ExecutiveTimelineSummary } from "@/components/executive-view/timeline-summary";
import { useConnectorStyle, CONNECTOR_STYLES, type ConnectorStyle } from "@/components/timeline/use-connector-style";
import { useConnectorLineStyle, CONNECTOR_DASHES, CONNECTOR_ARROWS, type ConnectorDash, type ConnectorArrow } from "@/components/timeline/use-connector-line-style";
import { useTodayOverlay } from "@/components/timeline/use-today-overlay";
import { usePillProgressStyle, PILL_PROGRESS_STYLES, type PillProgressStyle } from "@/components/timeline/use-pill-progress-style";
import { useFitToScreen } from "@/components/timeline/use-fit-to-screen";
import { useDateLabelPlacement, DATE_LABEL_PLACEMENTS, type DateLabelPlacement } from "@/components/timeline/use-date-label-placement";
import { useLegendCategoryStyle } from "@/components/timeline/use-legend-category-style";
import { useHiddenCategories } from "@/components/timeline/use-hidden-categories";
import { useSwimlaneOwnerVisibility } from "@/components/timeline/use-swimlane-owner-visibility";
import { useEditLock } from "./use-edit-lock";
import { CategoryManager } from "./CategoryManager";
import { SharePanel } from "./SharePanel";
import { SnapshotsPanel } from "./SnapshotsPanel";
import { useSavedViews, type ViewSnapshot } from "@/components/timeline/use-saved-views";
import { useSelection } from "@/components/timeline/use-selection";
import { SelectionToolbar } from "./SelectionToolbar";
import { useZoomWindow, filterToWindow, type UseZoomWindowResult, type ZoomWindow } from "@/components/timeline/use-zoom-window";
import { ZoomControls, ZoomPreviewFrame } from "@/components/timeline/ZoomControls";
import { useProgramRoom, type ConnectionStatus, type ProgramRoomIdentity } from "@/lib/realtime/use-program-room";
import type { RoomAccess } from "@/lib/realtime/provider";
import { PresenceAvatars, remoteSelectionsFromPeers } from "./PresenceAvatars";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { ConflictBanner } from "./ConflictBanner";

type Mode = "executive" | "program";

// Export always ships both views regardless of the toggle (wayframe#27/#28). The
// inactive one is only mounted, off-screen and aria-hidden, for the duration of
// an export — ExecutiveView repeats the BLUF statement as subtext (per #8), so
// keeping both permanently mounted would duplicate accessible page content.
export const OFFSCREEN_CLASS = "pointer-events-none absolute top-0 -left-[99999px]";

// t40 (Binary asset storage boundary) — companyLogo.dataUrl stays an inline
// string in the document rather than moving to a blob store, so this is the
// one guardrail that keeps that decision sound: a rare, small, user-initiated
// write, not unbounded row growth.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function deckFileName(programName: string): string {
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

export function RoadmapView({
  mode,
  data,
  today,
  deltaAnnotationsEnabled,
  showCriticalPath,
  criticalPathStyle,
  theme,
  blufOpen,
  onBlufOpenChange,
  onBlufEdit,
  onEditDocument,
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
  axisTiers,
  axisYearColor,
  onAxisTiersChange,
  onMilestoneDateChange,
  tracedIds,
  chartWidth,
  labelDensity,
  legend,
  timelineSummary,
  fontScale,
  fontFamily,
  onCompanyLogoChange,
  connectorStyle,
  connectorDash,
  connectorArrow,
  todayOverlayEnabled,
  pillProgressStyle,
  fitToScreen,
  dateLabelPlacement,
  legendCategoryFillEnabled,
  isCategoryHidden,
  swimlaneOwnerVisible,
  onMilestoneDateRangeChange,
  selectionModeEnabled,
  selectedIds,
  onToggleSelect,
  onMarqueeSelect,
  zoom,
  domainOverride,
  remoteSelections,
  onToggleGroupCollapsed,
}: {
  mode: Mode;
  data: RenderableProgram;
  today: Date;
  deltaAnnotationsEnabled: boolean;
  showCriticalPath: boolean;
  criticalPathStyle: CriticalPathStyle;
  theme: Theme;
  blufOpen: boolean;
  onBlufOpenChange: (open: boolean) => void;
  /** Omit for the off-screen export capture — that copy has no document to write back into. */
  onBlufEdit?: (patch: Partial<Program["bluf"]>) => void;
  /** Click-to-edit on programName/owner (program view) and reportsTo/nextReviewDate (executive view) (wayframe#55/#60) — omit for the off-screen export capture. */
  onEditDocument?: (patch: { programName?: string; owner?: string; reportsTo?: string; nextReviewDate?: string }) => void;
  soWhatFillColor?: string | null;
  soWhatFillTransparency?: number;
  onMilestoneClick?: (m: { id: string }) => void;
  onTopLevelItemClick?: (t: { id: string }) => void;
  onAddMilestone?: (laneId: string, date: string, endDate?: string) => void;
  onPickShape?: (laneId: string, shape: "milestone" | "phase") => void;
  placementMode?: { laneId: string; shape: "milestone" | "phase" } | null;
  onAddTopLevelItem?: (kind: "milestone" | "phase" | "annotation") => void;
  topBandStyle?: TopBandStyle;
  periodGridlineStyle?: PeriodGridlineStyle;
  axisTiers?: AxisTierConfig;
  axisYearColor?: string;
  /** Omit for the off-screen export capture — that copy renders the axis read-only, same convention as onEditDocument. */
  onAxisTiersChange?: (next: AxisTierConfig) => void;
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
  /** Freeform logo drag/resize commit (wayframe#64) — omit for the off-screen export capture, same convention as onEditDocument. */
  onCompanyLogoChange?: (patch: { dx: number; dy: number; scale: number }) => void;
  // --- Later additions — all pass straight through to RoadmapTimeline ---
  connectorStyle?: ConnectorStyle;
  connectorDash?: ConnectorDash;
  connectorArrow?: ConnectorArrow;
  todayOverlayEnabled?: boolean;
  pillProgressStyle?: PillProgressStyle;
  fitToScreen?: boolean;
  dateLabelPlacement?: DateLabelPlacement;
  legendCategoryFillEnabled?: boolean;
  /** Per-category show/hide (t22) — a viewer preference, see use-hidden-categories.ts. Omit for the off-screen export capture, which should render every category. */
  isCategoryHidden?: (categoryId: string) => boolean;
  swimlaneOwnerVisible?: boolean;
  /** Omit for the off-screen export capture, same convention as onMilestoneDateChange. */
  onMilestoneDateRangeChange?: (id: string, date: string, endDate: string) => void;
  selectionModeEnabled?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onMarqueeSelect?: (ids: string[]) => void;
  /** Interactive zoom (wayframe t10) — omit for the off-screen export capture; when present, drives the on-screen slider/preview AND the render domain (its `committedWindow`, once active, wins over `domainOverride` below). */
  zoom?: UseZoomWindowResult;
  /**
   * Plain render-domain override with no interactive UI (wayframe t29) — the
   * off-screen export capture's mechanism for inheriting whatever committed
   * zoom window the on-screen view currently shows, without mounting
   * `ZoomControls`/`ZoomPreviewFrame` into the captured slide. Ignored in
   * "executive" mode (ExecutiveView has no zoomable chart). Ignored if `zoom`
   * is also passed and active — that combination doesn't happen in practice
   * (the interactive on-screen view never also gets a standalone override),
   * but `zoom` winning keeps a single source of truth if it ever did.
   */
  domainOverride?: ZoomWindow;
  /** Live-room remote-selection rings (wayframe t38) — milestone id -> peer color, from remoteSelectionsFromPeers(peers). Omit for the off-screen export capture, same convention as every other on-screen-only prop here. */
  remoteSelections?: Record<string, string>;
  /** Swimlane Groups (t21) — fired when a group's header band is clicked. Omit for the off-screen export capture, which always renders every group expanded, same convention as onAxisTiersChange. */
  onToggleGroupCollapsed?: (groupId: string) => void;
}) {
  if (mode === "program") {
    const effectiveDomain = zoom?.active ? zoom.committedWindow : domainOverride;
    const zoomedData = effectiveDomain ? filterToWindow(data, effectiveDomain) : data;
    const chart = (
      <RoadmapTimeline
        data={zoomedData}
        today={today}
        width={chartWidth}
        deltaAnnotationsEnabled={deltaAnnotationsEnabled}
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
        axisTiers={axisTiers}
        axisYearColor={axisYearColor}
        onAxisTiersChange={onAxisTiersChange}
        onMilestoneDateChange={onMilestoneDateChange}
        tracedIds={tracedIds}
        labelDensity={labelDensity}
        fontScale={fontScale}
        fontFamily={fontFamily}
        metricsScale={fontScale}
        onEditDocument={onEditDocument}
        onCompanyLogoChange={onCompanyLogoChange}
        connectorStyle={connectorStyle}
        connectorDash={connectorDash}
        connectorArrow={connectorArrow}
        todayOverlayEnabled={todayOverlayEnabled}
        pillProgressStyle={pillProgressStyle}
        fitToScreen={fitToScreen}
        dateLabelPlacement={dateLabelPlacement}
        legendCategoryFillEnabled={legendCategoryFillEnabled}
        isCategoryHidden={isCategoryHidden}
        swimlaneOwnerVisible={swimlaneOwnerVisible}
        onMilestoneDateRangeChange={onMilestoneDateRangeChange}
        selectionModeEnabled={selectionModeEnabled}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        onMarqueeSelect={onMarqueeSelect}
        domainOverride={effectiveDomain}
        remoteSelections={remoteSelections}
        onToggleGroupCollapsed={onToggleGroupCollapsed}
      />
    );
    return (
      <div className="relative mx-auto max-w-[1600px] p-8 pt-16" style={{ background: theme.ground }}>
        {/* Below `lg` the top toolbar's compact zoom cluster hides (not
            enough width for the icon cluster, per the toolbar-contention
            budget), so this full block variant is that breakpoint's
            fallback, not a duplicate — wayframe UX-2026-09-18 §3. */}
        {zoom && (
          <div className="lg:hidden">
            <ZoomControls state={zoom} />
          </div>
        )}
        {zoom ? <ZoomPreviewFrame state={zoom}>{chart}</ZoomPreviewFrame> : chart}
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
      <ExecutiveView data={data} today={today} timelineSummary={timelineSummary} onEditDocument={onEditDocument} />
    </div>
  );
}

function pillToggle(active: boolean) {
  return "rounded-full border px-2.5 py-1 text-xs " + (active ? "" : "opacity-55");
}

/** Square icon-button variant of pillToggle (wayframe UX-2026-09-18 §3/§4/§5) — the top toolbar's Select mode/Outline/Swimlanes buttons need a compact, symbol-only affordance, not a labeled pill (see the toolbar-contention budget math these were designed against). */
function iconToggle(active: boolean) {
  return "flex h-7 w-7 items-center justify-center rounded-full border text-sm " + (active ? "" : "opacity-55");
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

/**
 * The real persistence indicator (wayframe#121) — on a realtime-connected
 * page this is what actually tells a user whether their edit is saved, not
 * the Options ▸ File "Save" pill (which only ever downloads a local copy and
 * is relabeled below once `realtime` is set). Derived from the same
 * `status`/`showOfflineBadge` pair ConnectionStatusBadge already renders, so
 * there's no new connection-state tracking here — just a second, differently
 * shaped read of it: "Offline — changes pending" once showOfflineBadge's own
 * ~2.5s debounce (use-program-room.ts) has confirmed a real drop, "Saved"
 * once truly connected, and "Syncing…" for everything in between (initial
 * connect, or a drop still inside that debounce window) — the same "no
 * flicker on a brief blip" behavior the badge already gives the offline case.
 */
function SyncStatusIndicator({ status, showOfflineBadge }: { status: ConnectionStatus; showOfflineBadge: boolean }) {
  const label = showOfflineBadge ? "Offline — changes pending" : status === "connected" ? "Saved" : "Syncing…";
  const color = showOfflineBadge ? "#b45309" : "var(--wf-ink)";
  return (
    <span role="status" className="text-xs font-medium whitespace-nowrap opacity-70" style={{ color }}>
      {label}
    </span>
  );
}

/** A plain inline child of the top toolbar's right-hand cluster (wayframe UX-2026-09-18 §3) — no longer self-positions via `fixed`, so it composes with its siblings (PresenceAvatars, the Options hamburger) in one flex row instead of each hand-offsetting from the viewport edge. */
function LastUpdatedBadge({ lastUpdatedAt }: { lastUpdatedAt?: string }) {
  if (!lastUpdatedAt) return null;
  return (
    <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "#e11d48" }}>
      {formatLastUpdated(lastUpdatedAt)}
    </span>
  );
}

/** Chrome surfaces read the theme through the CSS vars published on the workspace root. */
const PILL_STYLE: React.CSSProperties = { background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" };

export function RoadmapWorkspace({
  initialData,
  initialPortfolio,
  today,
  persist = true,
  onStartNew,
  canManageSharing = false,
  newDocumentOrigin,
  realtime,
}: {
  initialData: Program;
  initialPortfolio: Portfolio;
  today: Date;
  persist?: boolean;
  /** Routes back to the entry form (wayframe#63) — omitted by the `/dev/demo-roadmap` QA route, which has no entry form to return to. */
  onStartNew?: () => void;
  /** wayframe#t37: whether the caller has already established the current visitor owns this Portfolio — gates the Options menu's "Sharing" row and the SharePanel it opens. Defaults false so every existing call site (which never passes it) keeps behaving exactly as before. */
  canManageSharing?: boolean;
  /** Whether the current document came from AI extraction vs a blank/template start — lets NewDocumentBanner say which one actually happened instead of always claiming "started from a template" (found 2026-09-19: that copy was shown unconditionally, making a successful extraction look like it had been silently discarded). Undefined (every caller but the root entry page) keeps the existing blank-template wording, since /p/[portfolioId] and /dev/demo-roadmap never originate from EntryForm's extraction path. */
  newDocumentOrigin?: "extracted" | "blank";
  /**
   * Live collaborative editing (wayframe t38) — optional so every existing
   * caller (root `/`, the `/dev/demo-roadmap` QA route) that never passes
   * this is completely unaffected: `useProgramRoom` below is still called
   * unconditionally (React hook-order rules), just internally gated off via
   * `enabled: realtime != null`.
   */
  realtime?: { programId: string; access: RoomAccess; identity: ProgramRoomIdentity };
}) {
  const [mode, setMode] = useState<Mode>("program");
  const box = useCorrectionBox(initialData, initialPortfolio, persist, today);
  // The render layer (RoadmapTimeline, MilestoneEditorInspector, CategoryManager)
  // stays Portfolio-agnostic (wayframe t11) — this is the one seam that
  // reassembles the flat shape it expects from the split edit-time state.
  // Computed before useTimelineSummary since that needs the render layer's
  // resolved isCriticalPath (t14) too, not persisted-state's Program.
  const renderable = mergeForRender(box.portfolio, box.data);
  const timelineSummary = useTimelineSummary(renderable);
  // What Save/Open round-trip through .wayframe.json (wayframe t11) — the
  // whole PortfolioDocument, not just this one Program (see document-file.ts).
  const portfolioDocument: PortfolioDocument = { portfolio: box.portfolio, programs: [box.data] };
  const deltaAnnotations = useDeltaAnnotations();
  const criticalPath = useCriticalPathVisibility();
  const lastUpdated = useLastUpdatedVisibility();
  // Theme is Portfolio document content (wayframe#88/t18, CONTEXT.md's
  // doctrine #76), not a viewer preference — read/write through `box`
  // (the Portfolio's own state) like companyLogo/legendCategories, not a
  // localStorage-backed hook.
  const portfolioTheme = box.portfolio.theme ?? defaultPortfolioTheme;
  const themeId = portfolioTheme.baseId;
  const theme = resolvePortfolioTheme(portfolioTheme);
  const criticalPathLine = useCriticalPathStyle();
  const topBand = useTopBandStyle();
  const soWhat = useSoWhatStyle();
  const gridlines = usePeriodGridlines();
  const axisTiers = useAxisTiers();
  const labels = useLabelDensity();
  const fontScale = useFontScale();
  const fontFamily = useFontFamily();
  const sections = useOptionsSections();
  const connectorStyle = useConnectorStyle();
  const connectorLineStyle = useConnectorLineStyle();
  const todayOverlay = useTodayOverlay();
  const pillProgress = usePillProgressStyle();
  const fitToScreen = useFitToScreen();
  const dateLabelPlacement = useDateLabelPlacement();
  const legendCategoryStyle = useLegendCategoryStyle();
  const hiddenCategories = useHiddenCategories();
  const swimlaneOwner = useSwimlaneOwnerVisibility();
  const editLock = useEditLock();
  const isViewMode = editLock.mode === "view";
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [themeCustomizeOpen, setThemeCustomizeOpen] = useState(false);
  const savedViews = useSavedViews();
  const [savingViewName, setSavingViewName] = useState<string | null>(null);
  const selection = useSelection();
  const [selectMode, setSelectMode] = useState(false);
  const zoom = useZoomWindow(renderable);

  // Saved Views — reads every preference hook already
  // instantiated above into one snapshot / writes one back out through each
  // hook's own setter, the same setters the options-menu rows below call
  // directly. Legend open/closed is deliberately not included: ChartLegend
  // owns that bit of state internally with no prop to drive it, so a saved
  // view can't reach it without a bigger refactor of a component that
  // already has its own tests.
  function currentSnapshot(): ViewSnapshot {
    return {
      deltaAnnotationsEnabled: deltaAnnotations.enabled,
      criticalPathVisible: criticalPath.visible,
      criticalPathStyle: criticalPathLine.style,
      topBandStyle: topBand.style,
      gridlineStyle: gridlines.style,
      axisTiers: axisTiers.config,
      axisYearColor: axisTiers.yearColor,
      labelDensity: labels.density,
      fontScale: fontScale.scale,
      fontFamilyId: fontFamily.familyId,
      connectorStyle: connectorStyle.style,
      connectorDash: connectorLineStyle.dash,
      connectorArrow: connectorLineStyle.arrow,
      todayOverlayEnabled: todayOverlay.enabled,
      pillProgressStyle: pillProgress.style,
      fitToScreenEnabled: fitToScreen.enabled,
      dateLabelPlacement: dateLabelPlacement.placement,
      legendCategoryFillEnabled: legendCategoryStyle.enabled,
      swimlaneOwnerVisible: swimlaneOwner.visible,
    };
  }

  function applyView(snapshot: ViewSnapshot) {
    // Theme is document content now (wayframe#88/t18) — a Saved View is a
    // bundle of viewer preferences and must never mutate the document, so
    // there's no themeId field here to apply anymore (CONTEXT.md's doctrine).
    if (snapshot.deltaAnnotationsEnabled !== undefined) deltaAnnotations.setEnabled(snapshot.deltaAnnotationsEnabled);
    if (snapshot.criticalPathVisible !== undefined) criticalPath.setVisible(snapshot.criticalPathVisible);
    if (snapshot.criticalPathStyle !== undefined) criticalPathLine.setStyle(snapshot.criticalPathStyle);
    if (snapshot.topBandStyle !== undefined) topBand.setStyle(snapshot.topBandStyle);
    if (snapshot.gridlineStyle !== undefined) gridlines.setStyle(snapshot.gridlineStyle);
    if (snapshot.axisTiers !== undefined) axisTiers.setTiers(snapshot.axisTiers);
    if (snapshot.axisYearColor !== undefined) axisTiers.setYearColor(snapshot.axisYearColor);
    if (snapshot.labelDensity !== undefined) labels.setDensity(snapshot.labelDensity);
    if (snapshot.fontScale !== undefined) fontScale.setScale(snapshot.fontScale);
    if (snapshot.fontFamilyId !== undefined) fontFamily.setFamily(snapshot.fontFamilyId as (typeof FONT_FAMILY_CHOICES)[number]["id"]);
    if (snapshot.connectorStyle !== undefined) connectorStyle.setStyle(snapshot.connectorStyle);
    if (snapshot.connectorDash !== undefined) connectorLineStyle.setDash(snapshot.connectorDash);
    if (snapshot.connectorArrow !== undefined) connectorLineStyle.setArrow(snapshot.connectorArrow);
    if (snapshot.todayOverlayEnabled !== undefined) todayOverlay.setEnabled(snapshot.todayOverlayEnabled);
    if (snapshot.pillProgressStyle !== undefined) pillProgress.setStyle(snapshot.pillProgressStyle);
    if (snapshot.fitToScreenEnabled !== undefined) fitToScreen.setEnabled(snapshot.fitToScreenEnabled);
    if (snapshot.dateLabelPlacement !== undefined) dateLabelPlacement.setPlacement(snapshot.dateLabelPlacement);
    if (snapshot.legendCategoryFillEnabled !== undefined) legendCategoryStyle.setEnabled(snapshot.legendCategoryFillEnabled);
    if (snapshot.swimlaneOwnerVisible !== undefined) swimlaneOwner.setVisible(snapshot.swimlaneOwnerVisible);
  }
  const [correctionMode, setCorrectionMode] = useState<CorrectionBoxMode>("bar");
  const [blufOpen, setBlufOpen] = useState(true);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  // The real live room-connection hook (wayframe t38, fork 2) — see its own
  // file for the bootstrap/echo-avoidance/reconnect/presence details. Always
  // called (never behind an `if`), gated internally by `enabled` so a caller
  // without a realtime prop yet (or ever) never opens a connection.
  // `room.showOfflineBadge`/`box.conflicts` are rendered below via
  // ConnectionStatusBadge/ConflictBanner (fork 3).
  const room = useProgramRoom({
    programId: realtime?.programId ?? "",
    box,
    access: realtime?.access ?? { shareToken: "" },
    identity: realtime?.identity ?? { name: "", identityKey: "" },
    selectedId: selectedMilestoneId,
    enabled: realtime != null,
  });
  const remoteSelections = remoteSelectionsFromPeers(room.peers);
  const [selectedTopLevelItemId, setSelectedTopLevelItemId] = useState<string | null>(null);
  // Shape-first manual creation (wayframe#45): a lane's "+" picker sets this
  // once a shape is chosen, arming RoadmapTimeline's placement gesture
  // (click for a milestone, click-drag for a phase). Lives here, not inside
  // RoadmapTimeline, so the "click a point.../Cancel" banner below can
  // render outside the chart — the same split trace/tracedIds already uses.
  const [placement, setPlacement] = useState<{ laneId: string; shape: "milestone" | "phase" } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  /** "Save Snapshot ›" (wayframe UX-2026-09-18 §8) — opens the same ExportDialog the Export row already does, just pre-selected onto the "snapshot" destination, so creating one is one click closer than picking it off the dialog's own 3-way radio by hand. `undefined` (the Export row's own path) leaves ExportDialog's default ("pptx") untouched. */
  const [exportInitialDestination, setExportInitialDestination] = useState<ExportDestination | undefined>(undefined);
  const [trace, setTrace] = useState<{ rootId: string; direction: TraceDirection } | null>(null);
  const [fileError, setFileError] = useState<{ message: string; issues: string[] } | null>(null);
  // Set when an opened file held more Programs than this surface can show
  // (wayframe#140) — a notice, not an error: the open itself succeeded.
  const [partialOpen, setPartialOpen] = useState<{ opened: string; skipped: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // "Start new roadmap" confirm (wayframe#63) — Undo doesn't survive the
  // round-trip to the entry form (this whole component unmounts), so the
  // confirm step is a forced save rather than a discard dialog. Mirrors
  // SwimlaneManager's lane-delete inline-expand idiom, same precedent #62 cited.
  const [confirmingNew, setConfirmingNew] = useState(false);

  function handleStartNew() {
    if (!onStartNew) return;
    if (box.historyLength === 0) {
      onStartNew();
      return;
    }
    setConfirmingNew(true);
  }
  const [lanesOpen, setLanesOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [confirmingAcceptAll, setConfirmingAcceptAll] = useState(false);
  const openFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  // From `renderable`, not `box.data` (t14): MilestoneEditorInspector needs the
  // render-layer's computed isCriticalPath, which only RenderableProgram's
  // milestones carry.
  const selectedMilestone = renderable.milestones.find((m) => m.id === selectedMilestoneId) ?? null;
  const selectedTopLevelItemRaw = box.data.topLevelItems.find((t) => t.id === selectedTopLevelItemId) ?? null;
  const selectedTopLevelItem = selectedTopLevelItemRaw && isEditableTopLevelItem(selectedTopLevelItemRaw) ? selectedTopLevelItemRaw : null;

  // A trace is view state, not document content — nothing is written to the
  // roadmap, so it never competes with the computed critical path and two
  // readers can trace different milestones from the same file.
  const tracedIds = trace ? traceFrom(box.data.milestones, trace.rootId, trace.direction) : undefined;
  const traceRoot = trace ? box.data.milestones.find((m) => m.id === trace.rootId) : null;

  async function handleOpenFile(file: File) {
    setFileError(null);
    setPartialOpen(null);
    const result = parseDocumentFile(await file.text());
    if (!result.ok) {
      setFileError({ message: result.message, issues: result.issues });
      return;
    }
    box.loadPortfolioDocument(result.document);
    // `loadPortfolioDocument` keeps `programs[0]` and drops the rest — this
    // page has exactly one `useCorrectionBox` and one localStorage slot, so
    // it cannot hold more (wayframe#140). That limit is fine; doing it
    // SILENTLY was not, since a file with four Programs opened looking
    // entirely successful with three of them missing. Say what happened and
    // where the surface that shows them all is.
    const skipped = result.document.programs.length - 1;
    if (skipped > 0) setPartialOpen({ opened: result.document.programs[0].programName, skipped });
  }

  // Company-logo upload (wayframe#46/#54) — stored as a data URL directly on
  // the document (see Portfolio.companyLogo), no blob store. A second
  // upload overwrites the first via the same setCompanyLogo action, so this
  // one handler covers both "upload" and "replace". The size cap (t40) is
  // the guardrail that keeps this inline-storage decision viable: the
  // dataUrl rides along in every snapshot of #86's per-Program row, so a
  // sane per-asset ceiling here is what bounds that row instead of a blob
  // store or dedup layer.
  function handleUploadLogo(file: File) {
    if (file.size > MAX_LOGO_BYTES) {
      setFileError({ message: "That logo is too large (max 2MB) — try a smaller image.", issues: [] });
      return;
    }
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
  function handleAddTopLevelItem(kind: "milestone" | "phase" | "annotation") {
    const iso = today.toISOString().slice(0, 10);
    setSelectedTopLevelItemId(box.addTopLevelItem(kind, iso));
  }

  // An AI-proposed add with no resolved date (wayframe#38 item 1 / #39,
  // widened to PROGRAM-band adds in wayframe#59) falls back to the same
  // "create empty, open for editing" behavior as the manual "+" buttons
  // above — this fires after Apply, once the new entities actually exist in
  // box.data. A response can propose both kinds in one go; each opens its
  // own modal since they're different editors.
  function handleNeedsEditor(ids: AppliedIds) {
    if (ids.milestoneIds.length > 0) setSelectedMilestoneId(ids.milestoneIds[ids.milestoneIds.length - 1]);
    if (ids.topLevelItemIds.length > 0) setSelectedTopLevelItemId(ids.topLevelItemIds[ids.topLevelItemIds.length - 1]);
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
          "--wf-rag-green": theme.ragColor.green,
          "--wf-rag-amber": theme.ragColor.amber,
          "--wf-rag-red": theme.ragColor.red,
          // Width of whatever editor is currently docked on the right
          // (wayframe#126) — read by the viewport-centered correction bar
          // and selection toolbar so they stay centered on the chart
          // instead of sliding under the dock. See CorrectionBox.tsx's
          // DOCK_SHIFT.
          "--wf-dock-w": selectedMilestone || selectedTopLevelItem ? `${EDITOR_DOCK_WIDTH}px` : "0px",
          // Clears this surface's own floating top toolbar (the `fixed top-3`
          // rows below), which spans the whole window and would otherwise
          // paint over the docked editor's title row.
          "--wf-dock-top": "3.5rem",
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
        {/* Debounced offline badge (wayframe t38) — bottom-right, clear of
            the correction bar's bottom-center real estate and every other
            fixed notice this component renders (see ConnectionStatusBadge's
            own doc comment). Renders nothing until room.showOfflineBadge
            flips true. */}
        <ConnectionStatusBadge show={room.showOfflineBadge} />
        {/* Persistent orphaned-edit conflicts (wayframe t38) — top-left,
            deliberately on the opposite side of the screen from the offline
            badge and in a distinct error tone (see ConflictBanner's own doc
            comment) so the two never visually collide. Renders nothing
            until box.conflicts is non-empty. */}
        <ConflictBanner conflicts={box.conflicts} onDismiss={box.dismissConflict} />
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
        {partialOpen && (
          <div className="fixed top-16 left-1/2 z-50 w-[420px] -translate-x-1/2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 shadow dark:bg-amber-950 dark:text-amber-100">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">
                That file holds {partialOpen.skipped + 1} Programs — only &ldquo;{partialOpen.opened}&rdquo; was opened.
              </p>
              <button onClick={() => setPartialOpen(null)} aria-label="Dismiss Programs notice" className="leading-none">
                ×
              </button>
            </div>
            <p className="mt-1">
              This page shows one Program at a time. To keep all {partialOpen.skipped + 1} together and edit between them, import the file as a
              hosted Roadmap from{" "}
              <Link href="/" className="underline">
                My Roadmaps
              </Link>
              .
            </p>
          </div>
        )}
        {!box.data.lastUpdatedAt && box.historyLength === 0 && !placement && !trace && (
          <NewDocumentBanner theme={theme} origin={newDocumentOrigin} />
        )}
        {/* Unified top-right toolbar cluster (wayframe UX-2026-09-18 §3/§4/§5
            — designed and landed as one pass since all three compete for the
            same strip, see this ticket's own "toolbar contention" note).
            Replaces five independently hand-offset `fixed` islands with one
            flex row: compact zoom (program mode, >=lg only — the block
            variant below the chart is this cluster's <lg fallback) | Select
            mode / Outline / Swimlanes icon buttons (promoted out of Options
            → Layout, §4/§5 Part A) | Updated badge | presence avatars |
            Options hamburger. */}
        <div className="fixed top-3 right-4 z-50 flex flex-wrap items-center justify-end gap-2" style={{ maxWidth: "calc(100vw - 2rem)" }}>
          {mode === "program" && zoom && (
            <div className="hidden lg:block">
              <ZoomControls state={zoom} variant="compact" />
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setSelectMode((v) => {
                  // Clearing stale selection on mode-off (wayframe UX-2026-09-18
                  // §4) — selection itself no longer depends on this mode being
                  // on (Cmd/Ctrl-click and the Outline tree both drive it
                  // independently now), but turning the mode off still reads as
                  // "done selecting," so leftover selected ids from either path
                  // shouldn't linger silently.
                  if (v) selection.clear();
                  return !v;
                })
              }
              disabled={isViewMode}
              aria-pressed={selectMode}
              aria-label={`Select mode: ${selectMode ? "On" : "Off"}`}
              title="Select mode"
              style={PILL_STYLE}
              className={iconToggle(selectMode) + " disabled:opacity-40"}
            >
              ⬚
            </button>
            <button onClick={() => setOutlineOpen(true)} aria-label="Open outline" title="Outline" style={PILL_STYLE} className={iconToggle(true)}>
              ▤
            </button>
            <button onClick={() => setLanesOpen(true)} aria-label="Add / edit lanes" title="Swimlanes" style={PILL_STYLE} className={iconToggle(true)}>
              ▦
            </button>
          </div>
          {lastUpdated.visible && <LastUpdatedBadge lastUpdatedAt={box.data.lastUpdatedAt} />}
          {realtime && <SyncStatusIndicator status={room.status} showOfflineBadge={room.showOfflineBadge} />}
          <PresenceAvatars peers={room.peers} />
          <OptionsMenu>
            <OptionsMenuRow label="Help">
              <button onClick={() => setHelpOpen(true)} style={PILL_STYLE} className={pillToggle(true)}>
                What can this do?
              </button>
            </OptionsMenuRow>
            <OptionsMenuRow label="File">
              {confirmingNew ? (
                <>
                  <button
                    onClick={() => {
                      saveDocumentFile(portfolioDocument);
                      onStartNew?.();
                    }}
                    style={PILL_STYLE}
                    className={pillToggle(true)}
                  >
                    {realtime ? "Download a copy & Start New" : "Save & Start New"}
                  </button>
                  <button onClick={() => setConfirmingNew(false)} className="text-[11px] opacity-60 hover:opacity-100">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => saveDocumentFile(portfolioDocument)} style={PILL_STYLE} className={pillToggle(true)}>
                    {/* On a realtime-connected page (wayframe#121) this file-download action is not what saves the edit —
                        useProgramRoom's live sync is — so it reads as "Download a copy" here, never "Save". */}
                    {realtime ? "Download a copy" : "Save"}
                  </button>
                  <button onClick={() => openFileRef.current?.click()} style={PILL_STYLE} className={pillToggle(true)}>
                    Open
                  </button>
                  {onStartNew && (
                    <button onClick={handleStartNew} style={PILL_STYLE} className={pillToggle(true)}>
                      New
                    </button>
                  )}
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
                </>
              )}
            </OptionsMenuRow>
            <OptionsMenuRow label="Export">
              <button
                onClick={() => {
                  setExportInitialDestination(undefined);
                  setExportDialogOpen(true);
                }}
                style={PILL_STYLE}
                className={pillToggle(true)}
              >
                Export to Deck
              </button>
            </OptionsMenuRow>
            <OptionsMenuRow label="Export Snapshots">
              <span className="flex items-center gap-1.5">
                <button onClick={() => setSnapshotsOpen(true)} style={PILL_STYLE} className={pillToggle(true)}>
                  View Export Snapshots ›
                </button>
                <button
                  onClick={() => {
                    setExportInitialDestination("snapshot");
                    setExportDialogOpen(true);
                  }}
                  style={PILL_STYLE}
                  className={pillToggle(true)}
                >
                  Save Export Snapshot ›
                </button>
              </span>
            </OptionsMenuRow>
            {/* Version History (wayframe#128) lives on the combined All-Programs
                surface, not here: a Version captures EVERY Program at once, and
                #127's resolution puts the dock in the same 380px slot as the
                inspector, beside the Program rail that says which Programs
                you're looking at. This row exists so the feature is reachable
                from the single-Program page rather than only findable by
                someone who already knows where it is. Gated on `realtime`
                (not on role) — that's the one signal that says "this is a
                hosted Roadmap with a live room", so the local-only `/` page and
                the `/dev/demo-roadmap` QA route, which have no `/p/<id>/all` to
                open, don't offer a dead link. */}
            {realtime && (
              <OptionsMenuRow label="Version history">
                <Link
                  href={`/p/${box.portfolio.id}/all`}
                  style={PILL_STYLE}
                  className="rounded-full border px-2.5 py-1 text-xs"
                >
                  Open on All Programs ›
                </Link>
              </OptionsMenuRow>
            )}
            {canManageSharing && (
              <OptionsMenuRow label="Sharing">
                <button onClick={() => setSharingOpen(true)} style={PILL_STYLE} className={pillToggle(true)}>
                  Invite / share ›
                </button>
              </OptionsMenuRow>
            )}
            <OptionsMenuSection id="appearance" label="Appearance" open={sections.isOpen("appearance")} onToggle={() => sections.toggle("appearance")}>
              <div>
                <p className="mb-1.5 opacity-70">Theme</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {THEME_LIST.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => box.setThemeBase(t.id)}
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
                <button
                  onClick={() => setThemeCustomizeOpen((o) => !o)}
                  aria-expanded={themeCustomizeOpen}
                  className="mt-1.5 text-[11px] opacity-70 hover:opacity-100"
                >
                  {themeCustomizeOpen ? "Hide customization ›" : "Customize ›"}
                </button>
                {themeCustomizeOpen && (
                  <div className="mt-1.5 space-y-2 rounded-lg border p-2" style={{ borderColor: "var(--wf-border)" }}>
                    <OptionsMenuRow label="Accent">
                      <input
                        type="color"
                        value={theme.accent}
                        onChange={(e) => box.setThemeOverride({ accent: e.target.value })}
                        aria-label="Theme accent color"
                        className="h-6 w-9 rounded border"
                        style={{ borderColor: "var(--wf-border)" }}
                      />
                    </OptionsMenuRow>
                    <OptionsMenuRow label="Today line">
                      <input
                        type="color"
                        value={theme.todayColor}
                        onChange={(e) => box.setThemeOverride({ todayColor: e.target.value })}
                        aria-label="Theme today-line color"
                        className="h-6 w-9 rounded border"
                        style={{ borderColor: "var(--wf-border)" }}
                      />
                    </OptionsMenuRow>
                    <OptionsMenuRow label="Lane wash">
                      <input
                        type="range"
                        min={0}
                        max={0.3}
                        step={0.005}
                        value={theme.laneWashOpacity}
                        onChange={(e) => box.setThemeOverride({ laneWashOpacity: parseFloat(e.target.value) })}
                        aria-label="Lane wash opacity"
                        className="w-20"
                      />
                      <span className="w-10 text-right font-mono opacity-70">{theme.laneWashOpacity.toFixed(3)}</span>
                    </OptionsMenuRow>
                    <OptionsMenuRow label="Lane gutter">
                      <input
                        type="range"
                        min={0}
                        max={20}
                        step={1}
                        value={theme.laneGutter}
                        onChange={(e) => box.setThemeOverride({ laneGutter: parseFloat(e.target.value) })}
                        aria-label="Lane gutter px"
                        className="w-20"
                      />
                      <span className="w-10 text-right font-mono opacity-70">{theme.laneGutter}px</span>
                    </OptionsMenuRow>
                    {/* Lightness/chroma/start-hue are edited and saved as one atomic
                        laneRamp override (wayframe#88/t18's "colour family" control),
                        never as three independently-overridable fields. */}
                    <OptionsMenuRow label="Lane colour family">
                      <span className="flex items-center gap-1 font-mono text-[10px] opacity-70">
                        L
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={theme.laneRamp.L}
                          onChange={(e) => box.setThemeOverride({ laneRamp: { ...theme.laneRamp, L: parseFloat(e.target.value) } })}
                          aria-label="Lane ramp lightness"
                          className="w-12 rounded border px-1"
                          style={{ borderColor: "var(--wf-border)" }}
                        />
                        C
                        <input
                          type="number"
                          min={0}
                          max={0.4}
                          step={0.005}
                          value={theme.laneRamp.C}
                          onChange={(e) => box.setThemeOverride({ laneRamp: { ...theme.laneRamp, C: parseFloat(e.target.value) } })}
                          aria-label="Lane ramp chroma"
                          className="w-12 rounded border px-1"
                          style={{ borderColor: "var(--wf-border)" }}
                        />
                        hue
                        <input
                          type="number"
                          min={0}
                          max={360}
                          step={1}
                          value={theme.laneRamp.startHue}
                          onChange={(e) => box.setThemeOverride({ laneRamp: { ...theme.laneRamp, startHue: parseFloat(e.target.value) } })}
                          aria-label="Lane ramp start hue"
                          className="w-12 rounded border px-1"
                          style={{ borderColor: "var(--wf-border)" }}
                        />
                      </span>
                    </OptionsMenuRow>
                    {portfolioTheme.overrides && Object.keys(portfolioTheme.overrides).length > 0 && (
                      <button onClick={box.clearThemeOverrides} style={PILL_STYLE} className={pillToggle(true)}>
                        Reset overrides
                      </button>
                    )}
                  </div>
                )}
              </div>
              <OptionsMenuRow label="Company logo">
                <button onClick={() => logoFileRef.current?.click()} style={PILL_STYLE} className={pillToggle(true)}>
                  {box.portfolio.companyLogo ? "Replace" : "Upload"}
                </button>
                {box.portfolio.companyLogo && (
                  <button onClick={box.clearCompanyLogo} style={PILL_STYLE} className={pillToggle(true)}>
                    Remove
                  </button>
                )}
                {box.portfolio.companyLogo && (box.portfolio.companyLogo.dx || box.portfolio.companyLogo.dy || (box.portfolio.companyLogo.scale && box.portfolio.companyLogo.scale !== 1)) && (
                  <button onClick={() => box.setCompanyLogoGeometry(0, 0, 1)} style={PILL_STYLE} className={pillToggle(true)}>
                    Reset position
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
              <OptionsMenuRow label="Year color">
                <input
                  type="color"
                  aria-label="Axis Year color"
                  value={axisTiers.yearColor}
                  onChange={(e) => axisTiers.setYearColor(e.target.value)}
                  style={{ borderColor: "var(--wf-border)" }}
                  className="h-6 w-7 shrink-0 cursor-pointer rounded border bg-transparent p-0"
                />
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
            </OptionsMenuSection>
            <OptionsMenuSection id="views" label="Views" open={sections.isOpen("views")} onToggle={() => sections.toggle("views")}>
              {savedViews.views.map((v) => (
                <OptionsMenuRow key={v.id} label={v.name}>
                  <button onClick={() => applyView(v.snapshot)} style={PILL_STYLE} className={pillToggle(true)}>
                    Apply
                  </button>
                  {!v.builtin && (
                    <button onClick={() => savedViews.removeView(v.id)} className="text-[11px] opacity-60 hover:opacity-100">
                      Delete
                    </button>
                  )}
                </OptionsMenuRow>
              ))}
              <OptionsMenuRow label="Save current as…">
                {savingViewName !== null ? (
                  <span className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={savingViewName}
                      onChange={(e) => setSavingViewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && savingViewName.trim()) {
                          savedViews.addView(savingViewName.trim(), currentSnapshot(), nanoid());
                          setSavingViewName(null);
                        }
                        if (e.key === "Escape") setSavingViewName(null);
                      }}
                      aria-label="New view name"
                      style={{ borderColor: "var(--wf-border)" }}
                      className="w-24 rounded border bg-transparent px-1.5 py-0.5 text-xs"
                    />
                    <button
                      onClick={() => {
                        if (savingViewName.trim()) {
                          savedViews.addView(savingViewName.trim(), currentSnapshot(), nanoid());
                          setSavingViewName(null);
                        }
                      }}
                      style={PILL_STYLE}
                      className={pillToggle(true)}
                    >
                      Save
                    </button>
                    <button onClick={() => setSavingViewName(null)} className="text-[11px] opacity-60 hover:opacity-100">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setSavingViewName("")} style={PILL_STYLE} className={pillToggle(true)}>
                    Save view…
                  </button>
                )}
              </OptionsMenuRow>
            </OptionsMenuSection>
            <OptionsMenuSection id="symbols" label="Chart symbols" open={sections.isOpen("symbols")} onToggle={() => sections.toggle("symbols")}>
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
              <OptionsMenuRow label="Delta annotations">
                <button
                  onClick={() => deltaAnnotations.setEnabled(!deltaAnnotations.enabled)}
                  aria-pressed={deltaAnnotations.enabled}
                  aria-label={`Delta annotations: ${deltaAnnotations.enabled ? "On" : "Off"}`}
                  style={PILL_STYLE} className={pillToggle(deltaAnnotations.enabled)}
                >
                  {deltaAnnotations.enabled ? "On" : "Off"}
                </button>
              </OptionsMenuRow>
              {(() => {
                const ghostedCount = box.data.milestones.filter((m) => m.originalDate).length;
                if (ghostedCount === 0) return null;
                // Inline count-based confirm (wayframe#62) — mirrors
                // SwimlaneManager's confirmingId pattern for lane delete: a
                // single click mutating many milestones at once gets a named
                // warning, not a silent bulk action.
                return (
                  <OptionsMenuRow label="Slipped milestones">
                    {confirmingAcceptAll ? (
                      <span className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            box.acceptAllBaselines();
                            setConfirmingAcceptAll(false);
                          }}
                          style={PILL_STYLE}
                          className="rounded-full border px-2.5 py-1 text-xs font-medium"
                        >
                          {`Accept ${ghostedCount}?`}
                        </button>
                        <button onClick={() => setConfirmingAcceptAll(false)} className="text-[11px] opacity-60 hover:opacity-100">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmingAcceptAll(true)} style={PILL_STYLE} className={pillToggle(true)}>
                        {`Accept all (${ghostedCount})`}
                      </button>
                    )}
                  </OptionsMenuRow>
                );
              })()}
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
              <OptionsMenuRow label="Connector shape">
                <select
                  value={connectorStyle.style}
                  onChange={(e) => connectorStyle.setStyle(e.target.value as ConnectorStyle)}
                  aria-label="Connector shape"
                  style={PILL_STYLE}
                  className="rounded-full border px-2 py-1 text-xs"
                >
                  {CONNECTOR_STYLES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </OptionsMenuRow>
              <OptionsMenuRow label="Connector line">
                <select
                  value={connectorLineStyle.dash}
                  onChange={(e) => connectorLineStyle.setDash(e.target.value as ConnectorDash)}
                  aria-label="Connector line style"
                  style={PILL_STYLE}
                  className="rounded-full border px-2 py-1 text-xs"
                >
                  {CONNECTOR_DASHES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </OptionsMenuRow>
              <OptionsMenuRow label="Connector arrow">
                <select
                  value={connectorLineStyle.arrow}
                  onChange={(e) => connectorLineStyle.setArrow(e.target.value as ConnectorArrow)}
                  aria-label="Connector arrowhead"
                  style={PILL_STYLE}
                  className="rounded-full border px-2 py-1 text-xs"
                >
                  {CONNECTOR_ARROWS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </OptionsMenuRow>
              <OptionsMenuRow label="Today overlay">
                <button
                  onClick={() => todayOverlay.setEnabled(!todayOverlay.enabled)}
                  aria-pressed={todayOverlay.enabled}
                  aria-label={`Today overlay: ${todayOverlay.enabled ? "On" : "Off"}`}
                  style={PILL_STYLE} className={pillToggle(todayOverlay.enabled)}
                >
                  {todayOverlay.enabled ? "On" : "Off"}
                </button>
              </OptionsMenuRow>
              <OptionsMenuRow label="Pill progress">
                <select
                  value={pillProgress.style}
                  onChange={(e) => pillProgress.setStyle(e.target.value as PillProgressStyle)}
                  aria-label="Duration-pill percent-complete style"
                  style={PILL_STYLE}
                  className="rounded-full border px-2 py-1 text-xs"
                >
                  {PILL_PROGRESS_STYLES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </OptionsMenuRow>
              <OptionsMenuRow label="Date labels">
                <select
                  value={dateLabelPlacement.placement}
                  onChange={(e) => dateLabelPlacement.setPlacement(e.target.value as DateLabelPlacement)}
                  aria-label="Marker date-label placement"
                  style={PILL_STYLE}
                  className="rounded-full border px-2 py-1 text-xs"
                >
                  {DATE_LABEL_PLACEMENTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </OptionsMenuRow>
              <OptionsMenuRow label="Category fill">
                <button
                  onClick={() => legendCategoryStyle.setEnabled(!legendCategoryStyle.enabled)}
                  aria-pressed={legendCategoryStyle.enabled}
                  aria-label={`Category fill: ${legendCategoryStyle.enabled ? "On" : "Off"}`}
                  style={PILL_STYLE} className={pillToggle(legendCategoryStyle.enabled)}
                >
                  {legendCategoryStyle.enabled ? "On" : "Off"}
                </button>
              </OptionsMenuRow>
            </OptionsMenuSection>
            <OptionsMenuSection id="layout" label="Layout" open={sections.isOpen("layout")} onToggle={() => sections.toggle("layout")}>
              {/* Swimlanes / Outline / Select mode promoted to the top
                  toolbar's icon cluster (wayframe UX-2026-09-18 §4/§5) —
                  removed here rather than duplicated, per that ticket's own
                  "Select mode... buried in options" complaint. */}
              <OptionsMenuRow label="Swimlane owners">
                <button
                  onClick={() => swimlaneOwner.setVisible(!swimlaneOwner.visible)}
                  aria-pressed={swimlaneOwner.visible}
                  aria-label={`Swimlane owners: ${swimlaneOwner.visible ? "Shown" : "Hidden"}`}
                  style={PILL_STYLE} className={pillToggle(swimlaneOwner.visible)}
                >
                  {swimlaneOwner.visible ? "Shown" : "Hidden"}
                </button>
              </OptionsMenuRow>
              <OptionsMenuRow label="Categories">
                <button onClick={() => setCategoriesOpen(true)} style={PILL_STYLE} className={pillToggle(true)}>
                  Add / edit categories
                </button>
              </OptionsMenuRow>
              <OptionsMenuRow label="Fit to screen">
                <button
                  onClick={() => fitToScreen.setEnabled(!fitToScreen.enabled)}
                  aria-pressed={fitToScreen.enabled}
                  aria-label={`Fit to screen: ${fitToScreen.enabled ? "On" : "Off"}`}
                  style={PILL_STYLE} className={pillToggle(fitToScreen.enabled)}
                >
                  {fitToScreen.enabled ? "On" : "Off"}
                </button>
              </OptionsMenuRow>
              <OptionsMenuRow label="Edit lock">
                <button
                  onClick={() => editLock.setMode(editLock.mode === "edit" ? "view" : "edit")}
                  aria-pressed={isViewMode}
                  aria-label={`Edit lock: ${isViewMode ? "View only" : "Editable"}`}
                  style={PILL_STYLE} className={pillToggle(isViewMode)}
                >
                  {isViewMode ? "View only" : "Editable"}
                </button>
              </OptionsMenuRow>
            </OptionsMenuSection>
            <OptionsMenuSection id="data" label="Data" open={sections.isOpen("data")} onToggle={() => sections.toggle("data")}>
              <OptionsMenuRow label="Correction UI">
                <button onClick={() => setCorrectionMode((m) => (m === "bar" ? "sidebar" : "bar"))} style={PILL_STYLE} className={pillToggle(true)}>
                  {correctionMode === "bar" ? "Sidebar mode" : "Bar mode"}
                </button>
              </OptionsMenuRow>
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
            </OptionsMenuSection>
          </OptionsMenu>
        </div>
        <div>
          <RoadmapView
            mode={mode}
            data={renderable}
            today={today}
            deltaAnnotationsEnabled={deltaAnnotations.enabled}
            showCriticalPath={criticalPath.visible}
            criticalPathStyle={criticalPathLine.style}
            theme={theme}
            blufOpen={blufOpen}
            onBlufOpenChange={setBlufOpen}
            onBlufEdit={isViewMode ? undefined : box.editBluf}
            onEditDocument={isViewMode ? undefined : box.editDocument}
            soWhatFillColor={soWhat.color}
            soWhatFillTransparency={soWhat.transparency}
            onMilestoneClick={isViewMode ? undefined : (m) => setSelectedMilestoneId(m.id)}
            onAddMilestone={isViewMode ? undefined : handleAddMilestone}
            onPickShape={isViewMode ? undefined : handlePickShape}
            placementMode={placement}
            onAddTopLevelItem={isViewMode ? undefined : handleAddTopLevelItem}
            topBandStyle={topBand.style}
            periodGridlineStyle={gridlines.style}
            axisTiers={axisTiers.config}
            axisYearColor={axisTiers.yearColor}
            onAxisTiersChange={isViewMode ? undefined : axisTiers.setTiers}
            onMilestoneDateChange={isViewMode ? undefined : box.setMilestoneDate}
            tracedIds={tracedIds}
            labelDensity={labels.density}
            timelineSummary={timelineSummary.summary}
            fontScale={fontScale.scale}
            fontFamily={fontFamily.fontFamily}
            onCompanyLogoChange={isViewMode ? undefined : (patch) => box.setCompanyLogoGeometry(patch.dx, patch.dy, patch.scale)}
            connectorStyle={connectorStyle.style}
            connectorDash={connectorLineStyle.dash}
            connectorArrow={connectorLineStyle.arrow}
            todayOverlayEnabled={todayOverlay.enabled}
            pillProgressStyle={pillProgress.style}
            fitToScreen={fitToScreen.enabled}
            dateLabelPlacement={dateLabelPlacement.placement}
            legendCategoryFillEnabled={legendCategoryStyle.enabled}
            isCategoryHidden={hiddenCategories.isHidden}
            swimlaneOwnerVisible={swimlaneOwner.visible}
            onMilestoneDateRangeChange={isViewMode ? undefined : box.setMilestoneDateRange}
            selectionModeEnabled={selectMode && !isViewMode}
            selectedIds={selection.selectedIds}
            onToggleSelect={selection.toggle}
            onMarqueeSelect={selection.addAll}
            zoom={zoom}
            onToggleGroupCollapsed={
              isViewMode
                ? undefined
                : (groupId) => {
                    const group = renderable.swimlaneGroups?.find((g) => g.id === groupId);
                    box.setSwimlaneGroupCollapsed(groupId, !group?.collapsed);
                  }
            }
            legend={
              <ChartLegend
                theme={theme}
                criticalPathStyle={criticalPathLine.style}
                showCriticalPath={criticalPath.visible}
                deltaAnnotationsEnabled={deltaAnnotations.enabled}
                tracing={trace !== null}
                hasDurations={box.data.milestones.some((m) => m.endDate)}
                categories={renderable.legendCategories}
                hiddenCategoryIds={hiddenCategories.hiddenIds}
                onToggleCategory={hiddenCategories.toggle}
                onAddCategory={box.addCategory}
                onRenameCategory={box.renameCategory}
                onRecolorCategory={box.recolorCategory}
              />
            }
            onTopLevelItemClick={(t) => setSelectedTopLevelItemId(t.id)}
            remoteSelections={remoteSelections}
          />
        </div>
      </div>
      <CorrectionBoxSwitcher box={box} mode={correctionMode} onNeedsEditor={handleNeedsEditor} />
      {/* Tree-driven and modifier-click-driven selection both surface the
          mass-edit toolbar now (wayframe UX-2026-09-18 §4) — gated on
          "something is actually selected," not on Select mode being armed
          (that mode only gates the lane-background marquee drag now). */}
      {selection.selectedIds.size > 0 && !isViewMode && <SelectionToolbar data={box.data} selection={selection} onBulkEdit={box.bulkEdit} />}
      <MilestoneEditorInspector
        data={renderable}
        theme={theme}
        milestone={selectedMilestone}
        onSave={box.editMilestone}
        onClose={() => setSelectedMilestoneId(null)}
        onDelete={handleDeleteMilestone}
        onToggleDependency={box.toggleDependency}
        onEditAttachments={box.editAttachments}
        onAcceptBaseline={box.acceptBaseline}
        onTrace={(direction) => {
          if (selectedMilestoneId) setTrace({ rootId: selectedMilestoneId, direction });
          setSelectedMilestoneId(null);
        }}
        onSetCategory={box.setMilestoneCategory}
        legendCategoryFillEnabled={legendCategoryStyle.enabled}
        onSetStyleOverride={box.setMilestoneStyleOverride}
        onClearStyleOverride={box.clearMilestoneStyleOverride}
        onSetLaneRow={box.setMilestoneLaneRow}
      />
      <TopLevelItemEditorInspector
        item={selectedTopLevelItem}
        data={renderable}
        theme={theme}
        legendCategoryFillEnabled={legendCategoryStyle.enabled}
        onSave={box.editTopLevelItem}
        onClose={() => setSelectedTopLevelItemId(null)}
        onDelete={handleDeleteTopLevelItem}
        onSetStyleOverride={box.setTopLevelItemStyleOverride}
        onClearStyleOverride={box.clearTopLevelItemStyleOverride}
      />
      {importOpen && <ImportPanel data={box.data} onExtracted={box.loadDocument} onMerge={box.importMerge} onClose={() => setImportOpen(false)} />}
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
          onDensity={box.setLaneDensity}
          onHidden={box.setLaneHidden}
          onAddGroup={box.addSwimlaneGroup}
          onRenameGroup={box.renameSwimlaneGroup}
          onRemoveGroup={box.removeSwimlaneGroup}
          onMoveGroup={box.moveSwimlaneGroup}
          onGroupColor={box.setSwimlaneGroupColor}
          onToggleGroupCollapsed={box.setSwimlaneGroupCollapsed}
          onAssignGroup={box.setSwimlaneGroupId}
          onClose={() => setLanesOpen(false)}
        />
      )}
      {outlineOpen && (
        <OutlineTree
          data={box.data}
          theme={theme}
          selection={selection}
          onMove={box.moveSwimlane}
          onMoveGroup={box.moveSwimlaneGroup}
          onAssignGroup={box.setSwimlaneGroupId}
          onSetGroupParentId={box.setSwimlaneGroupParentId}
          onHidden={box.setLaneHidden}
          onToggleGroupCollapsed={box.setSwimlaneGroupCollapsed}
          onBulkEdit={box.bulkEdit}
          onClose={() => setOutlineOpen(false)}
        />
      )}
      {categoriesOpen && (
        <CategoryManager
          data={renderable}
          onAdd={box.addCategory}
          onRename={box.renameCategory}
          onRecolor={box.recolorCategory}
          onRemove={box.removeCategory}
          onClose={() => setCategoriesOpen(false)}
        />
      )}
      {sharingOpen && canManageSharing && <SharePanel portfolioId={box.portfolio.id} onClose={() => setSharingOpen(false)} />}
      {exportDialogOpen && (
        <ExportDialog
          portfolio={box.portfolio}
          currentProgram={box.data}
          currentRenderable={renderable}
          theme={theme}
          timelineSummary={timelineSummary.summary}
          zoom={zoom}
          renderPrefs={{ legendCategoryFillEnabled: legendCategoryStyle.enabled }}
          onAddScenario={box.addScenario}
          onClose={() => setExportDialogOpen(false)}
          initialDestination={exportInitialDestination}
        />
      )}
      {snapshotsOpen && (
        <SnapshotsPanel
          portfolioId={box.portfolio.id}
          onClose={() => setSnapshotsOpen(false)}
          onCreate={() => {
            setSnapshotsOpen(false);
            setExportInitialDestination("snapshot");
            setExportDialogOpen(true);
          }}
        />
      )}
    </div>
  );
}
