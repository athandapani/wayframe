"use client";

// Export scope, selection & viewport determinism (wayframe t29) — replaces
// the old always-both-views "Export to Deck" button with a dialog offering 5
// independent, non-exclusive sections (Combined Programs/Baseline, Individual
// Programs/Baseline, Executive, Scenario Combined, Scenario Program view).
// Modal shape copied from SharePanel.tsx (fixed backdrop, --wf-* themed card,
// role="dialog", ✕ close). The actual slide-order/data-assembly logic lives
// in the DOM-free build-export-slides.ts so it's unit-testable without
// mounting anything; this component only owns the UI and the off-screen
// html2canvas capture.
import { useEffect, useRef, useState } from "react";
import type { Portfolio, Program, RenderableProgram } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import type { UseZoomWindowResult } from "@/components/timeline/use-zoom-window";
import type { ExecutiveTimelineSummary } from "@/components/executive-view/timeline-summary";
import type { CriticalPathStyle } from "@/components/timeline/use-critical-path-style";
import type { TopBandStyle } from "@/components/timeline/use-top-band-style";
import type { PeriodGridlineStyle } from "@/components/timeline/use-period-gridlines";
import type { AxisTierConfig } from "@/components/timeline/axis-tiers";
import type { LabelDensity } from "@/components/timeline/title-layout";
import type { ConnectorStyle } from "@/components/timeline/use-connector-style";
import type { ConnectorDash, ConnectorArrow } from "@/components/timeline/use-connector-line-style";
import type { PillProgressStyle } from "@/components/timeline/use-pill-progress-style";
import type { DateLabelPlacement } from "@/components/timeline/use-date-label-placement";
import { buildExportSlides, type ExportSelection, type ExportSlideDescriptor } from "@/lib/export/build-export-slides";
import { exportToDeck, type DeckSlideSource } from "@/lib/export/export-to-deck";
import { RoadmapView, deckFileName, OFFSCREEN_CLASS } from "./RoadmapWorkspace";

interface AllProgramsResponse {
  programs: Program[];
}

/**
 * Every viewer-preference prop that affects how a Program-mode slide renders
 * on screen — threaded straight through to the off-screen capture for every
 * slide so an exported deck matches what the user is actually looking at,
 * not some default appearance. Mirrors exactly what the old single-pair
 * off-screen capture in RoadmapWorkspace.tsx used to pass.
 */
export interface ExportRenderPrefs {
  blufOpen: boolean;
  deltaAnnotationsEnabled: boolean;
  showCriticalPath: boolean;
  criticalPathStyle: CriticalPathStyle;
  topBandStyle: TopBandStyle;
  periodGridlineStyle: PeriodGridlineStyle;
  axisTiers: AxisTierConfig;
  axisYearColor: string;
  labelDensity: LabelDensity;
  soWhatFillColor: string | null;
  soWhatFillTransparency: number;
  fontScale: number;
  fontFamily: string | undefined;
  connectorStyle: ConnectorStyle;
  connectorDash: ConnectorDash;
  connectorArrow: ConnectorArrow;
  todayOverlayEnabled: boolean;
  pillProgressStyle: PillProgressStyle;
  fitToScreen: boolean;
  dateLabelPlacement: DateLabelPlacement;
  legendCategoryFillEnabled: boolean;
  swimlaneOwnerVisible: boolean;
}

/** The checkbox/dropdown state this component owns directly — the two Program-id Sets are tracked separately (see individualIdsOverride/scenarioProgramIdsOverride below) so their "default to every known Program" behavior doesn't need a state-syncing effect. */
type SelectionCore = Omit<ExportSelection, "individualBaselineProgramIds" | "scenarioProgramProgramIds">;

function emptySelectionCore(): SelectionCore {
  return { executive: false, combinedBaseline: false, individualBaseline: false, scenarioId: null, scenarioCombined: false, scenarioProgram: false };
}

function hasAnySelection(selection: SelectionCore): boolean {
  return selection.executive || selection.combinedBaseline || selection.individualBaseline || selection.scenarioCombined || selection.scenarioProgram;
}

