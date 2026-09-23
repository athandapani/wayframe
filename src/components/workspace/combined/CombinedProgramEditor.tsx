"use client";

// The combined multi-Program editor (wayframe#126) — the primary
// multi-Program surface, replacing the read-only merged view `/all` has
// shown since t26.
//
// Layout is #125's Variant B: a permanent left Program rail that doubles as
// the structure editor, the merged canvas always showing EVERY Program
// beside it, and a right-docked inspector for whatever is being edited. The
// rail's own header explains the two-affordance card; this file is about the
// data plumbing underneath.
//
// Three seams worth understanding before editing this file:
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

import { useCallback, useState } from "react";
import type { Portfolio, Program } from "@/components/timeline/types";
import { mergeForRender } from "@/components/timeline/types";
import { isProgramBandId, mergeProgramsForAllView, namespaceId, splitNamespacedId } from "@/lib/portfolio/merge-programs";
import { buildMergedCanvasHandlers } from "@/lib/portfolio/merged-dispatch";
import { resolvePortfolioTheme, defaultPortfolioTheme } from "@/components/timeline/theme";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { ChartLegend } from "@/components/timeline/ChartLegend";
import { PortfolioRollupBar } from "@/components/executive-view/PortfolioRollupBar";
import { MilestoneEditorInspector } from "@/components/milestone-editor/MilestoneEditorInspector";
import { TopLevelItemEditorInspector, isEditableTopLevelItem } from "@/components/milestone-editor/TopLevelItemEditorInspector";
import { EDITOR_DOCK_WIDTH } from "@/components/milestone-editor/editor-dock";
import { SwimlaneManager } from "@/components/workspace/SwimlaneManager";
import { CrossProgramSelectionToolbar } from "@/components/workspace/CrossProgramSelectionToolbar";
import { useSelection } from "@/components/timeline/use-selection";
import { traceFrom, type TraceDirection } from "@/lib/critical-path/trace";
import { moveMilestoneBetweenPrograms, moveSwimlaneBetweenPrograms } from "@/components/correction-box/cross-program-move";
import type { RoomAccess } from "@/lib/realtime/provider";
import type { ProgramRoomIdentity } from "@/lib/realtime/use-program-room";
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
  topBar,
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
  topBar?: React.ReactNode;
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

  const [collapsedProgramIds, setCollapsedProgramIds] = useState<Set<string>>(new Set());
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(programs[0]?.id ?? null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedTopLevelItemId, setSelectedTopLevelItemId] = useState<string | null>(null);
  const [laneOptionsProgramId, setLaneOptionsProgramId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<{ laneId: string; shape: "milestone" | "phase" } | null>(null);
  const [trace, setTrace] = useState<{ rootId: string; direction: TraceDirection } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const selection = useSelection();

  const theme = resolvePortfolioTheme(portfolio.theme ?? defaultPortfolioTheme);

  // Every Program that has actually published a box, in the caller's order.
  const orderedConnections = programs.map((p) => connections.get(p.id)).filter((c): c is ProgramConnection => c != null);
  const livePrograms = orderedConnections.map((c) => c.box.data);
  const editablePrograms = canEdit ? livePrograms : [];

  function toggleBand(programId: string) {
    setCollapsedProgramIds((prev) => {
      const next = new Set(prev);
      if (next.has(programId)) next.delete(programId);
      else next.add(programId);
      return next;
    });
  }

  const canvasHandlers = buildMergedCanvasHandlers(lookup, toggleBand);

  // Recomputed every render rather than memoized, exactly as the read-only
  // merged view already did: the merge is a couple of array passes over 3-4
  // Programs, and it mints a fresh object either way (see
  // mergeProgramsForAllView's `generatedAt`), so a memo would buy nothing.
  const merged = mergeProgramsForAllView(portfolio.id, livePrograms);
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
      className="flex min-h-screen"
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
          "--wf-dock-w": selectedMilestone || selectedTopLevelItem ? `${EDITOR_DOCK_WIDTH}px` : "0px",
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
        onReorderProgram={onReorderProgram}
        reorderErrors={reorderErrors}
        footer={railFooter}
      />

      <main className="min-w-0 flex-1 overflow-x-auto p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          {topBar}
          {canEdit && (
            <button
              onClick={() => setSelectMode((v) => !v)}
              aria-pressed={selectMode}
              aria-label={`Select mode: ${selectMode ? "On" : "Off"}`}
              className={"rounded-full border px-2.5 py-1 text-xs " + (selectMode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-500")}
            >
              Select mode: {selectMode ? "On" : "Off"}
            </button>
          )}
          {connecting && <span className="text-xs text-zinc-500">Connecting to {programs.length - orderedConnections.length} more Program…</span>}
        </div>

        {placement && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
            <span>Click a point on the lane to place this {placement.shape === "phase" ? "pill (drag for its length)" : "milestone"}.</span>
            <button onClick={() => setPlacement(null)} className="rounded border border-blue-300 px-1.5 py-0.5">
              Cancel
            </button>
          </div>
        )}

        <PortfolioRollupBar programs={livePrograms} today={today} />

        <RoadmapTimeline
          data={canvasData}
          today={today}
          theme={theme}
          onMilestoneClick={canEdit ? (m) => setSelectedMilestoneId(m.id) : undefined}
          onTopLevelItemClick={canEdit ? (t) => setSelectedTopLevelItemId(t.id) : undefined}
          onMilestoneDateChange={canEdit ? canvasHandlers.onMilestoneDateChange : undefined}
          onMilestoneDateRangeChange={canEdit ? canvasHandlers.onMilestoneDateRangeChange : undefined}
          onToggleGroupCollapsed={canvasHandlers.onToggleGroupCollapsed}
          onPickShape={canEdit ? (laneId, shape) => setPlacement({ laneId, shape }) : undefined}
          placementMode={placement}
          onAddMilestone={
            canEdit
              ? (laneId, date, endDate) => {
                  const split = splitNamespacedId(laneId);
                  const connection = split ? connections.get(split.programId) : undefined;
                  setPlacement(null);
                  if (!split || !connection) return;
                  // Straight into the inspector, same "create empty, open
                  // for editing" contract the single-Program surface has —
                  // an untitled marker with no follow-up is a dead end.
                  setSelectedMilestoneId(namespaceId(split.programId, connection.box.addMilestone(split.localId, date, endDate)));
                }
              : undefined
          }
          tracedIds={tracedIds}
          selectionModeEnabled={canEdit && selectMode}
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
            categories={renderable.legendCategories}
          />
        )}
      </main>

      {canEdit && selection.selectedIds.size > 0 && (
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
          legendCategoryFillEnabled={false}
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
          legendCategoryFillEnabled={false}
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
  );
}
