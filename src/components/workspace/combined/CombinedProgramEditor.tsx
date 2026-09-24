"use client";

// The combined multi-Program editor (wayframe#126) — the primary
// multi-Program surface, replacing the read-only merged view `/all` has
// shown since t26.
//
// Layout was #125's Variant B: a PERMANENT left Program rail that doubles as
// the structure editor, the merged canvas always showing EVERY Program
// beside it, and a right-docked inspector for whatever is being edited.
// wayframe#144 revised one word of that — permanent — and the reasoning is
// recorded in docs/research/multi-program-navigation-2026-09-23.md rather
// than left as a silent contradiction of a resolved verdict. In short:
// #125's argument for the rail over tabs and drawers still holds and the
// rail keeps every job it had, but it now starts collapsed, the surface
// carries the same Executive/Program toggle the single-Program page has (it
// had none at all), the Programs picker in the top strip replaces the two
// links that each mis-described where they went (#150), and the
// cross-Program rollup moved off the editing canvas into the Executive view
// where a summary belongs. The rail's own header explains the
// two-affordance card; this file is about the data plumbing underneath.
//
// Four seams worth understanding before editing this file:
//
// 1. One live room per Program (#118: "typical scale is 3-4 Programs, so
//    connect all of them rather than building viewport-based lazy
//    connect/disconnect"). Each gets a mounted `ProgramRoomHost`, which
//    publishes its box + connection state up into `connections`. That
//    registry is ordinary state, not a ref, and `publish` returns the
//    PREVIOUS map unchanged whenever nothing this component renders has
//    moved — React bails out of the re-render on an unchanged state
//    identity, which is what stops "the host publishes on every commit"
//    from becoming a render loop.
//
// 2. Two id spaces, and the inspector deliberately lives in the SMALLER one.
//    The canvas renders the merged pseudo-Program, so everything it reports
//    is namespaced (`programId::localId`) and every mutation it fires routes
//    through merged-dispatch.ts. The inspector, by contrast, is handed the
//    owning Program's OWN renderable document and the item's OWN local id —
//    so all ~10 of its callbacks reach that Program's box unmodified, and
//    its Relationships section can only ever offer predecessors from the
//    same Program (cross-Program dependency edges don't exist; #124 drops
//    them on a move for exactly that reason). Nothing has to remember to
//    de-namespace an op's targetId, because no namespaced id is ever in the
//    inspector's hands.
//
// 3. Portfolio-level state is read-only here. Each box holds its own copy of
//    the Portfolio (theme, legend categories, company logo), and
//    `useProgramRoom` syncs only the PROGRAM half of a box — so a theme or
//    category edit made here would land in one box, be invisible to the
//    other three, and never reach the server at all. The combined surface
//    therefore renders theme/legend from the fetched Portfolio and offers no
//    Portfolio-level editing; that stays on the single-Program page, which
//    has exactly one box. Worth fixing properly one day (a Portfolio-scoped
//    room), but silently letting the edits be lost is not the fix.
//
// 4. Version History (#128) reads through the SAME canvas, not a second one.
//    Selecting a Version swaps `displayedPrograms` from the live boxes over to
//    that Version's frozen documents and withholds every mutation callback —
//    the convention this route used to express read-only before #126 made it
//    editable, and the one #127's resolution picked over a scrim. Two things
//    stay live while a Version is on screen, both deliberately: the rooms
//    themselves (the live document keeps syncing behind you, so leaving
//    read-only needs no reload), and band collapse (viewer-local state held
//    right here, with no document field behind it). Everything else, including
//    a REAL Swimlane Group's `collapsed`, is inert — writing document content
//    while looking at a frozen document would edit a plan you can't see.