/**
 * Deck filename rule (t29's gist): the Portfolio/document-name convention it
 * calls for has nothing real to read (no `Portfolio.name` field exists
 * anywhere in this codebase) — so this falls back to a generic name, except
 * when the export resolves to exactly one Program-scoped section producing
 * exactly one Program slide, where today's single-Program-name convention is
 * kept (using that one slide's own label, not necessarily the currently-open
 * Program, in case the export targets a different single Program).
 */
function computeFileName(currentProgramName: string, slides: ExportSlideDescriptor[], selection: ExportSelection): string {
  const programScopedCheckedCount = [selection.combinedBaseline, selection.individualBaseline, selection.scenarioCombined, selection.scenarioProgram].filter(Boolean).length;
  const programSlides = slides.filter((s) => s.mode === "program");
  if (programScopedCheckedCount === 1 && programSlides.length === 1) {
    return deckFileName(programSlides[0].label ?? currentProgramName);
  }
  return deckFileName("Portfolio Roadmap");
}

export function ExportDialog({
  portfolio,
  currentProgram,
  currentRenderable,
  theme,
  today,
  timelineSummary,
  zoom,
  renderPrefs,
  onAddScenario,
  onClose,
}: {
  portfolio: Portfolio;
  currentProgram: Program;
  currentRenderable: RenderableProgram;
  theme: Theme;
  today: Date;
  timelineSummary: ExecutiveTimelineSummary | null;
  zoom: UseZoomWindowResult;
  renderPrefs: ExportRenderPrefs;
  onAddScenario: (name: string) => void;
  onClose: () => void;
}) {
  // Sibling Programs for the Combined/Individual sections — a one-shot fetch
  // of the same route the t26 /all page uses. Falls back to just the current
  // Program (same "N=1 degrades gracefully" posture t26 already established)
  // when this isn't a hosted multi-Program Portfolio at all — the local/
  // unauthenticated demo mode has no real Portfolio row for this route to
  // read, and that's not an error state, just a smaller deck.
  const [allPrograms, setAllPrograms] = useState<Program[]>([currentProgram]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portfolios/${portfolio.id}/all-programs`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as AllProgramsResponse;
        if (!cancelled && Array.isArray(body.programs) && body.programs.length > 0) setAllPrograms(body.programs);
      })
      .catch(() => {
        // Local/unauthenticated mode, or a transient network error — the
        // [currentProgram] fallback already set above stands.
      });
    return () => {
      cancelled = true;
    };
  }, [portfolio.id]);

  // `null` means "not yet touched by the user" — defaults to every currently
  // known Program (the gist's "default all-checked") without needing an
  // effect to re-sync a stored copy every time the sibling-Programs fetch
  // above resolves. Once the user toggles any one checkbox, this becomes a
  // concrete Set from then on.
  const [individualIdsOverride, setIndividualIdsOverride] = useState<Set<string> | null>(null);
  const [scenarioProgramIdsOverride, setScenarioProgramIdsOverride] = useState<Set<string> | null>(null);
  const allProgramIds = new Set(allPrograms.map((p) => p.id));
  const individualBaselineProgramIds = individualIdsOverride ?? allProgramIds;
  const scenarioProgramProgramIds = scenarioProgramIdsOverride ?? allProgramIds;

  const [selection, setSelection] = useState<SelectionCore>(emptySelectionCore());

  const scenarios = portfolio.scenarios ?? [];
  const hasScenarios = scenarios.length > 0;
  // Defaults to the first available Scenario once any exist, computed at
  // render time rather than synced into state via an effect — the shared
  // dropdown isn't left pointing at nothing the moment a Scenario checkbox
  // becomes checkable, and an explicit user pick (stored in
  // `selection.scenarioId`) still wins once made.
  const effectiveScenarioId = selection.scenarioId ?? scenarios[0]?.id ?? null;
  const selectedScenario = scenarios.find((s) => s.id === effectiveScenarioId) ?? null;

  const [newScenarioOpen, setNewScenarioOpen] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");

  function commitNewScenario() {
    const name = newScenarioName.trim();
    if (!name) return;
    onAddScenario(name);
    setNewScenarioOpen(false);
    setNewScenarioName("");
  }

  const [exporting, setExporting] = useState(false);
  const [exportSlides, setExportSlides] = useState<ExportSlideDescriptor[] | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  async function handleExportClick() {
    if (exporting || !hasAnySelection(selection)) return;
    const fullSelection: ExportSelection = { ...selection, scenarioId: effectiveScenarioId, individualBaselineProgramIds, scenarioProgramProgramIds };
    const slides = buildExportSlides({
      portfolio,
      currentRenderable,
      timelineSummary,
      allPrograms,
      scenario: selectedScenario,
      selection: fullSelection,
    });
    if (slides.length === 0) return;
    setExporting(true);
    slideRefs.current = new Array(slides.length).fill(null);
    setExportSlides(slides);
    try {
      // Two rAFs so the just-mounted off-screen slides have actually painted
      // before html2canvas captures them — same wait the old single-pair
      // export used.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const sources: DeckSlideSource[] = slides.map((slide, i) => ({ label: slide.label, element: slideRefs.current[i]! })).filter((s) => s.element);
      await exportToDeck(sources, computeFileName(currentProgram.programName, slides, fullSelection));
      onClose();
    } finally {
      setExporting(false);
      setExportSlides(null);
    }
  }

  // Every off-screen slide renders at the same current on-screen committed
  // zoom domain (t29's gist: WYSIWYG viewport, never full document extent) —
  // one shared value reused for every program-mode slide, not recomputed per
  // Program/Combined-view.
  const domainOverride = zoom.active ? zoom.committedWindow : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)", borderWidth: 1 }}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Export to Deck"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--wf-border)" }}>
          <div>
            <h1 className="text-base font-semibold">Export to Deck</h1>
            <p className="text-xs opacity-60">Choose which slides to include — each section adds its own slide(s) to one .pptx.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={selection.executive} onChange={(e) => setSelection((s) => ({ ...s, executive: e.target.checked }))} />
            Executive slide
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={selection.combinedBaseline} onChange={(e) => setSelection((s) => ({ ...s, combinedBaseline: e.target.checked }))} />
            Combined Programs (Baseline)
          </label>

          <div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selection.individualBaseline} onChange={(e) => setSelection((s) => ({ ...s, individualBaseline: e.target.checked }))} />
              Individual Programs (Baseline)
            </label>
            {selection.individualBaseline && <ProgramMultiSelect programs={allPrograms} selectedIds={individualBaselineProgramIds} onChange={setIndividualIdsOverride} />}
          </div>

          <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--wf-border)" }}>
            <div className="flex items-center gap-2">
              <label htmlFor="export-scenario-select" className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Scenario
              </label>
              <select
                id="export-scenario-select"
                aria-label="Scenario"
                value={effectiveScenarioId ?? ""}
                disabled={!hasScenarios}
                onChange={(e) => setSelection((s) => ({ ...s, scenarioId: e.target.value || null }))}
                className="rounded-full border px-2 py-1 text-xs disabled:opacity-40"
                style={{ borderColor: "var(--wf-border)", background: "var(--wf-panel)", color: "var(--wf-ink)" }}
              >
                {!hasScenarios && <option value="">No Scenarios yet</option>}
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {newScenarioOpen ? (
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newScenarioName}
                    onChange={(e) => setNewScenarioName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitNewScenario();
                      if (e.key === "Escape") setNewScenarioOpen(false);
                    }}
                    aria-label="New Scenario name"
                    placeholder="Scenario name"
                    style={{ borderColor: "var(--wf-border)" }}
                    className="w-28 rounded border bg-transparent px-1.5 py-0.5 text-xs"
                  />
                  <button onClick={commitNewScenario} className="text-[11px] font-medium">
                    Save
                  </button>
                  <button onClick={() => setNewScenarioOpen(false)} className="text-[11px] opacity-60 hover:opacity-100">
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setNewScenarioOpen(true)} className="text-[11px] opacity-70 hover:opacity-100">
                  + New Scenario
                </button>
              )}
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selection.scenarioCombined}
                disabled={!hasScenarios}
                onChange={(e) => setSelection((s) => ({ ...s, scenarioCombined: e.target.checked }))}
                className="disabled:opacity-40"
              />
              Scenario: Combined
            </label>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selection.scenarioProgram}
                  disabled={!hasScenarios}
                  onChange={(e) => setSelection((s) => ({ ...s, scenarioProgram: e.target.checked }))}
                  className="disabled:opacity-40"
                />
                Scenario: Program view
              </label>
              {selection.scenarioProgram && <ProgramMultiSelect programs={allPrograms} selectedIds={scenarioProgramProgramIds} onChange={setScenarioProgramIdsOverride} />}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4" style={{ borderColor: "var(--wf-border)" }}>
          <button
            onClick={handleExportClick}
            disabled={exporting || !hasAnySelection(selection)}
            style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
            className="rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>

      {/* Off-screen capture mount — one plain, non-interactive RoadmapView
          per slide descriptor, every on-screen-only callback prop omitted
          just like the old single-pair off-screen capture did, and every
          viewer-preference prop (renderPrefs) threaded through so the
          exported slides visually match the on-screen view. Every
          program-mode slide shares the same domainOverride (the current
          on-screen committed zoom window), fixing the old bug where the
          off-screen render always showed the full document regardless of
          the visible view's zoom. The executive-mode slide gets
          `timelineSummary`, fixing the old bug where it silently never did. */}
      {exportSlides && (
        <div className={OFFSCREEN_CLASS} aria-hidden="true" inert>
          {exportSlides.map((slide, i) => (
            <div
              key={i}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
            >
              <RoadmapView
                mode={slide.mode}
                data={slide.data}
                today={today}
                theme={theme}
                blufOpen={renderPrefs.blufOpen}
                onBlufOpenChange={() => {}}
                deltaAnnotationsEnabled={renderPrefs.deltaAnnotationsEnabled}
                showCriticalPath={renderPrefs.showCriticalPath}
                criticalPathStyle={renderPrefs.criticalPathStyle}
                topBandStyle={renderPrefs.topBandStyle}
                periodGridlineStyle={renderPrefs.periodGridlineStyle}
                axisTiers={renderPrefs.axisTiers}
                axisYearColor={renderPrefs.axisYearColor}
                labelDensity={renderPrefs.labelDensity}
                soWhatFillColor={renderPrefs.soWhatFillColor}
                soWhatFillTransparency={renderPrefs.soWhatFillTransparency}
                fontScale={renderPrefs.fontScale}
                fontFamily={renderPrefs.fontFamily}
                connectorStyle={renderPrefs.connectorStyle}
                connectorDash={renderPrefs.connectorDash}
                connectorArrow={renderPrefs.connectorArrow}
                todayOverlayEnabled={renderPrefs.todayOverlayEnabled}
                pillProgressStyle={renderPrefs.pillProgressStyle}
                fitToScreen={renderPrefs.fitToScreen}
                dateLabelPlacement={renderPrefs.dateLabelPlacement}
                legendCategoryFillEnabled={renderPrefs.legendCategoryFillEnabled}
                swimlaneOwnerVisible={renderPrefs.swimlaneOwnerVisible}
                chartWidth={slide.mode === "program" ? 1600 : undefined}
                domainOverride={slide.mode === "program" ? domainOverride : undefined}
                timelineSummary={slide.mode === "executive" ? slide.timelineSummary : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgramMultiSelect({ programs, selectedIds, onChange }: { programs: Program[]; selectedIds: Set<string>; onChange: (ids: Set<string>) => void }) {
  return (
    <div className="mt-1.5 ml-6 space-y-1">
      {programs.map((p) => (
        <label key={p.id} className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={selectedIds.has(p.id)}
            onChange={(e) => {
              const next = new Set(selectedIds);
              if (e.target.checked) next.add(p.id);
              else next.delete(p.id);
              onChange(next);
            }}
          />
          {p.programName}
        </label>
      ))}
    </div>
  );
}
