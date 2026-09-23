"use client";

// Export scope, selection & viewport determinism (wayframe t29) — replaces
// the old always-both-views "Export to Deck" button with a dialog offering 5
// independent, non-exclusive sections (Combined Programs/Baseline, Individual
// Programs/Baseline, Executive, Scenario Combined, Scenario Program view).
// Modal shape copied from SharePanel.tsx (fixed backdrop, --wf-* themed card,
// role="dialog", ✕ close). The actual slide-order/data-assembly logic lives
// in the DOM-free build-export-slides.ts so it's unit-testable without
// mounting anything.
//
// Destination toggle (wayframe t30): both destinations now render the same
// native-shape `Slide` IR (renderable-to-slide.ts + deck-ir.ts) instead of
// the old html2canvas per-slide screenshot capture — deck-ir.ts's own header
// comment named t30 as the ticket that would replace that path, and this is
// it. "Download .pptx" compiles the IR locally via `compileToPptxOps` +
// pptxgenjs (export-native-deck.ts); "Send to Google Slides" posts the same
// IR to `/api/google/slides-export`, which compiles it server-side via
// `compileToSlidesRequests` against the real Slides API (t30's Fork 3). The
// old image-based `exportToDeck`/`export-to-deck.ts` is left in place,
// unused, as a fallback — nobody has been able to visually confirm the
// native renderer's actual on-slide appearance in a real browser this
// session (see this project's standing claude-in-chrome-can't-reach-
// localhost limitation), so reverting is a one-line change if it turns out
// to look wrong.
import { useEffect, useState } from "react";
import type { Portfolio, Program, RenderableProgram } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import type { UseZoomWindowResult } from "@/components/timeline/use-zoom-window";
import type { ExecutiveTimelineSummary } from "@/components/executive-view/timeline-summary";
import { buildExportSlides, type ExportSelection, type ExportSlideDescriptor } from "@/lib/export/build-export-slides";
import { computeDomain } from "@/components/timeline/RoadmapTimeline";
import { buildExecutiveSlideIR, buildSlideIR } from "@/lib/export/renderable-to-slide";
import { exportNativeDeckFromSlides } from "@/lib/export/export-native-deck";
import type { Slide } from "@/lib/export/deck-ir";
import { openPlaceholderPopup, runConsentInPopup } from "@/lib/auth/slides-consent-popup";
import { openDrivePicker, type PickedDriveFolder } from "@/lib/google/drive-picker";
import { deckFileName } from "./RoadmapWorkspace";

export type ExportDestination = "pptx" | "slides" | "snapshot";

interface AllProgramsResponse {
  programs: Program[];
}

/**
 * The one viewer preference the native-shape IR translator (renderable-to-
 * slide.ts) actually reads — everything else this bag used to carry
 * (critical-path line style, connector dash/arrow, font family/scale, axis
 * tiers, BLUF-open state, ...) only ever mattered to the old html2canvas
 * DOM-capture path, which rendered the real on-screen `RoadmapView`/
 * `RoadmapTimeline` component tree with those preferences applied. The IR
 * translator doesn't render that component tree at all — it resolves
 * marker/phase style straight from the document via style-resolution.ts's
 * t19 ladder, so those viewer-only preferences (as opposed to document
 * content) have nothing left to plug into. wayframe#t30 removed the ~20
 * now-dead fields (and RoadmapWorkspace.tsx's now-dead pass-through of them)
 * along with the DOM-capture path itself, rather than leaving them wired to
 * nothing.
 */