import { useCallback, useState } from "react";
import type { Portfolio, Program } from "@/components/timeline/types";
import { mergeForRender } from "@/components/timeline/types";
import { isProgramBandId, mergeProgramsForAllView, namespaceId, programStripGroupIds, splitNamespacedId } from "@/lib/portfolio/merge-programs";
import { buildMergedCanvasHandlers } from "@/lib/portfolio/merged-dispatch";
import { resolvePortfolioTheme, defaultPortfolioTheme } from "@/components/timeline/theme";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { ChartLegend } from "@/components/timeline/ChartLegend";
import { PortfolioExecutiveView } from "@/components/executive-view/PortfolioExecutiveView";
import { MilestoneEditorInspector } from "@/components/milestone-editor/MilestoneEditorInspector";
import { TopLevelItemEditorInspector, isEditableTopLevelItem } from "@/components/milestone-editor/TopLevelItemEditorInspector";
import { EDITOR_DOCK_WIDTH } from "@/components/milestone-editor/editor-dock";
import { SwimlaneManager } from "@/components/workspace/SwimlaneManager";
import { CrossProgramSelectionToolbar } from "@/components/workspace/CrossProgramSelectionToolbar";
import { useSelection } from "@/components/timeline/use-selection";
import { TopStrip } from "@/components/workspace/TopStrip";
import { ModeToggle, type Mode } from "@/components/workspace/ModeToggle";
import { useLegendCategoryStyle } from "@/components/timeline/use-legend-category-style";
import { traceFrom, type TraceDirection } from "@/lib/critical-path/trace";
import { moveMilestoneBetweenPrograms, moveSwimlaneBetweenPrograms } from "@/components/correction-box/cross-program-move";
import type { RoomAccess } from "@/lib/realtime/provider";
import type { ProgramRoomIdentity } from "@/lib/realtime/use-program-room";
import { VersionHistoryDock, formatSavedAt } from "@/components/workspace/VersionHistoryDock";
import type { PortfolioVersion } from "@/lib/db/versions";
import { ProgramRoomHost, type ProgramConnection } from "./ProgramRoomHost";
import { ProgramRail } from "./ProgramRail";
import { CrossProgramMovePicker } from "./CrossProgramMovePicker";

/**
 * Peers compared by CONTENT, not identity — everything else a connection
 * carries is either a primitive or a value whose identity is meaningfully
 * stable (`box.data` comes from a reducer). `peers` is the one field a room
 * implementation could hand back as a fresh array on every render, and with
 * a publish-every-commit contract (see ProgramRoomHost) an identity compare
 * there would mean "always changed" — a render loop, not a stale render.
 */
function samePeers(a: ProgramConnection["peers"], b: ProgramConnection["peers"]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((peer, i) => peer.id === b[i].id && peer.color === b[i].color && peer.name === b[i].name && peer.selectedId === b[i].selectedId);
}

