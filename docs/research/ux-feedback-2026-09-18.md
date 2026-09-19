# UX/bug feedback handoff — 2026-09-18

Source: product-owner click-through of `/dev/demo-roadmap` after t41 (all 42
rebuild tickets) landed. This is **new scope beyond t1-t42**, not a ticket in
`.wayfinder/tickets-meta.json` — treat this doc as the source of truth for a
future implementation session, not the wayfinder ticket tracker. Investigated
via three parallel deep-research passes (read-only, no code changes made).
Every finding below is verified against actual file:line locations, not
guessed — several genuinely surprised the investigation (see 2A, 6, 8).

## 0. Not a code issue — do this first, separately

**Google Slides export 403 (`SERVICE_DISABLED`)**: the Slides API just isn't
enabled on Google Cloud project `1077829268881`. Open the activation URL from
the error (`https://console.developers.google.com/apis/api/slides.googleapis.com/overview?project=1077829268881`),
click **Enable**, wait a minute or two for it to propagate, retry. Nothing to
fix in the app.

## Suggested order of work

1. **Real bugs first** (§1, §2) — these are silent-incorrect-behavior, not
   missing features, and §2's fix is small.
2. **Toolbar restructuring as one pass** (§3, §4, §5) — all three compete for
   the same screen real estate (see §3's "toolbar contention" note), so
   design and land them together rather than sequentially fighting over the
   same strip.
3. **Outline tree phase/annotation fix** (§6) — small, independent.
4. **New capabilities** (§7 Redo, §8 New Program, §9 Snapshot creation, §10
   Category popover) — independent of each other, but §8 has a **hard
   prerequisite** (the `/view` route fix) called out below — don't ship the
   "New Program" button without it, or you create Programs nobody can open.

---

## 1. Lane-row bug: adding a 2nd row shrinks the swimlane (real bug)

**User report**: "The lane row inside a swimlane is not working, by default
item is in lane 1, if i put it to add new lane and put the item on lane 2, it
shrank the whole swimlane, which is absurd."

**Root cause — two compounding defects in `src/lib/layout/lane-rows.ts`**,
confirmed by actually running `computeLaneRowModel` against the demo fixture:

**(a) Row 1 vanishes when it empties, taking its floor with it.**
`bucketRows` (`lane-rows.ts:61-70`) only emits rows something is assigned to.
Move the only pill in a lane to Row 2 and the model contains a single row
numbered `2`; `computeRowHeight` (`:93`) then picks `floor = opts.baseSlotHeight`
instead of `opts.row1Floor`. `LANE_ROW1_FLOOR = 49` vs `PILL_ROW_HEIGHT = 18`
(`RoadmapTimeline.tsx:108`, `:69`) — the lane's natural height collapses
49→18 (measured: SVG height 995→964, a 31px shrink, exactly `49−18`). That's
the "shrank the whole swimlane."

**(b) A lane with any point marker can never grow for a new row at all.**
`RoadmapTimeline.tsx:1598`: `naturalHeightByLaneId.set(lane.id, Math.max(markerFloor, model.naturalHeight))`,
where `markerFloor = LANE_HEIGHT (132) × boxScale × density` (`:1584-1585`).
Every demo lane has point markers, so 132 swallows the whole lane-row band —
measured: SVG height is **identical before and after** moving a pill to Row 2
when the lane also has point markers. So today the feature either does
nothing visible, or shrinks — never grows.

`pillSubRowOffset` (`:1641-1657`) has the same blind spot: it sums raw
`slotHeights` instead of deriving from `row.height`/`row1Floor`, so a lone
Row-2 band draws at the same y a lone Row-1 band would.

**Fix approach:**
1. `lane-rows.ts` `computeLaneRowModel` (`:98-103`): if `buckets` has no row
   `1` but has any row > 1, prepend a synthetic `computeRowHeight(1, [], opts)`
   so Row 1's 49px reservation always exists. Verify/add an explicit
   empty-`slotHeights` case in `computeRowHeight` (`:89-91`).
2. `RoadmapTimeline.tsx:1598`: stop letting `markerFloor` swallow extra rows —
   `Math.max(markerFloor, model.rows[0].height) + Σ(rows[1..].height + ROW_GAP)`,
   so a second row always adds height regardless of point-marker presence.
3. `pillSubRowOffset` (`:1645`): derive `totalBandHeight`/`rowTop` from
   `row.height` (floored), not raw `slotHeights` sums.
4. Optional: `computeMaxLaneRow` (`MilestoneEditorModal.tsx:212-215`) should
   floor at `milestone.laneRow ?? 1` so an item on a high row doesn't lose its
   own dropdown option when siblings move away.

**Risks/tests**: fix (1) changes the "a row disappears the moment it empties"
doc comment (`lane-rows.ts:14-22`) — scope that promise to rows 2+ only. Fix
(2) shifts y-coordinates for any document already using `laneRow`;
`RoadmapTimeline.test.tsx:578-594` only asserts `y1 ≠ y2` so should survive,
but `src/lib/export/renderable-to-slide.test.ts:85-90` asserts sub-row y's and
may need rebaselining. Add to `lane-rows.test.ts`: "a lone item on Row 2 still
reserves Row 1's floor → `naturalHeight === 49 + 18 + ROW_GAP`". Add to
`RoadmapTimeline.test.tsx`'s existing "Lane Rows" describe (`:551`): render
baseline vs. one pill moved to `laneRow: 2`, assert SVG height strictly
*increases*, plus a companion assert it never decreases.

---

## 2. Milestone editor: style overrides don't reach Program-band items (real bug)

**User report**: "The milestone editor modal window doesn't edit the
overrides for phases, it only works for pills, it has to work for all types
milestones and phases."

**What's actually true** (schema check first): `StyleOverride` IS declared on
lane-level `Milestone` (`types.ts:321`) AND on both the `milestone`
(`types.ts:216-217`) and `phase` (`types.ts:232-233`) variants of
`TopLevelItem` — `annotation` has none. The **renderer** already honors all
of it (`RoadmapTimeline.tsx:2551-2559` for Program-band phases,
`:2634-2639` for Program-band milestones).

**The gap is entirely in the editor UI.** `TopLevelItemEditorModal.tsx` has
**zero** references to `StyleOverride` or `style-resolution.ts` — no
Appearance section for *any* of its variants (its form, lines 83-190, is
date/status/reference-line only). The write path doesn't exist either:
`TopLevelItemPatch` (`use-correction-box.ts:80-82`) has no `styleOverride`
field, and the reducer only has `setMilestoneStyleOverride`/
`clearMilestoneStyleOverride` (`:212-213`, `871-895`) — nothing for
TopLevelItems. (The only existing way to set a TopLevelItem override today is
t33's bulk-edit path, `src/lib/bulk-edit/apply.ts:147-152, 185-190`.)

`MilestoneEditorModal.tsx` (the OTHER modal, for lane items) branches
correctly by `hasEndDate` — a pill gets phase shape/size controls (lines
396-412) and an accurate warning banner (lines 337-342) that marker
shape/scale/label-position/color/hidden don't apply to it (confirmed: the
in-lane pill renderer at `RoadmapTimeline.tsx:3004-3009` really doesn't read
those). So: clicking a *lane* item opens the correct modal with correct
branching; clicking a *Program-band* item opens a modal with no Appearance UI
at all. That's the real "only works for pills" — it actually means "only
works when you happen to open the modal that has an Appearance section."

**Secondary defect found in passing**: `resolveHidden` is never checked for
in-lane duration pills (`RoadmapTimeline.tsx:3004` filter is
`m.endDate && laneRenderable(...)`, no `resolveHidden`), so "Hide from chart"
silently no-ops on a pill even though it works on point markers (`:3123`) and
both TopLevelItem kinds.

**Fix approach:**
1. **Reducer**: add `setTopLevelItemStyleOverride`/`clearTopLevelItemStyleOverride`
   mirroring `use-correction-box.ts:871-895`, guarded `t.type !== "annotation"`
   (same guard `bulk-edit/apply.ts:187` already uses). Export via the hook.
2. **Modal**: extract `Section`/`SourceTag`/`ResetButton`/`overrideCount`/
   `AppearanceBody` from `MilestoneEditorModal.tsx:205-415` into a shared
   module, parameterized by a **variant** instead of today's `hasEndDate`
   boolean: *point-ish* (lane point milestone, TopLevelItem `milestone`) →
   marker shape/scale, font scale, label position, color, hidden; *span-ish*
   (lane pill, TopLevelItem `phase`) → phase shape/size, font scale, color,
   hidden; `annotation` → no Appearance section. `AppearanceBody` already
   takes `data`/`theme` and real resolvers, so a `TopLevelItem` is
   structurally compatible — only `resolveMarkerColor`'s `Milestone` type
   (`style-resolution.ts:98`) needs widening to `{styleOverride?; status}`.
3. **Wiring**: pass the two new callbacks at `RoadmapWorkspace.tsx:1503`
   alongside the existing pair at `:1499-1500`.
4. Optional: fix the pill `hidden` gap — add `&& !resolveHidden(m, data)` at
   `RoadmapTimeline.tsx:3005`, then delete that clause from the warning
   banner (it becomes inaccurate once fixed).

**Risks/tests**: don't delete the banner wholesale — marker-shape/scale/
label-position genuinely don't apply to a span-ish item; the right fix is to
not render those controls, not render-plus-warn. Preserve `overrideCount`
counting `hidden: false` as "set" (`:205-209`, deliberate). Add
`TopLevelItemEditorModal.test.tsx` mirroring `MilestoneEditorModal.test.tsx`'s
conventions: phase shows phase controls only, milestone shows the 6-shape
picker only, annotation shows no Appearance section, clicking a shape calls
the new setter. Add one `RoadmapTimeline.test.tsx` render assertion that a
TopLevelItem phase with `styleOverride.phaseShape: "rectangle"` renders
differently (matches the `data-testid` query style at `:552-556`).

---

## 3. Zoom/timeframe control takes a full dedicated row

**User report**: "The big time frame selector, cant you make it smaller and
fit it in the top row, i dont want to lose additional vertical space for it."

**Current state — there IS no top toolbar row today.** `ZoomControls`
(`ZoomControls.tsx:23`) renders as its own full-width block (~56px + margin:
a two-thumb slider row plus a date-range/pan-buttons row) mounted inline in
the chart flow at `RoadmapWorkspace.tsx:301`, inside `RoadmapView`'s
`<div className="relative mx-auto max-w-[1600px] p-8 pt-16">` (`:300`). What
*looks* like a toolbar is actually five independent `position: fixed`
islands, hand-offset from viewport edges:

| element | file:line | position |
|---|---|---|
| Logo + `?` | `RoadmapWorkspace.tsx:658` | `top-3 left-4` |
| Executive/Program toggle | `:670-672` | `top-4 left-1/2 -translate-x-1/2` |
| PresenceAvatars | `:678` | `top-4 right-28` |
| "Updated" badge | `:341` | `top-4 right-16` |
| Options (☰) | `:741` | `top-4 right-4` |

So "put it in the top row" means *building* a real top row, not just
resizing the existing control — see the toolbar-contention note below, since
§4 and §5 both want space in that same new row.

**Root cause**: t10's design settled the zoom *mechanism* (two-thumb slider +
CSS-transform preview), never chrome placement. It sits above the chart
because `ZoomPreviewFrame` (`ZoomControls.tsx:90-118`) must wrap the chart and
measures `el.clientWidth` via `ResizeObserver` — placed next to what it
measures. Note: `use-fit-to-screen.ts` is vertical-only, a plain localStorage
boolean, unrelated to this layout.