export interface ExportRenderPrefs {
  legendCategoryFillEnabled: boolean;
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
  timelineSummary,
  zoom,
  renderPrefs,
  onAddScenario,
  onClose,
  initialDestination,
}: {
  portfolio: Portfolio;
  currentProgram: Program;
  currentRenderable: RenderableProgram;
  theme: Theme;
  timelineSummary: ExecutiveTimelineSummary | null;
  zoom: UseZoomWindowResult;
  renderPrefs: ExportRenderPrefs;
  onAddScenario: (name: string) => void;
  onClose: () => void;
  /** Opens the dialog with this destination pre-selected (wayframe UX-2026-09-18 §8) — "Save Export Snapshot ›" next to "View Export Snapshots ›" opens straight onto the section-picker with "snapshot" already chosen, one click closer than picking it off the 3-way radio by hand. Defaults to "pptx", same as before this prop existed. */
  initialDestination?: ExportDestination;
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

  const [destination, setDestination] = useState<ExportDestination>(initialDestination ?? "pptx");
  const [exporting, setExporting] = useState(false);
  const [exportStage, setExportStage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [slidesResultUrl, setSlidesResultUrl] = useState<string | null>(null);
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [rememberedFolder, setRememberedFolder] = useState<PickedDriveFolder | null>(null);
  const [forcePicker, setForcePicker] = useState(false);
  // A resumable retry, set only when the automatic re-consent-and-retry after
  // a mid-export `no_valid_token` couldn't open its popup (see
  // `sendToGoogleSlides` below) — a fresh click on this button is a real user
  // gesture, so it can open a popup even where the automatic attempt
  // couldn't. Keeps the "no dead-end error state" promise even in that rare
  // race, at the cost of the one extra click the gist otherwise avoids.
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);

  // Fetches the remembered Drive folder (t30's "last-picked folder, reused
  // silently by default") once the user actually selects the Slides
  // destination — no need to ask before then.
  useEffect(() => {
    if (destination !== "slides") return;
    let cancelled = false;
    fetch("/api/google/drive-folder")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { folder: PickedDriveFolder | null };
        if (!cancelled) setRememberedFolder(body.folder ?? null);
      })
      .catch(() => {
        // No remembered folder yet, or a transient network error — either
        // way the Picker step below just runs as if nothing was remembered.
      });
    return () => {
      cancelled = true;
    };
  }, [destination]);

  // Every program-mode slide falls back to ITS OWN content's domain when no
  // zoom window is committed — mirrors RoadmapTimeline's own per-render
  // `domainOverride ? ... : computeDomain(data)` fallback exactly (see its
  // definition), since different slides (Combined vs. one Program vs. a
  // Scenario-resolved Program) can have different natural date ranges. Only
  // when a zoom window IS committed do all program-mode slides share it, for
  // the same WYSIWYG-viewport reason t29's original comment already gave.
  function domainForSlide(data: RenderableProgram): { domainMin: number; domainMax: number } {
    if (zoom.active) return { domainMin: zoom.committedWindow.min, domainMax: zoom.committedWindow.max };
    return computeDomain(data);
  }

  function buildSlideIRs(slides: ExportSlideDescriptor[]): Slide[] {
    return slides.map((slide) =>
      slide.mode === "executive"
        ? buildExecutiveSlideIR({ renderable: slide.data, theme, summary: slide.timelineSummary ?? null, title: slide.label })
        : buildSlideIR({ renderable: slide.data, theme, domain: domainForSlide(slide.data), legendCategoryFillEnabled: renderPrefs.legendCategoryFillEnabled, title: slide.label }),
    );
  }

  /**
   * The full t30 flow: valid-token check (re-consent via `placeholderPopup`
   * if needed) → Picker only when no folder is remembered or the user asked
   * to change it → POST the IR to `/api/google/slides-export`. `403
   * {error:"no_valid_token"}` from that POST itself (the grant could die in
   * the gap between the check above and the actual write) triggers one
   * automatic re-consent-and-retry, per the gist's "no extra click" — unless
   * that retry's own popup gets blocked, in which case `pendingRetry` hands
   * the user one explicit "Reconnect" button instead of a silent dead end.
   */
  async function sendToGoogleSlides(slides: Slide[], fileName: string, placeholderPopup: Window | null) {
    setExportStage("Checking Google access…");
    const statusRes = await fetch("/api/google/slides-token-status");
    const statusBody = (statusRes.ok ? await statusRes.json().catch(() => ({ ok: false })) : { ok: false }) as { ok: boolean };

    if (!statusBody.ok) {
      if (!placeholderPopup) {
        setExportError("Enable popups for this site to send to Google Slides, then try again.");
        return;
      }
      setExportStage("Connecting to Google…");
      const granted = await runConsentInPopup(placeholderPopup);
      if (!granted) {
        setExportError("Google sign-in was cancelled.");
        return;
      }
    } else {
      placeholderPopup?.close();
    }

    let driveFolderId = rememberedFolder?.folderId;
    if (!driveFolderId || forcePicker) {
      setExportStage("Choose a destination folder…");
      const tokenRes = await fetch("/api/google/access-token");
      if (tokenRes.ok) {
        const { accessToken } = (await tokenRes.json()) as { accessToken: string };
        const picked = await openDrivePicker(accessToken);
        if (picked) {
          driveFolderId = picked.folderId;
          setRememberedFolder(picked);
          fetch("/api/google/drive-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId: picked.folderId, folderName: picked.folderName }),
          }).catch(() => {});
        }
        // A cancelled pick (or no Picker API key configured) just proceeds
        // without a folder — the deck still lands in the user's My Drive root.
      }
      setForcePicker(false);
    }

    setExportStage("Creating deck…");
    const postExport = () =>
      fetch("/api/google/slides-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides, fileName, driveFolderId }),
      });

    let res = await postExport();
    if (res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === "no_valid_token") {
        const retryPopup = openPlaceholderPopup();
        if (!retryPopup) {
          setExportError("Google access expired mid-export.");
          setPendingRetry(() => () => {
            const resumedPopup = openPlaceholderPopup();
            if (!resumedPopup) return;
            setExportError(null);
            setExporting(true);
            sendToGoogleSlides(slides, fileName, resumedPopup)
              .catch((err) => setExportError(err instanceof Error ? err.message : "Export failed."))
              .finally(() => {
                setExporting(false);
                setExportStage(null);
              });
          });
          return;
        }
        setExportStage("Reconnecting to Google…");
        const granted = await runConsentInPopup(retryPopup);
        if (!granted) {
          setExportError("Google sign-in was cancelled.");
          return;
        }
        setExportStage("Creating deck…");
        res = await postExport();
      }
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      setExportError(body.detail ?? body.error ?? "Export failed.");
      return;
    }

    const body = (await res.json()) as { presentationUrl: string };
    setSlidesResultUrl(body.presentationUrl);
  }

  /**
   * wayframe#t31: persists the same IR the other two destinations already
   * built to the hosted DB instead of delivering it externally. `selection`'s
   * two `Set<string>` fields are converted to arrays first — `JSON.stringify`
   * would otherwise silently flatten a `Set` to `{}` over the wire.
   */
  async function saveSnapshot(slides: Slide[], selection: ExportSelection) {
    setExportStage("Saving Export Snapshot…");
    const serializedSelection = {
      ...selection,
      individualBaselineProgramIds: [...selection.individualBaselineProgramIds],
      scenarioProgramProgramIds: [...selection.scenarioProgramProgramIds],
    };
    const res = await fetch(`/api/portfolios/${portfolio.id}/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection: serializedSelection, slides }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      setExportError(body.detail ?? body.error ?? "Save failed.");
      return;
    }
    setSnapshotSaved(true);
  }

  async function handleExportClick() {
    if (exporting || !hasAnySelection(selection)) return;
    // Must happen synchronously, before any `await` below — most browsers
    // only allow `window.open` while still inside the original click's user
    // activation window (see slides-consent-popup.ts's own doc).
    const placeholderPopup = destination === "slides" ? openPlaceholderPopup() : null;

    const fullSelection: ExportSelection = { ...selection, scenarioId: effectiveScenarioId, individualBaselineProgramIds, scenarioProgramProgramIds };
    const slides = buildExportSlides({
      portfolio,
      currentRenderable,
      timelineSummary,
      allPrograms,
      scenario: selectedScenario,
      selection: fullSelection,
    });
    if (slides.length === 0) {
      placeholderPopup?.close();
      return;
    }

    setExportError(null);
    setSlidesResultUrl(null);
    setSnapshotSaved(false);
    setPendingRetry(null);
    setExporting(true);
    try {
      const slideIR = buildSlideIRs(slides);

      if (destination === "snapshot") {
        await saveSnapshot(slideIR, fullSelection);
        return;
      }

      const fileName = computeFileName(currentProgram.programName, slides, fullSelection);

      if (destination === "pptx") {
        setExportStage("Creating deck…");
        await exportNativeDeckFromSlides(slideIR, fileName);
        onClose();
        return;
      }

      await sendToGoogleSlides(slideIR, fileName, placeholderPopup);
    } catch (err) {
      placeholderPopup?.close();
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
      setExportStage(null);
    }
  }

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
            <p className="text-xs opacity-60">Choose which slides to include, then pick a destination below.</p>
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

        <div className="space-y-3 border-t p-4" style={{ borderColor: "var(--wf-border)" }}>
          {slidesResultUrl ? (
            <div className="flex items-center justify-between gap-3 text-xs">
              <a href={slidesResultUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--wf-accent)" }}>
                Open the new Google Slides deck
              </a>
              <button onClick={onClose} className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}>
                Done
              </button>
            </div>
          ) : snapshotSaved ? (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span>Export Snapshot saved.</span>
              <button onClick={onClose} className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}>
                Done
              </button>
            </div>
          ) : (
            <>
              <fieldset className="flex items-center gap-4 text-xs">
                <legend className="sr-only">Destination</legend>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="export-destination" checked={destination === "pptx"} onChange={() => setDestination("pptx")} />
                  Download .pptx
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="export-destination" checked={destination === "slides"} onChange={() => setDestination("slides")} />
                  Send to Google Slides
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="export-destination" checked={destination === "snapshot"} onChange={() => setDestination("snapshot")} />
                  Save Export Snapshot
                </label>
                {destination === "slides" && rememberedFolder && !forcePicker && (
                  <button onClick={() => setForcePicker(true)} className="opacity-70 hover:opacity-100">
                    Change destination ({rememberedFolder.folderName})
                  </button>
                )}
              </fieldset>

              {exportError && (
                <div className="flex items-center justify-between gap-3 text-xs" style={{ color: "#c8102e" }}>
                  <span>{exportError}</span>
                  {pendingRetry && (
                    <button onClick={() => pendingRetry()} className="shrink-0 rounded-full border px-2 py-1 font-medium" style={{ borderColor: "var(--wf-border)" }}>
                      Reconnect
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={handleExportClick}
                  disabled={exporting || !hasAnySelection(selection)}
                  style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
                  className="rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                >
                  {exporting ? (exportStage ?? "Exporting…") : destination === "slides" ? "Send to Slides" : destination === "snapshot" ? "Save Export Snapshot" : "Export"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
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