export function CombinedProgramEditor({
  portfolio,
  programs,
  today,
  canEdit,
  roomAccess,
  identity,
  realtimeEnabled,
  onReorderProgram,
  reorderErrors = {},
  railFooter,
  accountSlot,
  navigationSlot,
}: {
  /** The fetched Portfolio — the single source for theme/legend on this surface (see this file's header, seam 3). */
  portfolio: Portfolio;
  /** The Programs to connect, in the order they should render. Only used to seed each room; live content comes from each Program's own box afterwards. */
  programs: Program[];
  today: Date;
  canEdit: boolean;
  roomAccess: (programId: string) => RoomAccess;
  identity: ProgramRoomIdentity;
  /** False until the caller knows who the viewer is — keeps hook order stable while opening no connections. */
  realtimeEnabled: boolean;
  onReorderProgram?: (programId: string, direction: "up" | "down") => void;
  reorderErrors?: Record<string, string>;
  railFooter?: React.ReactNode;
  /** The signed-in-account chip, placed in this surface's own top strip (wayframe#149) rather than positioning itself into the same corner. */
  accountSlot?: React.ReactNode;
  /** The Programs picker (wayframe#144), beside the Executive/Program toggle — it replaces this surface's old "← Back to Roadmap" link, which went to a single Program (#150). */
  navigationSlot?: React.ReactNode;
}) {
  const [connections, setConnections] = useState<Map<string, ProgramConnection>>(() => new Map());

  const publish = useCallback((connection: ProgramConnection) => {
    setConnections((previousMap) => {
      const previous = previousMap.get(connection.programId);
      // Compare only what this component renders. `box` itself is a fresh
      // object on every render of the host (its actions close over current
      // state), so comparing box identity would re-render forever.
      const unchanged =
        previous != null &&
        previous.box.data === connection.box.data &&
        previous.box.portfolio === connection.box.portfolio &&
        previous.status === connection.status &&
        previous.showOfflineBadge === connection.showOfflineBadge &&
        samePeers(previous.peers, connection.peers);
      if (unchanged) return previousMap;
      const next = new Map(previousMap);
      next.set(connection.programId, connection);
      return next;
    });
  }, []);

  const lookup = useCallback((programId: string) => connections.get(programId)?.box, [connections]);

  const [mode, setMode] = useState<Mode>("program");
  // Starts collapsed (wayframe#144): the rail is worth ~320px when you're
  // restructuring Programs and nothing the rest of the time, so the canvas
  // gets the width until it's asked for. Viewer-local, like band collapse.
  const [railCollapsed, setRailCollapsed] = useState(true);
  const [collapsedProgramIds, setCollapsedProgramIds] = useState<Set<string>>(new Set());
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(programs[0]?.id ?? null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedTopLevelItemId, setSelectedTopLevelItemId] = useState<string | null>(null);
  const [laneOptionsProgramId, setLaneOptionsProgramId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<{ laneId: string; shape: "milestone" | "phase" } | null>(null);
  const [trace, setTrace] = useState<{ rootId: string; direction: TraceDirection } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const selection = useSelection();
  // Version History (#128). The dock is closed by default and shares the
  // inspector's slot, so opening one closes the other; `viewingVersion` is null
  // whenever the live document is on screen.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<PortfolioVersion | null>(null);
  const readingVersion = viewingVersion !== null;
  /** Every gate that used to read `canEdit` alone: reading a Version is read-only regardless of role. */
  const canMutate = canEdit && !readingVersion;

  const theme = resolvePortfolioTheme(portfolio.theme ?? defaultPortfolioTheme);
  // The SAME viewer preference the single-Program page reads (#147). This
  // surface used to hardcode the encoding off at every call site, so the
  // All-Programs canvas could never category-tint at all — no preference, no
  // toggle, and no way for a reader to tell that was why.
  const legendCategoryStyle = useLegendCategoryStyle();

  // Every Program that has actually published a box, in the caller's order.
  const orderedConnections = programs.map((p) => connections.get(p.id)).filter((c): c is ProgramConnection => c != null);
  const livePrograms = orderedConnections.map((c) => c.box.data);
  const editablePrograms = canMutate ? livePrograms : [];
  /** What the canvas renders: the live boxes, or the Version being read. */
  const displayedPrograms = viewingVersion ? viewingVersion.programs : livePrograms;
  const versionProgramsById = viewingVersion ? new Map(viewingVersion.programs.map((p) => [p.id, p])) : undefined;

  function toggleBand(programId: string) {
    setCollapsedProgramIds((prev) => {
      const next = new Set(prev);
      if (next.has(programId)) next.delete(programId);
      else next.add(programId);
      return next;
    });
  }

  const canvasHandlers = buildMergedCanvasHandlers(lookup, toggleBand);

  /**
   * While a Version is on screen, a group-header click may only toggle a
   * Program BAND (viewer-local). A real Swimlane Group's `collapsed` is
   * document content, and routing it to a live box here would edit the live
   * plan from inside a read-only view of an old one — so it's dropped.
   */
  function toggleBandOnly(groupId: string) {
    if (!isProgramBandId(groupId)) return;
    const split = splitNamespacedId(groupId);
    if (split) toggleBand(split.programId);
  }

  /** Opening the inspector closes the History dock: #127 put them in the same slot, mutually exclusive. */
  function openMilestone(mergedId: string | null) {
    setHistoryOpen(false);
    setSelectedMilestoneId(mergedId);
  }

  function openTopLevelItem(mergedId: string | null) {
    setHistoryOpen(false);
    setSelectedTopLevelItemId(mergedId);
  }

  function handleViewVersion(version: PortfolioVersion | null) {
    setViewingVersion(version);
    // A marquee/tree selection names ids in whichever document was on screen
    // when it was made; carrying it across the swap would leave the bulk-edit
    // toolbar pointed at markers that aren't there. Same for an armed
    // placement, a trace root, and the per-Program lane modal — all of them
    // address the document that was on screen a moment ago.
    selection.clear();
    setPlacement(null);
    setTrace(null);
    setSelectedMilestoneId(null);
    setSelectedTopLevelItemId(null);
    setLaneOptionsProgramId(null);
  }

  /** Closing the dock always returns to live: a read-only canvas with the list gone would have nothing on screen saying why it can't be edited. */
  function closeHistory() {
    setHistoryOpen(false);
    handleViewVersion(null);
  }

  /** ...and opening the dock closes the inspector, since #127 put them in the same slot. */
  function toggleHistory() {
    if (historyOpen) {
      closeHistory();
      return;
    }
    setHistoryOpen(true);
    setSelectedMilestoneId(null);
    setSelectedTopLevelItemId(null);
  }

  // Recomputed every render rather than memoized, exactly as the read-only
  // merged view already did: the merge is a couple of array passes over 3-4
  // Programs, and it mints a fresh object either way (see
  // mergeProgramsForAllView's `generatedAt`), so a memo would buy nothing.
  const merged = mergeProgramsForAllView(portfolio.id, displayedPrograms);
  const renderable = mergeForRender(portfolio, merged);
  const canvasData = {
    ...renderable,
    // Viewer-local band collapse (see ProgramRail's header for why it can't
    // be document content). A REAL group's own persisted `collapsed` is left
    // exactly as its Program's doc has it.
    swimlaneGroups: (renderable.swimlaneGroups ?? []).map((g) =>
      isProgramBandId(g.id) && collapsedProgramIds.has(splitNamespacedId(g.id)!.programId) ? { ...g, collapsed: true } : g,
    ),
  };

  /** Resolves a merged id to its owning connection plus its Program-local id — the seam the inspector lives behind (see seam 2). */
  function resolveSelection(mergedId: string | null): { connection: ProgramConnection; localId: string } | null {
    if (!mergedId) return null;
    const split = splitNamespacedId(mergedId);
    if (!split) return null;
    const connection = connections.get(split.programId);
    return connection ? { connection, localId: split.localId } : null;
  }

  const milestoneSelection = resolveSelection(selectedMilestoneId);
  const topLevelSelection = resolveSelection(selectedTopLevelItemId);

  // The inspector's whole world: one Program's own document, in its own id
  // space. `mergeForRender` is the same seam the single-Program workspace
  // uses to hand the render layer a flat Program.
  const milestoneScope = milestoneSelection ? mergeForRender(portfolio, milestoneSelection.connection.box.data) : null;
  const selectedMilestone = milestoneScope?.milestones.find((m) => m.id === milestoneSelection!.localId) ?? null;
  const topLevelScope = topLevelSelection ? mergeForRender(portfolio, topLevelSelection.connection.box.data) : null;
  const selectedTopLevelItemRaw = topLevelSelection ? topLevelSelection.connection.box.data.topLevelItems.find((t) => t.id === topLevelSelection.localId) ?? null : null;
  const selectedTopLevelItem = selectedTopLevelItemRaw && isEditableTopLevelItem(selectedTopLevelItemRaw) ? selectedTopLevelItemRaw : null;

  // A trace is rooted in one Program (dependency edges never cross Programs)
  // but has to highlight on a canvas that speaks merged ids, so the local
  // result is namespaced back on the way out.
  const traceScope = trace ? resolveSelection(trace.rootId) : null;
  const tracedIds = traceScope
    ? new Set([...traceFrom(traceScope.connection.box.data.milestones, traceScope.localId, trace!.direction)].map((id) => namespaceId(traceScope.connection.programId, id)))
    : undefined;

  const remoteSelections: Record<string, string> = {};
  for (const connection of orderedConnections) {
    for (const peer of connection.peers) {
      if (peer.selectedId) remoteSelections[namespaceId(connection.programId, peer.selectedId)] = peer.color;
    }
  }

  const laneOptionsConnection = laneOptionsProgramId ? connections.get(laneOptionsProgramId) : undefined;
  const connecting = orderedConnections.length < programs.length;

  function handleMoveMilestone(destProgramId: string, destLaneId: string | null) {
    if (!milestoneSelection || !destLaneId) return;
    const dest = connections.get(destProgramId);
    if (!dest) return;
    moveMilestoneBetweenPrograms(milestoneSelection.connection.box, dest.box, milestoneSelection.localId, destLaneId, {
      sourceCanEdit: canEdit,
      destCanEdit: canEdit,
    });
    // The moved item exists under a brand-new id in the destination Program
    // (#124 mints storage-durable ids rather than carrying the old one over),
    // so the old selection no longer names anything — close rather than
    // silently pointing the inspector at a ghost.
    setSelectedMilestoneId(null);
  }

  function handleMoveSwimlane(sourceProgramId: string, laneId: string, destProgramId: string) {
    const source = connections.get(sourceProgramId);
    const dest = connections.get(destProgramId);
    if (!source || !dest) return;
    moveSwimlaneBetweenPrograms(source.box, dest.box, laneId, { sourceCanEdit: canEdit, destCanEdit: canEdit });
    if (selectedMilestoneId && splitNamespacedId(selectedMilestoneId)?.programId === sourceProgramId) setSelectedMilestoneId(null);
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      style={
        {
          background: theme.pageBg,
          "--wf-panel": theme.panelBg,
          "--wf-border": theme.panelBorder,
          "--wf-ink": theme.panelInk,
          "--wf-accent": theme.accent,
          // Read by the viewport-centered selection toolbar so it stays
          // centered on the canvas rather than under the dock — same
          // mechanism RoadmapWorkspace publishes (see CorrectionBox's
          // DOCK_SHIFT). The rail is a flex sibling, so it needs no shift.
          "--wf-dock-w": selectedMilestone || selectedTopLevelItem || historyOpen ? `${EDITOR_DOCK_WIDTH}px` : "0px",
        } as React.CSSProperties
      }
    >
      {programs.map((program) => (
        <ProgramRoomHost
          key={program.id}
          program={program}
          portfolio={portfolio}
          today={today}
          access={roomAccess(program.id)}
          identity={identity}
          selectedId={milestoneSelection?.connection.programId === program.id ? milestoneSelection.localId : null}
          enabled={realtimeEnabled}
          onPublish={publish}
        />
      ))}

      {/* One strip across the top (wayframe#149's TopStrip, in its in-flow
          variant) carrying what this surface's chrome actually is: which
          reading of the plan (Executive/Program — it had NO toggle at all
          before #144), which Program (the picker, which replaced the
          mis-described "← Back to Roadmap" link, #150), and the
          session-level controls on the right. */}
      <TopStrip
        variant="flow"
        left={<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{mode === "executive" ? "Roadmap summary" : "All Programs"}</span>}
        center={
          <>
            <ModeToggle mode={mode} onChange={setMode} />
            {navigationSlot}
          </>
        }
        right={
          <>
            {canMutate && mode === "program" && (
              <button
                onClick={() => setSelectMode((v) => !v)}
                aria-pressed={selectMode}
                aria-label={`Select mode: ${selectMode ? "On" : "Off"}`}
                className={"rounded-full border px-2.5 py-1 text-xs " + (selectMode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-500")}
              >
                Select mode: {selectMode ? "On" : "Off"}
              </button>
            )}
            {viewingVersion && (
              <span className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                Read-only — Version of {formatSavedAt(viewingVersion.createdAt)}
              </span>
            )}
            {connecting && <span className="text-xs text-zinc-500">Connecting to {programs.length - orderedConnections.length} more Program…</span>}
            {/* Next to the persistence/connection state on purpose (#127): "is my
                work safe" and "what did this look like last month" are the same
                question asked at two timescales. Not in an Options menu — that's
                where Export Snapshot lives, the collision #128 renamed away. */}
            <button
              onClick={toggleHistory}
              aria-pressed={historyOpen}
              className={"rounded-full border px-2.5 py-1 text-xs " + (historyOpen ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-500")}
            >
              History
            </button>
            {accountSlot}
          </>
        }
      />

      <div className="flex min-h-0 min-w-0 flex-1">
      <ProgramRail
        connections={orderedConnections}
        theme={theme}
        portfolioId={portfolio.id}
        canEdit={canEdit}
        editablePrograms={editablePrograms}
        collapsedProgramIds={collapsedProgramIds}
        onToggleBand={toggleBand}
        expandedProgramId={expandedProgramId}
        onExpandProgram={setExpandedProgramId}
        onMoveSwimlane={handleMoveSwimlane}
        onOpenLaneOptions={setLaneOptionsProgramId}
        onReorderProgram={readingVersion ? undefined : onReorderProgram}
        reorderErrors={reorderErrors}
        footer={readingVersion ? null : railFooter}
        readOnlyPrograms={versionProgramsById}
        viewOnlyNote={readingVersion ? "Reading a saved Version — the live document is untouched." : undefined}
        collapsed={railCollapsed}
        onToggleCollapsed={() => setRailCollapsed((v) => !v)}
      />

      <main className="min-w-0 flex-1 overflow-x-auto p-4">
        {/* The cross-Program summary's home (wayframe#144/#145). It used to
            be a rollup bar directly above the editing canvas, where a summary
            of every Program competes with the one thing you came here to
            change; the Executive reading is where "how is each Program doing"
            belongs, and #145 answers it Program by Program instead of as one
            flattened set of numbers. Reads `displayedPrograms`, so it
            summarises a Version being read exactly as it does the live plan. */}
        {mode === "executive" && <PortfolioExecutiveView portfolio={portfolio} programs={displayedPrograms} today={today} />}

        {mode === "program" && (
          <>
        {placement && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
            <span>Click a point on the lane to place this {placement.shape === "phase" ? "pill (drag for its length)" : "milestone"}.</span>
            <button onClick={() => setPlacement(null)} className="rounded border border-blue-300 px-1.5 py-0.5">
              Cancel
            </button>
          </div>
        )}

        <RoadmapTimeline
          data={canvasData}
          today={today}
          theme={theme}
          // Each Program's program-level items on that Program's own strip
          // (#152), not all four Programs' piled into the chart's one top
          // band. The canvas is the only surface that needs this: a
          // single-Program document names no bands and renders unchanged.
          topLevelItemBandGroupIds={programStripGroupIds(canvasData)}
          legendCategoryFillEnabled={legendCategoryStyle.enabled}
          onMilestoneClick={canMutate ? (m) => openMilestone(m.id) : undefined}
          onTopLevelItemClick={canMutate ? (t) => openTopLevelItem(t.id) : undefined}
          onMilestoneDateChange={canMutate ? canvasHandlers.onMilestoneDateChange : undefined}
          onMilestoneDateRangeChange={canMutate ? canvasHandlers.onMilestoneDateRangeChange : undefined}
          onToggleGroupCollapsed={readingVersion ? toggleBandOnly : canvasHandlers.onToggleGroupCollapsed}
          onPickShape={canMutate ? (laneId, shape) => setPlacement({ laneId, shape }) : undefined}
          placementMode={placement}
          onAddMilestone={
            canMutate
              ? (laneId, date, endDate) => {
                  const split = splitNamespacedId(laneId);
                  const connection = split ? connections.get(split.programId) : undefined;
                  setPlacement(null);
                  if (!split || !connection) return;
                  // Straight into the inspector, same "create empty, open
                  // for editing" contract the single-Program surface has —
                  // an untitled marker with no follow-up is a dead end.
                  openMilestone(namespaceId(split.programId, connection.box.addMilestone(split.localId, date, endDate)));
                }
              : undefined
          }
          tracedIds={tracedIds}
          selectionModeEnabled={canMutate && selectMode}
          selectedIds={selection.selectedIds}
          onToggleSelect={selection.toggle}
          onMarqueeSelect={selection.addAll}
          remoteSelections={remoteSelections}
        />

        {trace && (
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
            <span>Highlighting the {trace.direction} chain.</span>
            <button onClick={() => setTrace(null)} className="rounded border border-zinc-300 px-1.5 py-0.5">
              Clear
            </button>
          </div>
        )}

        {renderable.legendCategories && renderable.legendCategories.length > 0 && (
          <ChartLegend
            theme={theme}
            criticalPathStyle="solid"
            showCriticalPath={true}
            deltaAnnotationsEnabled={false}
            tracing={trace !== null}
            hasDurations={renderable.milestones.some((m) => !!m.endDate)}
            categoryFillEnabled={legendCategoryStyle.enabled}
            onToggleCategoryFill={() => legendCategoryStyle.setEnabled(!legendCategoryStyle.enabled)}
            categories={renderable.legendCategories}
          />
        )}
          </>
        )}
      </main>

      {canMutate && selection.selectedIds.size > 0 && (
        // t33's cross-Program toolbar, now applying through the live boxes
        // rather than its old REST route (see its own header). It groups the
        // merged selection by Program itself and hands back each Program's
        // share already in that Program's id space, so each affected Program
        // takes exactly one atomic edit — and one undo entry.
        <CrossProgramSelectionToolbar
          programs={livePrograms}
          selection={selection}
          onApply={(opsByProgram) => {
            for (const [programId, ops] of Object.entries(opsByProgram)) {
              connections.get(programId)?.box.bulkEdit(ops.bulkPatchOps, ops.deleteIds, ops.acceptBaselineOps);
            }
          }}
        />
      )}

      {selectedMilestone && milestoneScope && milestoneSelection && (
        <MilestoneEditorInspector
          data={milestoneScope}
          theme={theme}
          milestone={selectedMilestone}
          legendCategoryFillEnabled={legendCategoryStyle.enabled}
          locationSlot={
            <CrossProgramMovePicker
              compact
              kind="milestone"
              source={milestoneSelection.connection.box.data}
              itemId={milestoneSelection.localId}
              programs={editablePrograms}
              currentLaneName={milestoneSelection.connection.box.data.swimlanes.find((l) => l.id === selectedMilestone.laneId)?.name}
              onMove={handleMoveMilestone}
            />
          }
          onSave={milestoneSelection.connection.box.editMilestone}
          onClose={() => setSelectedMilestoneId(null)}
          onDelete={(id) => {
            milestoneSelection.connection.box.removeMilestone(id);
            setSelectedMilestoneId(null);
            if (trace && splitNamespacedId(trace.rootId)?.localId === id) setTrace(null);
          }}
          onToggleDependency={milestoneSelection.connection.box.toggleDependency}
          onEditAttachments={milestoneSelection.connection.box.editAttachments}
          onAcceptBaseline={milestoneSelection.connection.box.acceptBaseline}
          onTrace={(direction) => {
            setTrace({ rootId: namespaceId(milestoneSelection.connection.programId, milestoneSelection.localId), direction });
            setSelectedMilestoneId(null);
          }}
          onSetCategory={milestoneSelection.connection.box.setMilestoneCategory}
          onSetStyleOverride={milestoneSelection.connection.box.setMilestoneStyleOverride}
          onClearStyleOverride={milestoneSelection.connection.box.clearMilestoneStyleOverride}
          onSetLaneRow={milestoneSelection.connection.box.setMilestoneLaneRow}
        />
      )}

      {selectedTopLevelItem && topLevelScope && topLevelSelection && (
        <TopLevelItemEditorInspector
          item={selectedTopLevelItem}
          data={topLevelScope}
          theme={theme}
          legendCategoryFillEnabled={legendCategoryStyle.enabled}
          onSave={topLevelSelection.connection.box.editTopLevelItem}
          onClose={() => setSelectedTopLevelItemId(null)}
          onDelete={(id) => {
            topLevelSelection.connection.box.removeTopLevelItem(id);
            setSelectedTopLevelItemId(null);
          }}
          onSetStyleOverride={topLevelSelection.connection.box.setTopLevelItemStyleOverride}
          onClearStyleOverride={topLevelSelection.connection.box.clearTopLevelItemStyleOverride}
        />
      )}

      {historyOpen && (
        <VersionHistoryDock
          portfolioId={portfolio.id}
          canEdit={canEdit}
          viewingVersionId={viewingVersion?.id ?? null}
          onViewVersion={handleViewVersion}
          onClose={closeHistory}
        />
      )}

      {laneOptionsConnection && (
        // The rail carries the controls you reach for while scanning; the
        // full per-lane surface (RAG override, density, group assignment,
        // nesting) stays this one existing modal, scoped to one Program.
        <SwimlaneManager
          data={laneOptionsConnection.box.data}
          theme={theme}
          onAdd={laneOptionsConnection.box.addSwimlane}
          onRename={laneOptionsConnection.box.renameSwimlane}
          onRemove={laneOptionsConnection.box.removeSwimlane}
          onMove={laneOptionsConnection.box.moveSwimlane}
          onColor={laneOptionsConnection.box.setLaneColor}
          onRagOverride={laneOptionsConnection.box.setRagOverride}
          onDensity={laneOptionsConnection.box.setLaneDensity}
          onHidden={laneOptionsConnection.box.setLaneHidden}
          onAddGroup={laneOptionsConnection.box.addSwimlaneGroup}
          onRenameGroup={laneOptionsConnection.box.renameSwimlaneGroup}
          onRemoveGroup={laneOptionsConnection.box.removeSwimlaneGroup}
          onMoveGroup={laneOptionsConnection.box.moveSwimlaneGroup}
          onGroupColor={laneOptionsConnection.box.setSwimlaneGroupColor}
          onToggleGroupCollapsed={laneOptionsConnection.box.setSwimlaneGroupCollapsed}
          onAssignGroup={laneOptionsConnection.box.setSwimlaneGroupId}
          onClose={() => setLaneOptionsProgramId(null)}
        />
      )}
      </div>
    </div>
  );
}