**Fix approach:**
1. Add a `variant?: "block" | "compact"` prop to `ZoomControls` (state
   contract `UseZoomWindowResult` unchanged). `ZoomPreviewFrame` stays put —
   only the horizontal preview math needs the measured width, and that logic
   doesn't move.
2. Compact layout: one `flex items-center gap-1` row — slider shrunk to a
   fixed width (e.g. `w-40`, replacing today's `w-full` at `:24`), date string
   shortened (`MMM 'YY → MMM 'YY`, replacing `fmt()` at `:13-15`), zoom
   buttons already icon-only (`−+◀▶`), demote `Reset` to a `↺` icon.
3. Build a real toolbar container: replace the three right-hand fixed
   islands (`:341`, `:678`, `:741`) with one
   `<div className="fixed top-3 right-4 z-50 flex items-center gap-2">`,
   moving "Updated"/PresenceAvatars in as plain children (deletes the
   hardcoded `right-16`/`right-28` offsets, which already collide when the
   "Updated" string is long).
4. Delete `:301`; mount compact `ZoomControls` in the new toolbar,
   program-mode only.

**Toolbar contention — read this before implementing §3/§4/§5 separately.**
Budget at `max-w-[1600px]`: ModeToggle is centered (~190px), leaving ~705px
per side. Compact zoom (~260px) + Select toggle (~70px) + Outline icon
(~40px) + Swimlanes icon (~40px) + Updated text (~110px) + avatars (variable)
+ ☰ (~40px) ≈ 560px+ against 705px — fits, but only as an icon cluster, not
labeled pills, and only above ~1024px viewport width. Suggested layout: left
= logo/help; center = ModeToggle; right =
`[compact zoom] | [⬚ Select] [Outline icon] [Swimlanes icon] | [Updated] [avatars] [☰]`,
zoom group `hidden lg:flex` falling back to today's block `ZoomControls`
below `lg`. **Design and land §3+§4+§5 as one pass**, not three PRs that each
assume they own the whole strip.

**Risks**: below ~1100px the centered toggle and right cluster will overlap
— needs `flex-wrap` or a `md:` breakpoint that further collapses zoom to just
`−`/`+`/`↺`. Slider needs ≥~120px track or thumbs become untargetable.

---

## 4. "Select mode" is buried and unintuitive

**User report**: "I donot want select mode hidden in options, it should be
easy and intuitive to select, its currently not."

**Current state**: `const [selectMode, setSelectMode] = useState(false)`
(`RoadmapWorkspace.tsx:424`), its only UI a row inside Options → Layout
(`:1375-1385`) — three clicks deep. It gates every click handler in
`RoadmapTimeline.tsx` via `selectionModeEnabled={selectMode && !isViewMode}`
(`:1449`): point milestones (`:3137`, `:3260`), top-level items (`:2575`,
`:2651`), and the lane-background marquee (`:2794`/`:2196-2202`). Duration
pills (`:3038-3041`) always use `onMilestoneClick` — **lane pills can never
be selected at all today**, mode or no mode.

**No modifier-key handling exists anywhere** (`grep -rn
"metaKey\|ctrlKey\|shiftKey" src/` → zero non-test hits), but the plumbing is
ready: both `onMilestoneClick` (`:1327`) and `onTopLevelItemClick` (`:1329`)
already carry the full `React.MouseEvent`, just discarded today.

**Related bug found**: `SelectionToolbar` is gated on `selectMode` too
(`:1482`) — so selecting via the Outline tree (`OutlineTree.tsx:123`,
`selection.toggle`) produces **no mass-edit toolbar** unless Select mode also
happens to be on. Turning select mode off also never calls
`selection.clear()`, leaving stale selection state.

**Fix approach:**
1. Replace the ternary at the four click sites with a single handler:
   `(m, e) => (e.metaKey || e.ctrlKey) ? onToggleSelect?.(m.id) : onMilestoneClick?.(m, e)`
   — no mode required for point/top-level items. Keep `selectionModeEnabled`
   as the marquee-drag gate only (`:2794`) — a drag-marquee genuinely needs
   an armed mode to not fight click-to-place.
2. Promote the mode toggle into the new toolbar cluster (§3) as an icon
   button, reusing `pillToggle`/`PILL_STYLE` (`RoadmapWorkspace.tsx:323-325`,
   `:348`) directly — bypass `OptionsMenuRow`, it's just a presentational
   wrapper.
3. Change `:1482` to `{selection.selectedIds.size > 0 && !isViewMode && <SelectionToolbar…/>}`
   so tree-driven and modifier-driven selection both surface the toolbar; call
   `selection.clear()` when `selectMode` flips off.
4. Optionally extend selection to duration pills (`:3038-3041`) —
   `BulkPatchOp` already covers `date`/`endDate`/status/style for them.

**Risks**: Cmd+click can open links in new tabs in some browsers for `<a>`
elements — irrelevant for SVG `<g>`, but `e.preventDefault()` is cheap
insurance. Shift-click conventionally means *range*-select; recommend
Cmd/Ctrl-only for "add to selection," or implement Shift as an explicit
range-within-lane feature later. The visible toggle button (step 2) still
matters for discoverability of the modifier.

---

## 5. Outline + Swimlane manager buried; Outline tree missing phases/annotations

**User report**: "Outline view is very clunky, I need to be able to add
milestones, phases, annotations currently it only allows milestones. The
outline and swimlane editor can be buttons on the top row outside."

**Part A — promoting the buttons is nearly free.** "Open outline" and
"Add / edit lanes" are just `setOutlineOpen(true)`/`setLanesOpen(true)`
buttons at `RoadmapWorkspace.tsx:1335-1339` / `:1330-1334`, both inside
Options → Layout. State is already top-level and the panels already render
as fixed overlays (`:1511`, `:1533`). Promotion is purely moving two
`<button>`s into the new toolbar cluster (§3) and dropping the
`OptionsMenuRow` wrapper — zero prop changes needed.

**Part B — the tree actually does support phases and annotations; they're
just mislabeled and buried.** Empirically verified by running
`buildOutlineTree(demoRoadmap, new Set())` directly:

- **Program-band TopLevelItems DO render** — `tree.ts:210,217` appends all
  phases/milestones/annotations to the Program root's children, and
  `OutlineTree.tsx:40-48` already maps them to `PHASE`/`NOTE` badges. They
  simply render **last**, after all lanes × rows (~40 rows in the demo),
  below the fold of the `max-h-[85vh] overflow-y-auto` panel
  (`OutlineTree.tsx:246`) — they read as absent but aren't.
- **Lane-scoped duration pills ARE genuinely mislabeled.** `buildLaneNode`
  (`tree.ts:110`) takes every milestone by `laneId` with no `endDate` filter,
  but `buildMilestoneLeaf` (`tree.ts:82`) hardcodes `kind: "milestone"` — so
  the demo's lane phases ("SLAM Localization Alpha," "UL 3100
  Pre-Assessment," …) all show a **MILE** badge instead of **PHASE**. This is
  the one real gap, not a scope cut — t32's gist promised
  milestone/phase/annotation leaves but nobody mapped the schema's *second*
  phase representation (`Milestone.endDate`) onto the `phase` kind.

**Fix approach:**
1. `tree.ts:81-92`: `kind: m.endDate ? "phase" : "milestone"`. No
   `OutlineNodeKind` change needed — `KIND_LABEL`/`isLeafKind` already cover
   `phase`; add a date-range suffix to the label so it reads distinctly.
2. Wrap `topLevelLeaves` (`tree.ts:210`) in a synthetic non-selectable
   container node (new kind `"program-band"`, label "Program band") placed
   **before** `topChildren` at `:217`, so it's the first thing visible, not
   the last. Needs one new entry in `OutlineNodeKind` + `KIND_LABEL` +
   `isContainer` (`OutlineTree.tsx:87`).
3. Per-type actions: lane phases get everything a milestone gets (they have a
   real `laneId`, so "Move to lane…" is correct). Annotations have no
   `laneId` (`tree.ts:105`, `laneAddressable: false`) and no status/style —
   correctly limited to edit/delete only; don't force lane-style actions onto
   them.
4. Promote the two buttons per Part A.

**Open questions to resolve before implementing**: does a lane phase belong
under its lane's Row grouping or a separate sub-list? Should the Program band
be collapsible (Program has no `collapsed` field today —
`tree.ts:352-355` deliberately rejects adding one)? `buildMultiProgramOutlineTree`
(`tree.ts:236`) reuses `buildOutlineTree`, so both fixes automatically
propagate to the read-only All-Programs tree — confirm that's wanted.

---

## 6. No Redo button

**User report**: "I need a redo button just like undo."

**Root cause — no redo stack exists anywhere.** `CorrectionBoxState` has
exactly one history field: `history: DocumentSnapshot[]`
(`use-correction-box.ts:122`). The undo case (`:360-366`) restores the last
snapshot and does `history: state.history.slice(0, -1)` — the popped
snapshot is discarded, not moved anywhere. No `future`/`redoStack` field, no
`redo` action exists in `CorrectionBoxAction` (`:148`).

**Surprising finding, worth flagging explicitly**: `src/lib/realtime/undo-manager.ts`
wraps Yjs's own `Y.UndoManager`, which natively supports `.redo()` right
alongside `.undo()` (confirmed in `node_modules/yjs/dist/src/utils/UndoManager.d.ts:139`)
— but it is **completely unused** outside its own file and test. The file's
own header comment says explicitly it "has nothing to do with" the reducer's
`history`; `use-program-room.ts:11` imports only `LOCAL_ORIGIN` from it. So
this is not "wire up an unused button" — it's a genuinely separate mechanism
built for a future CRDT-native editing path. **The fix should extend the
reducer's own history, not reach for Yjs.**

**Fix approach:**
1. Add `future: DocumentSnapshot[]` to `CorrectionBoxState` (`:118-135`) and
   `{type: "redo"}` to the action union (`:148`).
2. Undo case (`:360`): push the current `{data, portfolio}` onto `future`
   instead of discarding. New redo case: the mirror image — pop `future`,
   push current onto `history`.
3. **Clear `future` on any new edit without touching ~40 call sites.** Rename
   the existing exported `reduce` (`:295`) to an inner function; make the
   exported `reduce` a thin wrapper that returns `{...next, future: []}`
   whenever `next.history !== state.history` — i.e., whenever this action
   actually pushed a snapshot. Every mutating case already grows `history`;
   every non-edit case (`hydrated`, `snapshotRollups`, `setFromRemote`,
   `requestStarted`, …) deliberately doesn't, so "did history grow" is
   already the correct signal for "was this a real edit."
4. Expose `redo`/`futureLength` from the hook; render a Redo button right
   after Undo in `CorrectionBox.tsx:249-256` (same styling,
   `disabled={box.futureLength === 0}`), and mirror it in
   `CorrectionSidebar.tsx:71-79`.

**Risks/questions**: should a remote collaborator's edit (`setFromRemote`)
clear the local redo stack? It doesn't push `history` today, so under the
rule above `future` would survive a remote edit — redoing afterward would
re-apply a stale whole-document snapshot over the remote change. Recommend
explicitly clearing `future` in the `setFromRemote` case. `history` is
already unbounded whole-document snapshots; `future` doubles that memory
footprint — acceptable for now, worth a comment. No keyboard shortcuts exist
for Undo either today, so Redo shortcuts are out of scope unless requested.

---

## 7. No way to add a new Program — and a landmine if you just add the button

**User report**: "Where do I add programs? cant seem to find a place."

**Current state**: two Program-creation paths exist, both **import-only**:
`ImportPanel.tsx:197` (AI-extraction "Add as a new Program" checkbox) and
`SpreadsheetImportTab.tsx:359` (CSV/XLSX/Smartsheet), both POSTing to
`/api/portfolios/[portfolioId]/programs/extract`. Discoverability is bad on
its own: `ImportPanel` opens from Options → Data → Import (`:1387-1394`) —
nothing there is labeled "Program." **There is no blank/empty-Program path at
all** — `createProgramFromData` (`program-storage.ts:153`) has exactly two
callers in production: the extract route and t17's migrate-local route.

**The All-Programs page (`/p/[portfolioId]/all`) offers nothing either** —
its header row (`:284-299`) has only "← Back to Portfolio," a label, and the
Select-mode toggle. The only Program-level mutation anywhere on that page is
reorder ▲/▼.

**⚠️ Hard prerequisite, found during investigation — do not skip this.**
`src/app/api/portfolios/[portfolioId]/view/route.ts:52-57` does
`listProgramSnapshotsForPortfolio(...)` then reads **`snapshots[0]`,
hardcoded**. The editing route `/p/[portfolioId]` has no `programId` segment
at all. So **today, a Portfolio's 2nd+ Program can only ever be viewed
read-only (merged) on `/all` — it can never be opened for editing in
`RoadmapWorkspace`.** Adding a "New Program" button without fixing this
creates Programs the user can never open. Fix this first, or in the same PR.

**Fix approach:**
1. Give `/view` an optional `?programId=` query param (`route.ts:57`) instead
   of hardcoding index 0, and give `/p/[portfolioId]` a way to pass it
   through (query param is the cheapest option — no new route folder needed).
2. Add per-Program "Open" links on the `/all` outline's Program roots
   (`OutlineRow`, `all/page.tsx:115`), linking to `/p/[portfolioId]?programId=...`.
3. Add a "+ New Program" button to `all/page.tsx:284-299`, gated by the
   existing `canReorderPrograms` (`:251`, owner/editor), prompting for a name
   inline (matching the page's existing minimal inline-UI convention,
   `:147-151`).
4. **Reuse the existing extract route, no new backend needed**: POST
   `{document: {programName, swimlanes: [], milestones: [], topLevelItems: []}}`
   to `/api/portfolios/[portfolioId]/programs/extract` — it already assigns
   `id`/`portfolioId`/`order` and calls `createProgramFromData`, matching the
   "legitimate bulk seed" pattern its own doc comment describes (`:17-22`).
   If the "extract" naming bothers you, a sibling `POST .../programs` route
   with the same body is ~20 lines. Refetch via the page's existing
   `fetchAllProgramsData` (`:72`).

**Risks**: verify `RoadmapTimeline`/`mergeForRender` render a zero-lane,
zero-milestone Program without throwing — `programName` would be the only
required field on creation. The `order` heuristic is non-atomic (already
documented at `route.ts:53-55` as a known, accepted limitation). Check
`seedProgramDoc`/`isProgramDocSeeded` treat a genuinely-empty Program as
already seeded, or the realtime room may try to reseed it on first connect.

---

## 8. Snapshot creation is buried inside the Export dialog

**User report**: "how do I add snapshots? only view snapshots is there."

**The user's read is exactly correct.** `ExportDialog.tsx:40` defines
`ExportDestination = "pptx" | "slides" | "snapshot"`; the 3-way radio is at
`:546-558`. `saveSnapshot` (`:338-356`) POSTs to
`/api/portfolios/${portfolio.id}/snapshots`, called from `handleExportClick`
(`:387-389`) — **after** the full slide-deck build (`buildExportSlides`,
`buildSlideIRs`). `SnapshotsPanel.tsx` is deliberately read-only (its own
header comment: "Immutable, view-only records saved from the Export
dialog") and the Options row only ever offers "View Snapshots ›"
(`RoadmapWorkspace.tsx:797-801`) — there is genuinely no "create" affordance
near "view."

**Constraint to respect**: a Snapshot isn't one-click-able in principle — it
needs a full `ExportSelection` (which of 5 deck sections, per-Program id
sets, a scenario id) plus a built Slide IR. A naive "Save Snapshot" button
that guesses a selection would silently archive the wrong thing.

**Fix approach (smallest correct change, no duplicated logic):**
1. Add an optional `initialDestination?: ExportDestination` prop to
   `ExportDialog`, used to initialize its `destination` state (near `:178`).
2. In `RoadmapWorkspace.tsx:797-801`, add a second button next to "View
   Snapshots ›": **"Save Snapshot ›"** — opens the same `ExportDialog` with
   `initialDestination="snapshot"` (a small new `useState` alongside `:508`).
   User lands directly on the section-picker with "Save Snapshot"
   pre-selected — one click closer, zero duplicated export logic.
3. Optionally also add the same button to `SnapshotsPanel`'s empty state
   (`:120`, "No Snapshots saved yet.") via a new `onCreate?: () => void` prop
   that closes the panel and reopens the dialog in snapshot mode.

**Risks**: `ExportDialog` resets `snapshotSaved` on each open (`:381`) —
confirm reopening with a pre-set destination doesn't strand stale
`exportError`/`snapshotSaved` state. The new button should be hidden for
viewers — note the workspace currently only threads `canManageSharing`
(owner-only) down, not a general editor-vs-viewer role; may need that role
passed from `p/[portfolioId]/page.tsx` to gate this correctly.

---

## 9. Category colors need a popover near the Legend, not the Options modal

**User report**: "The category colors I need to be able to edit without
having to open the options, i want it right near the legend itself a popoup
window to manage the categories."

**Confirmed: this is UI-only work — every mutation already exists in the
reducer.** `addCategory` (`use-correction-box.ts:950`), `renameCategory`
(`:965`), `recolorCategory` (`:977`), `removeCategory` (`:989`) are all
implemented and already exposed through the hook (`:1134-1137`,
`:1448-1451`, `:1521-1524`). `ChartLegend.tsx` already renders a
`CategorySwatch` per category and already wires the "+" add button
(`:189-199`) to `box.addCategory` — but the swatch itself (`:60-83`) is
click-to-toggle-visibility only (deliberately, per t22 — show/hide is a
viewer preference, not document content); there's no rename/recolor
affordance on it. `CategoryManager.tsx` has the full per-row UI (color
input, name input, tagged-count, two-step delete) but only as a full-screen
modal opened from Options → Layout → Categories.

**Fix approach:**
1. New `src/components/timeline/CategoryPopover.tsx` — a small
   absolutely-positioned card (not `fixed inset-0`), holding just one
   category's color + name fields, lifted from `CategoryManager.tsx:58-72`
   (optionally the delete-with-confirm block too, `:76-100`). Close on
   outside-click/Escape.
2. Give `CategorySwatch` an optional `onEdit?: () => void` — **don't
   overload the existing click**, which is the documented show/hide toggle
   with `aria-pressed` semantics. Add a small pencil/caret affordance
   revealed on hover/focus, or make the colored dot itself the edit target
   while the label text stays the toggle. Wrap in `relative` for anchoring.
3. Add optional `onRenameCategory`/`onRecolorCategory`/`onRemoveCategory`
   props to `ChartLegendProps` (`:95-105`), wired at
   `RoadmapWorkspace.tsx:1465-1475` to the existing `box.*` handlers. Keep
   them optional — `all/page.tsx:346-356` renders `ChartLegend` read-only and
   must stay uninteractive.
4. Leave `CategoryManager.tsx` as the bulk-management surface; the popover is
   just the fast path for one category at a time.

**Risks**: `CategoryManager`'s color/name inputs currently dispatch a full
reducer action (and a full document-snapshot push onto undo history) per
keystroke/drag — a live color-picker drag in a popover will make this much
more visible/annoying than it already is in the modal. Worth debouncing or
committing on blur/close rather than on every input event, in the popover at
least. Confirm the popover is excluded from the off-screen export-capture
path and isn't clipped by the chart container's overflow.

---

## Cross-cutting notes for whoever picks this up

- None of these are wayfinder tickets (t1-t42 are all done and this is new
  scope) — don't try to fit them into `.wayfinder/tickets-meta.json`'s
  format; this doc is the spec.
- §3/§4/§5 explicitly share layout budget — read the "toolbar contention"
  note in §3 before starting any one of them in isolation.
- §7's `/view` route fix is a prerequisite for §7's own "New Program" button,
  not an optional nice-to-have — sequence it first within that item.
- §1 and §2 are the only items presented as regressions/bugs rather than
  missing features; prioritize accordingly if triaging by severity rather
  than by the order above.
