# Wayframe — Rebuild Specification (Archer Environment)

> **Revision note (2026-08-17):** this spec was the Phase 1/2 baseline the Archer build started
> from. Archer has since shipped a real delta beyond it — polish, new subsystems (Saved Views,
> mass-edit, a deterministic CSV/XLSX wizard), and one deliberate deviation from a stated
> constraint. That delta is now folded into the sections below (each addition is marked
> **`(Archer delta)`**) so this remains the single accurate baseline for both sides. **§17** is a
> compact index of every delta item and where it's documented, plus what's still explicitly *not*
> folded in (still-gated AI-correction-bar/op-log work, and features Archer has only planned, not
> shipped).

## 0. How to use this document

This is a from-scratch build spec for **Wayframe**, a roadmap-visualization tool, written for
an implementer (human or AI) who has no access to the original codebase. It describes
**behavior and data model**, not the original React/Next.js implementation — build it in
whatever stack Archer's environment provides. Where the original implementation used a
specific technique worth carrying over (a formula, an algorithm, a non-obvious rule), that's
called out explicitly as "**Implementation note**."

The spec is split into two build phases because of a real constraint: the original app's
signature feature (turning rough notes into a roadmap, and editing by typing plain English) is
powered by server-side calls to the Claude API and, optionally, Smartsheet — and neither
credential is available yet.

- **Phase 1 — ship first.** A fully-functional roadmap *visualization and manual-editing* tool.
  No AI, no Smartsheet, no server-side secrets. A user builds a roadmap by hand (or by opening a
  previously-saved file), views it in two modes, edits it, and exports it. This is a complete,
  usable product on its own — it is *not* a stub or a placeholder.
- **Phase 2 — turn on later.** Adds the AI-driven ingestion (notes/photo/CSV/Smartsheet →
  roadmap) and the AI-driven natural-language correction box, once an Anthropic API key (and
  optionally a Smartsheet token) is available. Everything in Phase 2 is additive: it does not
  change the Phase 1 data model or rendering, it only adds new ways to produce edits that Phase 1
  already knows how to apply and undo.

Every section below is labeled **[Phase 1]** or **[Phase 2]**. Build and ship Phase 1 completely
before starting Phase 2.

---

## 1. Product summary

Wayframe is a **swimlane roadmap chart tool** for a program manager who needs to keep a
milestone-level roadmap ("Program view") and a two-minute risk-first summary ("Executive view")
in sync, edit them quickly, and export both as slides.

Core value proposition (Phase 1 + Phase 2 combined):

- **Unified ingestion** *(Phase 2)* — pasted notes, a photo of a whiteboard, a CSV upload, or a
  live Smartsheet pull all feed one AI extraction call into one shared roadmap schema.
- **Two views** *(Phase 1)* — a full milestone-level **Program** timeline (swimlanes, dependency
  connectors, duration pills, a computed critical path) and a risk-first **Executive** view (RAG
  rollups per lane, top risks, a compact critical-path timeline strip).
- **AI correction box** *(Phase 2)* — describe a change in plain English ("delay UL 3100 by two
  weeks"); see a preview before it commits, with multi-step undo shared across AI and manual
  edits.
- **Manual editing** *(Phase 1)* — a modal editor for milestones and top-level items, cascading
  dependent dates automatically.
- **Ghost rendering** *(Phase 1)* — a slipped milestone shows a `+/-Nd` badge or dashed outline
  against its original date, so schedule drift stays visible instead of silently overwritten.
- **At-risk projection** *(Phase 1)* — a separate, non-committed "might slip to" date can be
  projected forward without touching the committed date.
- **Export to Deck** *(Phase 1)* — one click captures both views as a PowerPoint (`.pptx`).
- **Save/open** *(Phase 1)* — round-trip a roadmap to a `.wayframe.json` file, plus automatic
  browser-local persistence.
- **Themes and swimlane management** *(Phase 1)* — three switchable visual themes; add, rename,
  reorder, recolor, and delete lanes.

---

## 2. Build phases at a glance

| Capability | Phase | Needs |
|---|---|---|
| Program view + Executive view rendering | 1 | — |
| Manual milestone/top-level-item editing, cascade, undo | 1 | — |
| Swimlane management (add/rename/reorder/recolor/delete/RAG override/density) | 1 | — |
| Critical path computation | 1 | — |
| Ghost rendering (slip badges/outlines) + "accept baseline" | 1 | — |
| At-risk projection (potential date) | 1 | — |
| Drag-to-reschedule, drag-to-create, click-to-add | 1 | — |
| BLUF ("So what") rich-text panel | 1 | — |
| Themes, axis tiers, gridlines, label density, font scale/family | 1 | — |
| Save/Open `.wayframe.json`, browser localStorage autosave | 1 | — |
| Export both views to a `.pptx` deck | 1 | — |
| Company logo upload + freeform placement | 1 | — |
| Demo/QA fixture route (a canned example roadmap) | 1 | — |
| Midnight starter template entry point *(Archer delta)* | 1 | — |
| Options-menu accordion sections *(Archer delta)* | 1 | — |
| Saved Views + built-in presets *(Archer delta, §10)* | 1 | — |
| Legend categories + category-fill/status-outline encoding *(Archer delta, §7.6)* | 1 | — |
| Connector shape (elbow/S-curve/rounded) + dash/arrowhead style *(Archer delta, §7.10)* | 1 | — |
| Today progress overlay *(Archer delta, §7.11)* | 1 | — |
| Duration-pill %-complete visualization + vertical stacking *(Archer delta, §7.12)* | 1 | — |
| Auto lane height, date-label placement, swimlane owner *(Archer delta, §7.13)* | 1 | — |
| Edit/View mode lock *(Archer delta, §8.8)* | 1 | — |
| Mass-edit / bulk multi-select *(Archer delta, §5.6)* | 1 | — |
| Deterministic CSV/XLSX import wizard (no AI) *(Archer delta, §13)* | 1 | — |
| Vector (native-shape) PPTX export option *(Archer delta, §9.2)* | 1 | — |
| Backend env-guard + health endpoint *(Archer delta, §14.4)* | — | — |
| AI extraction from typed notes / photo | 2 | Claude API key |
| AI extraction from CSV upload | 2 | Claude API key |
| AI extraction from Smartsheet | 2 | Claude API key + Smartsheet token |
| AI natural-language correction box | 2 | Claude API key |

Phase 1 ships with a **blank-roadmap entry point** and/or an **import of a previously-saved
`.wayframe.json` file** as the only ways to get data in (see §11 for what Phase 2 adds on top).
A recommended Phase-1-only addition: a "start from a template" option that pre-populates a
starter document (a few lanes, one sample milestone) since there is no AI extraction yet to fill
a blank canvas quickly. This isn't in the original product (which always had AI extraction as
day-one) but is a reasonable Phase 1 substitute — flag it to the product owner as a judgment call
rather than a hard requirement.

---

## 3. Tech stack & environment assumptions

The original implementation: Next.js (React) + TypeScript + Tailwind CSS, chart rendered as raw
SVG (no charting library), state in a single `useReducer`, deployed as a static/serverless site
with two thin serverless API routes for the Phase-2 AI calls.

For Archer, given "start with a single HTML-hosted page style, Node.js is supported":

- **Phase 1 can ship as a static, client-only single-page app** — TypeScript, bundled to one HTML
  page (or a small number of static assets). No backend is required for Phase 1: all state lives
  in the browser (in-memory + localStorage), and file save/open uses browser download/file-input
  APIs. This matches "single html hosted page style" directly.
- **Phase 2 needs a small Node.js backend** (or serverless functions) for exactly two
  responsibilities: (a) hold the Anthropic API key and proxy the two AI calls (extraction,
  correction) server-side — **the key must never reach client-side code** — and (b) optionally
  hold the Smartsheet token and proxy Smartsheet reads the same way. Everything else Phase 2 adds
  is still client-side logic (schema validation, cascade, preview building).
- **Rendering:** the original renders the whole Program-view chart as one large inline SVG that
  the container scrolls if too wide, computed from date math (a linear time scale) rather than
  a charting library. This is a deliberate choice — recommended to carry over, since collision
  avoidance, dependency-connector routing, and drag interactions all need direct control over
  individual marker geometry that most off-the-shelf chart libraries don't expose. Canvas is a
  viable alternative if Archer's environment favors it, but hit-testing/dragging/hover-tooltips
  are simpler in SVG (DOM elements) than canvas (manual hit-testing).
- **Persistence format:** a single JSON document (schema in §4) is the source of truth for
  everything in both views. Treat it as the one file format to design around.

Data model, algorithms, and UI behavior below are written implementation-agnostically; treat
concrete numbers (pixel sizes, colors) as reference defaults to match the look, not hard
requirements.

---

## 4. Data model — the roadmap document

The whole application state is one JSON-serializable document, `RoadmapData`. This is the save
file format, the localStorage format, and the shape every edit (manual or AI) ultimately
produces.

### 4.1 Top-level document

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | string | Version tag for the document shape, e.g. `"1.0"`. |
| `programName` | string | Program title, shown in both views' headers. Click-to-edit in Program view header and (implicitly) available in Executive view. |
| `generatedAt` | string (ISO datetime) | Stamped once, at creation time. Never rewritten after. |
| `lastUpdatedAt` | string (ISO datetime), optional | Bumped on every document-changing edit (see §5.2). Distinct from `generatedAt`. Powers a small "Updated M/D h:mm" badge, toggleable. |
| `owner` | string | Program owner's name. |
| `reportsTo` | string, optional | Who the owner reports to. Editable inline in Executive view. |
| `nextReviewDate` | string (ISO date), optional | Editable inline in Executive view. |
| `bluf` | object | The "So what" callout — see §4.4. |
| `actionItems` | array of `ActionItem` | Currently populated by extraction; not surfaced in any UI view in the original (carry the field through save/open for forward-compatibility even if Phase 1 doesn't render it). |
| `swimlanes` | array of `Swimlane` | See §4.2. |
| `topLevelItems` | array of `TopLevelItem` | The "PROGRAM band" row at the top of the chart — program-level milestones/phases/annotations that aren't inside any lane. See §4.3. |
| `milestones` | array of `Milestone` | Lane-scoped items. See §4.5. |
| `companyLogo` | object, optional | `{ dataUrl: string, dx?: number, dy?: number, scale?: number }`. An uploaded logo image, stored inline as a data URL (no blob storage — it travels with the document). `dx`/`dy`/`scale` are a freeform drag/resize offset from the default top-left placement; undefined/1 means "hasn't been moved." |
| `legendCategories` | array of `LegendCategory`, optional **`(Archer delta)`** | Document-level vocabulary of named, colored tags a milestone can carry independent of its lane and status — see §7.6's category-fill encoding. `LegendCategory = { id: string, name: string, color: string }`. Managed via a dedicated add/rename/recolor/delete modal, same shape as the Swimlane manager. |

`ActionItem`: `{ id, text, owner?, dueDate?, done? }`.

### 4.2 Swimlane

A swimlane is a row in the Program view. Two `type`s: `"lane"` (holds milestones) and
`"separator"` (a group-header band with no milestones, purely organizational).

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable id. |
| `order` | number | Sort key; lanes render top-to-bottom by ascending `order`, renumbered contiguously (no gaps) after every add/remove/reorder. |
| `type` | `"lane" \| "separator"` | |
| `name` | string | |
| `ragOverride` | `"green" \| "amber" \| "red"`, optional | Manual override of the Executive-view RAG rollup for this lane. Unset = auto-computed (§7.4). |
| `color` | string (hex), optional | Per-lane color pin. Unset = falls back to the active theme's generated lane palette by lane index (§7.6), so switching themes restyles every un-pinned lane. |
| `rollupHistory` | array of `RollupSnapshot`, optional | Append-only, one entry written passively per calendar day per lane, on load/view — **never** through the undo-tracked edit path (it's not a user edit). Powers the Executive-view trend arrow. `RollupSnapshot = { date: string, rag: Rag, atRiskCount: number, delayedCount: number }`. |
| `density` | `"normal" \| "lean"`, optional | `"lean"` renders the lane row at 75% of normal height, for lanes with few milestones. Document content (an editorial layout call), not a per-viewer preference — everyone opening the file sees the same density. |
| `owner` | string, optional **`(Archer delta)`** | Per-lane owner name, shown as a muted second line below the lane name in the header gutter, toggleable per-viewer (§10). Document content, same placement reasoning as `color`/`density` above — an editorial fact about the lane, not a viewer preference. |

### 4.3 TopLevelItem (PROGRAM band)

A discriminated union on `type`, one of three shapes:

- **`milestone`**: `{ id, type: "milestone", title, date, status, showReferenceLine?, potentialDate? }`
- **`phase`**: `{ id, type: "phase", title, startDate, endDate, status, potentialDate? }`
- **`annotation`**: `{ id, type: "annotation", title, date, message }` (no `status` — annotations are a note pinned to a date, not a tracked deliverable)

`status` is one of the shared `Status` enum (§4.6). `showReferenceLine` (milestone only) draws a
full-height vertical marker line through the whole chart, same visual mechanism as the always-on
"Today" line. `potentialDate` is the at-risk projection (§7.5) — for a phase it projects a
possible later `endDate`, not `startDate`.

### 4.4 BLUF ("So what" panel)

```
bluf: {
  statement: string,          // sanitized rich-text HTML (see §14.3), the headline
  bullets: string[],          // sanitized rich-text HTML, supporting points
  label?: string,             // free-text panel heading, default "So what"
  size?: { width: number, height: number | null }  // null height = auto-height
}
```

`statement`/`bullets`/`label` carry a **small, fixed rich-text vocabulary** (bold/italic/
underline/strike/inline code/link/color-highlight/line-break), authored through a
contentEditable-style inline toolbar, not a general HTML editor. This is document content
(travels with save/export), not plain text — see §14.3 for the sanitization requirement, which
is a hard security requirement, not a nice-to-have.

### 4.5 Milestone (lane-scoped item)

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `laneId` | string | FK into `swimlanes` (must be `type: "lane"`). |
| `title` | string | |
| `date` | string (ISO date `YYYY-MM-DD`) | The committed date. For a duration item, this is the **start**. |
| `status` | `Status` | See §4.6. |
| `percentComplete` | number 0–100, optional | |
| `owner` | string, optional | |
| `comment` | string, optional | |
| `dependsOn` | array of `{ id: string, showConnector: boolean }` | Predecessor edges — `id` is the predecessor milestone's id. `showConnector` curates which edges actually draw a connector line on the chart (a milestone can depend on another without a drawn line) — except a critical-path or actively-traced edge, which always draws regardless of this flag. |
| `linksToTopLevelMilestone` | string \| null | Optional FK to a `TopLevelItem` of type `milestone` — a lane milestone tied to a program-level milestone (contributes to critical-path/finish-date computation; see §7.2). |
| `isCriticalPath` | boolean | **Computed**, not hand-set — see §7.2. Recomputed and persisted into the document on every edit. |
| `isCriticalPathOverride` | boolean, optional | Manual override; wins over the computed value when set. |
| `attachments` | array of `Attachment`, optional | `{ type: "image" \| "link", url: string, label?: string }`. |
| `shortLabel` | string, optional | Hand-picked abbreviation for the always-visible marker label. Falls back to an auto-derived short label (initials of significant words in the title) when absent. |
| `originalDate` | string (ISO date), optional | Baseline snapshot — see §7.3 (ghost rendering). Set **once**, the first time an edit moves `date` away from it; never re-baselined by a later shift. Cleared by "Accept baseline." |
| `endDate` | string (ISO date), optional | When set (and later than `date`), this milestone renders as a **lane-scoped duration pill** spanning `date → endDate` instead of a point marker — same entity, not a separate item type. Blank/absent = point milestone. |
| `showReferenceLine` | boolean, optional | Same full-height marker line as the top-level version. |
| `potentialDate` | string (ISO date), optional | At-risk projection (§7.5) — the temporal *opposite* of `originalDate`: this projects a possible *future* date without moving anything committed. For a point milestone, projects `date` forward; for a duration pill, projects `endDate` forward (the pill's start is already underway). |
| `categoryId` | string \| null, optional **`(Archer delta)`** | FK into `RoadmapData.legendCategories` — independent of `laneId` (organizational) and `status` (state). When the category-fill viewer preference is on (§7.6) and this is set, the marker/pill fill becomes the category's color and `status` moves to the stroke/border instead of the fill. `null`/absent = no category, renders exactly as the un-tagged baseline. |

### 4.6 Status enum

`Status = "not-started" | "on-track" | "at-risk" | "delayed" | "complete"`

Status drives marker fill color only (never shape — every marker is the same diamond silhouette,
deliberately, so severity reads purely on a lightness/chroma gradient rather than relying on
color alone to separate five states — see §7.6 for the exact rationale, worth preserving for
color-blind accessibility).

### 4.7 Referential integrity rules (must hold on every save/load)

- Every `Milestone.laneId` must reference an existing `Swimlane` of `type: "lane"`.
- Every `Milestone.dependsOn[].id` must reference an existing `Milestone`.
- Every `Milestone.linksToTopLevelMilestone` (if set) must reference an existing `TopLevelItem`.
- No dangling references are allowed to persist silently. **On file open, validate the shape
  first (schema), then referential integrity (the above), and reject with a specific,
  human-readable list of problems if either fails — never partially load a broken document.**
  This is a deliberate fail-closed design: a malformed file must not put the app in a state where
  the chart throws on render.

---

## 5. Application architecture

### 5.1 Single source of truth + reducer

All state mutation — manual edits, drags, AI-applied ops (Phase 2), imports, swimlane
management — funnels through **one reducer** operating on `{ data: RoadmapData, history:
RoadmapData[], ...transient UI state }`. This is what makes a single linear undo stack cover
every edit source uniformly. Don't build parallel mutation paths (e.g. a separate "quick edit"
that bypasses the reducer) — every code path that changes the document dispatches an action.

### 5.2 Undo model

- `history` is a stack of **full prior document snapshots**. Every document-changing action
  pushes the *pre-edit* document onto `history` before applying the change. Undo pops the top of
  `history` and restores it. This gives multi-step undo (not just one level), at the cost of
  memory — acceptable given document size (a few hundred KB of JSON at most).
- No redo stack in the original (an accepted scope cut — flag it as an easy Phase-1 enhancement
  if desired, since the data model change is trivial: track a forward stack cleared on any new
  edit after an undo).
- **Which actions push onto `history` (undoable):** every manual edit (milestone/top-level-item
  field changes, drag-to-reschedule, add/delete milestone or top-level item, swimlane
  add/rename/reorder/recolor/delete/RAG-override/density, BLUF edits, document-header edits,
  attachment edits, company-logo upload/remove/reposition, accept-baseline, and — in Phase 2 —
  every applied AI correction and every AI extraction/import (loading a document wholesale is
  still undoable, so importing over in-progress work is recoverable).
- **Which actions do NOT push onto `history` (not user edits):** rehydrating a persisted document
  from localStorage on mount, and the passive once-per-day rollup snapshot write (§4.2). Undo
  after either of these should be a no-op relative to them, not revert them.
- `lastUpdatedAt` is stamped on every action that pushes onto `history`; the two passive actions
  above skip it too.

### 5.3 Cascade (dependency-aware date pushing)

**[Phase 1]** — this is pure client-side logic, not AI. When a milestone's `date` changes (by
any path: manual edit, drag, or later, an applied AI correction), walk the dependency graph
forward:

1. Build a reverse-adjacency map: for every milestone, which other milestones list it in their
   `dependsOn`.
2. Starting from the set of milestones whose `date` just changed, breadth-first traverse
   dependents. For each dependent, if its current (possibly already-cascaded-in-this-pass) date
   is earlier than `predecessor's new date + 1 day`, push it to `predecessor's new date + 1 day`
   and continue the walk from it.
3. Only `date` changes cascade. A status-only edit on a predecessor implies nothing about a
   dependent's date.
4. Every cascaded shift is itself a normal date-change op — it also stamps `originalDate` the
   first time it moves a given milestone away from its baseline (same rule as any date edit, see
   §7.3).

**Implementation note:** don't try to model this as classic CPM float/slack — the original tried
that first and abandoned it (see §7.2's note on why "critical path" isn't computed via slack
either). Milestones are dateless *points*, not durations with float, so a slack-based cascade
degenerates. A simple forward BFS push, one day of minimum gap, is the whole algorithm.

### 5.4 Critical path (computed, not modeled as CPM/slack)

**[Phase 1]** "Critical path" here does **not** mean classical CPM (critical path method with
float). Since milestones are points, not durations, there's no meaningful slack to compute (an
early prototype tried a zero/negative-slack backward pass and every chain-end came out
"critical" by construction, with no dependency edge connecting any two of them).

Instead: **critical path = the single longest dependency chain that ends at the program's overall
finish date.**

Algorithm:

1. A milestone's "finish" is `endDate` if set (duration pill), else `date`.
2. The program's finish = the latest finish among every milestone that has at least one
   `dependsOn` edge or at least one dependent (isolated, unconnected milestones don't count), also
   considering any milestone's linked top-level-milestone date via `linksToTopLevelMilestone`.
3. Every milestone whose finish equals the program's finish (ties included — two lanes landing on
   the same end date both count) is a candidate chain-endpoint.
4. For each candidate, compute the longest predecessor chain reaching it (memoized DFS over
   `dependsOn`, break depth ties by preferring the predecessor with the *later* own date — "of two
   equally-long chains, the one running latest has the least room"). Guard against cycles (treat
   a revisited node as a chain start rather than recursing forever — cycles shouldn't occur in
   valid data, but must not hang the app if they do).
5. Among the candidates, keep only those achieving the *deepest* chain (a single milestone that
   happens to land on the finish date shouldn't read as critical alongside a six-hop chain that
   fought its way there).
6. Walk backward from each kept endpoint along its longest-chain predecessor pointers, collecting
   every id visited — that set is the critical path.
7. This recomputes on every document change and is written back into each `Milestone.isCriticalPath`
   field (not a live-derived selector) — except where `isCriticalPathOverride` is set, which wins.

`linksToTopLevelMilestone` contributes to step 2 (a lane milestone tied to a top-level milestone
can pace the program) but the top-level item itself is never walked (it has no predecessors of
its own to continue a chain into).

### 5.5 Ad-hoc trace (separate from critical path)

**[Phase 1]** A per-viewer, non-persisted "highlight everything upstream/downstream/both of this
one milestone" feature, triggered from the milestone editor. This is **view state, not document
content** — two people viewing the same document can trace different milestones simultaneously,
and it's cleared by dismissing it, never written to the file. Implemented as a transitive-closure
BFS/DFS over `dependsOn` in the requested direction(s), starting from one milestone id.

Rendering rule: traced markers/edges get a distinct highlight color (the active theme's accent),
never red (red is reserved for critical path, so the two meanings never collide); everything
*outside* the trace dims to ~22% opacity so the traced subgraph reads clearly. Where critical path
and an active trace overlap on the same edge, critical path wins the line color but the trace
still visually lifts the markers.

### 5.6 Mass-edit / bulk multi-select `(Archer delta)`

**[Phase 1]** A selection model layered on top of everything above — viewer/session state (a
`Set` of selected milestone ids), not document content and not itself undo-tracked; only the bulk
edit it eventually produces pushes onto the undo stack, as **one atomic entry** (Undo reverses the
whole bulk action at once, not one field at a time).

- **Entering selection:** a "Select mode" toggle (own viewer preference, §10) arms two pickers:
  clicking a milestone marker toggles it in/out of the selection instead of opening its editor;
  a pointer-drag on empty lane background draws a rubber-band rect, and releasing it adds every
  point milestone whose marker center falls inside to the selection. Duration pills don't
  participate — mass-edit is scoped to point milestones. Selection mode and any in-progress
  placement gesture (§8.4) are mutually exclusive.
- **The toolbar:** shown whenever the selection is non-empty — a count, and four actions:
  - **Shift dates…** — a signed integer (±N days) applied to `date` (and `endDate`, for a
    duration pill, by the same delta) via the identical deterministic bulk-shift resolver Phase
    2's AI correction path uses for its own `bulkShiftOps` (§12.3) — one shared implementation,
    just given an explicit id list instead of a model-resolved selector.
  - **Set status** — one of the five `Status` values, applied to every selected milestone.
  - **Move to lane** — reassigns `laneId` for every selected milestone to a chosen lane. Not
    expressible as an ordinary field-edit op (lane reassignment was never part of that op
    vocabulary) — applied as a direct field write instead.
  - **Accept baseline** — clears `originalDate` (§7.3) on every selected milestone that actually
    has one; milestones with nothing to accept are silently excluded from the batch, not flagged
    as an error.
- **Preview before commit:** picking an action computes a diff — one row per milestone that
  action would actually change (a milestone already at the target status contributes nothing) —
  with per-row accept/reject checkboxes defaulting to accepted. Apply commits only the accepted
  subset as one edit; Discard cancels with nothing written.

---

## 6. Views

The app has exactly two rendering modes for the same document, switched by a toggle in the header
chrome: **Program** (default) and **Executive**. Both are always exportable together regardless
of which is on-screen (§9.2).

### 6.1 Program view — the full timeline chart

A horizontal time-scaled swimlane chart. Structure, top to bottom:

1. **Header block** — program name (click-to-edit), owner (click-to-edit), optional company logo
   (freeform drag/resize once uploaded), "PROGRAM" chip.
2. **PROGRAM band** — one row, above all lanes, rendering `topLevelItems`: top-level milestones as
   point markers, phases as duration pills, annotations as flagged notes. Has its own "+" add
   affordance (§8.4).
3. **Date axis** — one to three stacked tiers: Year (always present, top), optionally Quarter
   and/or Month/Week beneath it, each row a sequence of labeled segments. Configurable (§7.9).
4. **Swimlane rows** — one per `Swimlane`, in `order`. A `"lane"` row holds a horizontal band with
   a subtle lane-colored wash, a colored rail + name in the left header gutter, milestone markers
   and duration pills, and a per-lane "+" (add) affordance. A `"separator"` row is a shorter,
   quiet group-header band with no milestones.
5. **Dependency connectors** — orthogonal "elbow" lines (predecessor → dependent, horizontal-then-
   vertical-then-horizontal) drawn between markers where `showConnector` is true, or the edge is
   on the critical path, or the edge is inside an active trace (those two always draw regardless
   of `showConnector`).
6. **Reference lines** — a full-height dashed vertical line for "Today" (always on) plus one per
   opted-in milestone (`showReferenceLine`), each with a small draggable label chip; a shared
   collision-avoidance layout keeps chips from overlapping (packing into rows / pushing right with
   a leader line on overflow), with per-chip manual drag override on top.
7. **Legend** — collapsible, below the chart; only shows entries for symbols actually in use on
   the current document/settings (e.g. the ghost-badge key only appears if ghost mode is on).
8. **BLUF ("So what") callout** — a small draggable/resizable panel (§4.4), default docked near
   top-right, dismissible/reopenable.

**Time scale:** linear, mapping calendar date → x-pixel, domain = `[earliest date across every
milestone/top-level-item field (including originalDate/potentialDate) − 14 days, latest such date
+ 14 days]`. Chart width either fills its container (default) or is pinned (used for the
off-screen export capture, so what's captured matches the full un-scrolled chart). Below a
minimum width, stop shrinking and let the container scroll horizontally instead of collapsing
labels into unreadable mush.

**Milestone marker:** a rotated rounded-square ("cushion diamond"), filled by `theme.statusColor[status]`,
always the same silhouette regardless of status (status is color-only — see §7.6 for why).
Always shows a short label above it and a compact date below it; hovering reveals the full title
(and, if slipped, the before/after dates) in a tooltip. Clicking opens the milestone editor.

**Duration pill:** a milestone with `endDate` set renders as a horizontal rounded-rect spanning
`date → endDate`, filled with a darkened shade of the lane's own color (not a status color — it's
a lane-scoped span, not a point-in-time state marker), with its title clipped/truncated to fit.
Carries the same critical-path/trace highlight treatment as point markers.

**Critical path line style:** a per-viewer choice of solid / thick / dashed / double, always
rendered in a fixed "critical" red distinct from the "delayed" status red (measured too close
together to double as the same meaning) — the emphasis intentionally lives in the *connector*
line, not the marker fill, so a diamond and a line never compete for the same read.

### 6.2 Executive view — risk-first summary

A single scrollable column, not time-scaled the same way as Program view:

1. Program name + a plain-text rendering of the BLUF statement as subtitle.
2. "Reports to" / "Next review date" — click-to-edit plain text fields.
3. **Compact timeline strip** *(only after "Generate" is clicked — see §6.3)* — a proportionally-
   spaced mini axis of "key dates" (critical path plus any at-risk/delayed milestone regardless of
   critical-path membership), diamond markers (solid = on critical path, hollow = off-path risk),
   short labels tiered to avoid collision, a short generated narrative sentence, and a legend.
4. **Top risks** callout — the top 3 at-risk/delayed milestones, ranked: critical-path-first, then
   severity (delayed > at-risk), then soonest date. Each row: title, lane, due date, status
   comment if any.
5. **Lane rollup grid** — one tile per lane, RAG-colored background/border, lane name, a trend
   arrow (↑ improving / ↓ worsening / → flat, vs. the most recent snapshot from before today), and
   a one-line "N milestones at risk" / "On track" summary.

### 6.3 Executive timeline summary (generated text)

**[Phase 1 — deterministic, not an AI call.]** Despite the name, this is **not** a live AI
generation — it's templated prose over already-computed data (critical path + status), the same
category of derived view as the lane rollups and top-risks list. Generate on-demand (an explicit
button, not live-recomputed every render, mirroring the once-per-day rollup-snapshot pattern) so
it doesn't churn on every unrelated edit. Logic:

- Key dates = the critical path (sorted by date) **unioned with** any at-risk/delayed milestone
  not on the critical path (critical-path-only would silently hide a real red milestone off the
  longest chain). Falls back to the top-level items list (sorted by date, first 6) if the document
  has neither a critical path nor any at-risk/delayed milestone.
- Narrative sentence: names the critical-path finish milestone; if a critical-path milestone
  itself is red, calls it out as "the pacing risk" (or, if it's the finish milestone itself, that
  it's directly at risk); appends a clause naming any off-critical-path red milestones by name.

---

## 7. Core rendering behaviors

### 7.1 Marker/label collision avoidance

**[Phase 1]** With many milestones close together in time, labels (titles above, dates below,
ghost badges, reference-line chips) will visually collide if placed naively. Required behavior,
not optional polish:

- Titles and dates each get a small number of vertical "tiers" (roughly: default position, then
  one or two escalating offsets further from the marker) assigned greedily based on proximity to
  already-placed labels in the same lane, so close-together markers' labels stack instead of
  overlapping.
- Ghost badges (§7.3) get their own independent tiered escalation, seeded with the same-lane title
  blocks as "blockers" so a badge doesn't land on top of a neighboring title.
- Reference-line chips pack into rows between the Today line and the axis, overflowing to a
  pushed-right position with a leader line back to the actual date when a row is full.
- On top of all automatic placement, support a **manual per-label drag-to-reposition** with a thin
  leader line back to the marker it belongs to, persisted per-viewer (not document content — see
  §10) so a manually-nudged label survives a reload.
- Text width estimates (for collision math, chip sizing, tooltip sizing) should scale with the
  font-scale viewer preference (§10) so labels never overlap regardless of the chosen size.

### 7.2 Critical path — see §5.4 (algorithm lives there since it's shared state, not just a
rendering concern).

### 7.3 Ghost rendering (slipped milestones)

**[Phase 1]** When `Milestone.date !== Milestone.originalDate` (i.e. the milestone has slipped
since its baseline was set), render a visual indicator, per a **per-viewer** on/off toggle and
style choice:

- **`badge`** — nothing drawn at the old date; a small pill badge (`+Nd` / `-Nd`, colored amber if
  late / blue if early) floats near the current marker.
- **`outline`** — a dashed, hollow outline of the marker drawn at the *original* date, no
  connecting line back to the current marker (a connector-line variant was prototyped and
  dropped — it tangled visually with real dependency connectors).
- **`off`** — no ghost rendering at all (the default).

`originalDate` is set automatically, once, the first time any edit moves `date` away from it — not
re-baselined on subsequent shifts. **"Accept baseline"** (per-milestone, from the editor, and a
bulk "Accept all" from the options menu with an inline confirm naming the count) clears
`originalDate`, making the current date the new normal with no cascade or critical-path
recompute (accepting a baseline never touches `date` itself).

### 7.4 RAG rollup (Executive view)

**[Phase 1]** Per-lane, worst-status-wins with one date-aware refinement:

```
for each milestone in the lane:
  if status == "delayed" -> lane is RED (short-circuit)
  if status == "not-started" AND date has already passed -> lane is RED (short-circuit)
  if status == "at-risk" -> remember AMBER (keep scanning for a RED)
if nothing above fired -> lane is GREEN
```

`Swimlane.ragOverride`, when set, wins outright over this computation. Trend arrow: compare
today's computed (or overridden) RAG against the most recent `rollupHistory` entry dated *strictly
before* today (never today's own just-written snapshot) — up/down/flat by RAG severity order
(green < amber < red); undefined/no-arrow if no such prior entry exists yet.

The rollup snapshot itself: once per calendar day, per lane, on document load/view, append `{
date: today, rag, atRiskCount, delayedCount }` to that lane's `rollupHistory` if no entry for
today already exists. This is a passive write (§5.2 — not undo-tracked, doesn't bump
`lastUpdatedAt`).

### 7.5 At-risk projection

**[Phase 1]** A separate, independent-of-ghosting mechanism: `Milestone.potentialDate` (or the
top-level-item equivalent) previews a date the item *might* slip to, without touching the
committed `date`/`endDate`. Rendered as a second, lighter-weight marker/indicator positioned at
the potential date, connected to the real marker, per a **per-viewer** style choice (support all
three, don't pick just one — each was kept intentionally after prototyping):

- **`sibling`** — dotted leader line to a small dashed hollow diamond at the potential date, with a
  `+Nd risk · <date>` pill badge.
- **`comet`** — a fading multi-segment streak from the real marker toward the potential date,
  ending in a soft translucent halo around a lightly-filled marker.
- **`zone`** — a translucent wedge/zone spanning committed→potential date, ending in a flag-pin
  marker at the potential date — reads as a range of uncertainty rather than a discrete alternate
  position.

Label tier escalation is shared with the ghost-badge tiering (§7.1) so the two mechanisms don't
collide when both are active on the same milestone.

### 7.6 Themes and color system

**[Phase 1]** Three complete, switchable named themes, each a coordinated whole (background, ink,
chrome, lane treatment, status ramp) rather than a palette swap on one base:

| Theme | Character |
|---|---|
| Blueprint (default) | Light, cool, technical — "reads like an engineering drawing." |
| Graphite | Dark, cinematic — built for on-screen/screenshot use. |
| Press | High-contrast light, saturated — built for decks/print. |

Each theme defines (at minimum): chart ground + ink + muted-ink colors, row divider color, axis
background/text, separator band colors, lane-wash opacity, a lane color-ramp spec (see below), a
5-entry status color ramp, critical-path color (always a fixed red, distinct from "delayed"),
trace color (never red), connector color, marker halo (the ring that lifts a marker off the lane
wash), page background, panel background/border/ink, and an accent color.

**Status color rule (revised by an Archer delta — read the deviation note below):** status was
originally communicated by **fill color only**, on a deliberate lightness/chroma gradient from
calm to severe (not five arbitrary hues) specifically because color alone can't reliably separate
5 categorical states for colorblind readers or in greyscale reproduction — a gradient at least
degrades gracefully where 5 arbitrary hues don't.

> **Deviation `(Archer delta, as-built, conscious)`:** Archer ships a **hollow marker for
> `not-started`** (ground-colored fill, the status color as a ring instead) rather than a filled
> gray diamond — every other status stays filled. This does encode one state by silhouette,
> which is exactly what the constraint above was written to avoid. It's an intentional,
> product-owner-approved deviation, not an oversight — carry it into the rebuild as-built rather
> than re-deriving the original constraint, but if colorblind/greyscale legibility is re-litigated
> later, this is the specific rule to revisit first.

**Legend category-fill / status-outline encoding `(Archer delta)`:** a per-viewer toggle (§10),
off by default. When on, a milestone carrying a `categoryId` (§4.5) renders with its **category's
color as the fill** and its **status color as the stroke/ring** instead — "what track is this"
becomes the dominant read, "how healthy is it" the secondary one. A `not-started` milestone still
renders hollow either way (the deviation above takes precedence for that one status regardless of
category). Milestones with no `categoryId`, or when the toggle is off, render exactly per the
status-fill rule above. Manage the category vocabulary (`RoadmapData.legendCategories`) through a
dedicated modal — add/rename/recolor/delete, mirroring the Swimlane manager (§8.3) — and expose
the assignment as a "Category" select in the milestone editor (§8.1), populated from that list and
hidden entirely when the document has no categories yet.

**Strikethrough delayed dates `(Archer delta, always-on)`:** the compact date label under a
`delayed` milestone's marker renders with strikethrough — no toggle, applies unconditionally to
that one status, every other status's date label is unaffected.

**Lane color generation (implementation note, worth replicating):** rather than a fixed palette
indexed by `% N` (which reuses colors once lane count exceeds the palette size), generate each
lane's color from the theme's ramp spec `{ L, C, startHue }` in OKLCH: hues spread evenly around
the wheel (`360 / laneCount` apart, starting at `startHue`), lightness `L` and chroma-ceiling `C`
fixed per theme, chroma reduced per-hue only as far as needed to stay inside sRGB gamut (not
globally reduced to whichever hue clips first — that would flatly desaturate the whole set). This
keeps any number of lanes visually distinct and "of one family." `Swimlane.color`, when set,
overrides generation entirely for that lane.

### 7.7 Legend

**[Phase 1]** A collapsible strip below the chart, persistently open/closed per-viewer. Content is
conditional on what's actually active: the 5 status swatches always show; critical-path swatch
only if critical path is currently shown; trace swatch only while a trace is active; duration-pill
swatch only if the document has at least one; ghost-badge swatch only if ghost mode is on;
at-risk swatch only if at-risk mode is on; "Today" line always shows.

### 7.8 Gridlines

**[Phase 1]** Per-viewer choice of period-boundary gridlines: off, a subtle vertical line per
segment-boundary of the currently-deepest axis tier, a vertical line per Year-boundary only
regardless of tier depth, or alternating shaded year bands.

### 7.9 Axis tiers

**[Phase 1]** A configurable 1–3 row date axis: **Year is always present** (top row); an optional
second row (Quarter or Month) and an optional third row strictly finer than the second (Quarter →
Month or Week; Month → Week only). Presets: Year only / Year+Quarter / Year+Month /
Year+Quarter+Month. A small in-chart disclosure control (expand-right to reveal the second tier,
expand-down to go one level finer, collapse-up) lets a viewer drill in without leaving the chart.
The Year row's color is user-pickable; Levels 2/3 are always derived as lighter shades of that
same picked color (not independently colorable) so the three tiers read as one coherent stack.
Sparse label rendering when segments get narrower than a legible label width (skip labels at a
stride, but still draw every segment's grid boundary) — required at Week granularity over a
multi-month domain.

### 7.10 Dependency connector shape and line style `(Archer delta)`

**[Phase 1]** Two independent per-viewer preferences (§10) layered onto the connector geometry
§6.1 already describes:

- **Shape** — `elbow` (the original orthogonal three-segment path), `s-curve` (a single cubic
  bezier from predecessor to dependent), or `rounded` (the same three waypoints, corners arced
  instead of squared). Applies to every connector regardless of critical/traced state — only the
  *path shape* changes, not which stroke treatment it gets.
- **Line style** — an ordinary-connector-only dash pattern (`solid`/`dashed`/`dotted`) and
  arrowhead (`standard`/`open`/`circle`). Deliberately **does not** apply to critical-path or
  actively-traced connectors, which keep their own fixed treatments (§6.1, §5.5) — a
  viewer-chosen style must never be able to make "this paces the program" ambiguous.

**Implementation note:** true pill-collision routing (a connector detecting and routing around an
intervening duration pill) is out of scope — connectors still route through their simple
predecessor→midpoint→dependent path regardless of shape choice.

### 7.11 Today progress overlay `(Archer delta)`

**[Phase 1]** An off-by-default per-viewer toggle (§10) that layers two more elapsed-time cues on
top of the always-on Today reference line (§6.1): a translucent wash across the full plot height
from the chart's left edge up to Today's x-position, painted above the lane washes but below
markers/connectors, plus a small caret notch at the boundary between the Year axis row and the
tier below it, at Today's x-position.

### 7.12 Duration-pill progress visualization and stacking `(Archer delta)`

**[Phase 1]**

- **%-complete style** — a per-viewer choice (`off`/`fill`/`bar`/`hatch`, §10) for rendering
  `Milestone.percentComplete` on a duration pill: `fill` overlays a proportionally-widthed lighter
  shade over the completed portion; `bar` adds a thin progress bar under the pill; `hatch` applies
  a diagonal-hatch fill to the completed portion instead of a flat shade. A pill with no
  `percentComplete` set renders unaffected regardless of the chosen style.
- **Vertical stacking (always on, not a toggle)** — when two or more duration pills in the same
  lane overlap in date range, they stack onto separate sub-rows instead of rendering on top of
  each other, and the lane grows to fit however many sub-rows it needs. Classic interval-
  partitioning: sort by start date, greedily assign each pill to the lowest-numbered sub-row whose
  last-placed pill ends on or before this one's start, opening a new sub-row only when every
  existing one is still occupied. Point milestones never participate — only same-lane pill/pill
  overlap triggers stacking.
- **Pill drag-to-move** — dragging a duration pill's body (as opposed to a point marker)
  translates both `date` and `endDate` by the same delta, committed through the same cascade-aware
  edit path as any other date change (§5.3) once the drag completes.

### 7.13 Layout preferences: auto lane height, date-label placement, swimlane owner `(Archer delta)`

**[Phase 1]** Three more per-viewer preferences (§10):

- **Auto lane height** — when on, lane row height derives from available vertical space ÷ lane
  count (floored at a legible minimum) instead of the fixed default, so more of a dense programme
  fits without scrolling. Only ever *shrinks* below the fixed default, never grows past it.
- **Date-label placement** — `below` (the original fixed slot under the marker) or `inline`
  (beside the title's last line instead). The inline placement is a fixed position, not part of
  the tiered collision-avoidance system §7.1 describes for the `below` placement.
- **Swimlane owner visibility** — shows/hides `Swimlane.owner` (§4.2) as a muted second line
  under each lane's name in the header gutter. The owner value itself is document content; only
  whether a given viewer wants to see it is a preference.

---

## 8. Editing surfaces

### 8.1 Milestone editor (modal)

**[Phase 1]** Opens on marker click. Fields: title, date, end date (blank = point milestone,
filled = duration pill — a one-click "Convert to pill/milestone" button toggles between them by
filling/clearing end date), potential date (at-risk projection), status (5-value select), %
complete (0–100), owner, short label (marker abbreviation override), comment (multiline),
critical-path override (checkbox, shows the *effective* current value — override falling back to
computed), show-reference-line (checkbox), predecessors/successors editor (add/remove edges by
picking from the rest of the document's milestones — a "successor" add is the same edge stored on
the *other* milestone, just entered from this side), attachments editor (add/remove/edit rows,
each `{ type: image|link, url, label? }`), "highlight on the chart" trace-trigger buttons
(upstream/downstream/both — view-only, nothing saved), an "Accept baseline" action shown only if
`originalDate` is set, and Delete (instant, no confirm dialog — since every edit including delete
is one Undo away from reversed, a confirm step is pure friction).

**Save behavior:** instant-apply on Save (no preview/pending step — unlike the Phase-2 AI
correction flow) since there's no AI interpretation to double-check; diff the draft against the
original milestone and emit one field-change per actually-changed field (an unchanged field
produces no edit at all, so a save that only touched the date doesn't also stamp a no-op onto
undo history). Edge add/remove and attachment add/remove/edit apply immediately as you interact
with them (not batched into the Save button), because the dependency graph shape feeds the
cascade/critical-path recompute live — batching them would leave the modal's own critical-path
checkbox showing a stale value while still editing.

### 8.2 Top-level item editor (modal)

**[Phase 1]** Lighter than the milestone editor — no owner/comment/%complete/critical-path/short-
label/dependencies/attachments (`TopLevelItem` has none of those fields). Per-variant fields only:
phase gets start/end date + potential end date + status; milestone gets date + potential date +
status + show-reference-line; annotation gets date + message (no status field at all). Same
instant-save, same no-confirm delete.

### 8.3 Swimlane manager (modal)

**[Phase 1]** A list of every swimlane (lanes and separators together, in order) with: up/down
reorder buttons (swap with adjacent row, disabled at the ends), a color picker (lanes only —
separators show a plain "grp" marker instead), an editable name field, a RAG-override select
(lanes only: Auto/Green/Amber/Red), a density select (lanes only: Normal/Lean), a live milestone
count (lanes only), and a Delete button that expands to an inline confirm naming exactly how many
milestones will be deleted along with the lane (deleting a lane deletes every milestone in it,
and strips any *other* milestone's dependency edge onto one of the doomed ones, so nothing is left
pointing at a nonexistent id) — every action here is undoable, stated explicitly in the UI. Footer
actions: "Add a lane", "Add a group band" (a separator).

### 8.4 Manual creation on the chart

**[Phase 1]** Two "+" affordance families:

- **Per-lane "+"** (in each lane's header) — opens a tiny Milestone/Phase picker. Picking
  "Milestone" arms a **click-to-place** gesture on that lane (click a point on the timeline →
  create at that date, immediately opens the milestone editor). Picking "Phase" arms a
  **click-drag-to-place** gesture (drag across the lane → create a duration pill spanning the
  drag's start/end date, immediately opens the editor). While armed, show a small banner
  ("Click a point.../Click-drag...") with a Cancel action; Escape also cancels.
- **PROGRAM-band "+"** — same idea, one level up: a picker offering Milestone/Phase/Annotation,
  each creating (with today's date as a same-day default when no gesture is used, or a placed
  date/range) and immediately opening the top-level-item editor.

Everything created this way starts essentially blank ("New milestone" / "New phase" / "New
annotation") and opens straight into its editor — never silently created with no follow-up.

### 8.5 Drag-to-reschedule

**[Phase 1]** Pointer-down-and-drag on an existing marker moves it horizontally; release converts
the final x-position back to a date (via the inverse of the time scale, snapped to the nearest
whole day) and commits it through the **same edit path as a typed date change** — cascade and
undo included, not a separate mutation. A short drag-threshold (a few pixels) distinguishes "this
was a click" (opens the editor) from "this was a drag" (reschedules), so clicking to open the
editor still works reliably.

### 8.6 Click-to-edit inline fields

**[Phase 1]** Program name and owner (Program view header) and "Reports to"/"Next review date"
(Executive view) are plain-text/date inline-editable: click to reveal an input, blur or Enter
commits, Escape cancels. This is separate from the BLUF panel's richer contentEditable-style
editing (§4.4), which supports inline formatting; these header fields are plain text only.

### 8.7 Company logo

**[Phase 1]** Upload (or replace) an image via the options menu; stored as a data URL directly on
the document. Once uploaded, it's freeform-draggable and resizable (drag body = move, drag corner
handle = uniform-scale resize) directly on the chart, with the resulting `dx`/`dy`/`scale`
committed to the document on gesture-end (not on every pointer-move) — this placement is document
content the owner sets once and expects to travel with the file (unlike every other chart-label
drag, which is per-viewer, see §10). "Reset position" restores the default top-left placement;
"Remove" clears the logo entirely.

### 8.8 Edit/View mode lock `(Archer delta)`

**[Phase 1]** A per-viewer toggle (§10): `edit` (the default — every affordance in this section
stays wired up) or `view` (every interactive callback this section describes — marker click,
drag-to-reschedule, click-to-add, click-to-edit header fields, company-logo drag, mass-edit
selection — is withheld entirely, the same "omit the prop to render read-only" convention already
used for the off-screen export capture, rather than a second read-only rendering path). A visible
lock indicator in the chrome shows/toggles the current mode. Meant for a clean presentation pass,
not a permissions system — it doesn't gate Save/Open/Export or the AI correction box (Phase 2).

### 8.9 Mass-edit toolbar — see §5.6

The selection model, rubber-band/click multi-select, and the four bulk actions (shift dates, set
status, move to lane, accept baseline) are specified in §5.6 alongside the undo-model reasoning
they share with every other bulk operation in this document.

---

## 9. Document lifecycle

### 9.1 Save / Open / autosave

**[Phase 1]**

- **Autosave:** the current document mirrors to browser localStorage on every change (debounced
  is fine; the original writes on every state change past initial hydration). On app load, if a
  saved document exists, open straight into the workspace with it instead of showing a blank/entry
  state — no separate "resume" step.
- **Save:** downloads the current document as pretty-printed JSON, filename
  `<slugified-program-name-or-"roadmap">.wayframe.json`.
- **Open:** file-picker → parse JSON → **validate in two passes** before replacing anything: (1)
  full shape validation against the schema in §4 (e.g. via a schema-validation library — reject
  with the first several specific field-level errors, not a generic failure); (2) referential
  integrity per §4.7. On success, sanitize every rich-text field (§14.3) before it ever reaches
  `dangerouslySetInnerHTML`-equivalent rendering — **a hand-crafted malicious file is fully
  untrusted input and must be sanitized at load time, not just assumed clean because it round-
  tripped from a Save.** Loading replaces the whole document (still pushed onto the undo stack, so
  an accidental Open-over-unsaved-work is one Undo away from recovered).
- **"Start new"** (only offered where there's a route back to a blank-canvas entry point): if
  there's any undo history, force a Save-then-clear rather than silently discarding — undo doesn't
  survive a full remount of the workspace.

### 9.2 Export to Deck (PowerPoint)

**[Phase 1]** One action produces a `.pptx` with exactly two full-bleed image slides — Program
view and Executive view — **regardless of which one is currently on-screen** (the inactive view is
mounted off-screen at a fixed width, given a paint frame, then captured too). Each slide: rasterize
the view's root element to an image (accounting for the fact the Program-view chart may be wider
than its visible/scrolling container — capture its *full* un-clipped extent, not just the visible
scroll position), letterboxed to fit a 16:9 slide without distortion. Images only — no
native-editable PowerPoint shapes/text; this is an accepted, documented scope cut, not an oversight.
Filename: `<slugified-program-name-or-"roadmap">-deck.pptx`.

**Vector export option `(Archer delta)`:** Archer's build reverses the "images only" scope cut
above with a second export mode — native, editable PPTX shapes (rectangles for lane rows,
diamond/rounded-rect shapes for markers and pills, lines for connectors, text boxes for every
label) generated by walking `RoadmapData` through the same layout math the chart itself uses,
rather than rasterizing the rendered DOM. Offered as a choice at export time ("Image" vs.
"Vector"), not a replacement for the raster path — the raster path is still the simpler,
guaranteed-to-match-what's-on-screen default; the vector path trades that guarantee for a deck a
viewer can actually edit in PowerPoint afterward.

---

## 10. Viewer preferences (per-browser, not document content)

**[Phase 1]** All of the following are **local to the viewer/browser** (localStorage, own keys),
**not** written into the `.wayframe.json` document and **not** part of the undo stack — two people
opening the same file can have different settings simultaneously.

**Menu structure `(Archer delta)`:** exposed through one options menu, organized into named,
independently collapsible/expandable **accordion sections** (own persisted open/closed state per
section) rather than one long flat list — the row-per-setting list grew long enough to need
grouping. Suggested sections: Appearance, Chart symbols, Views, Layout, Data. A few frequent
actions (Help, File, Export) stay ungrouped at the top, always visible regardless of which
sections are expanded.

- Theme (Blueprint / Graphite / Press)
- Marker label density (how many markers carry a visible label at once, for dense programs)
- Font size (a numeric scale multiplier, with defined min/max/step)
- Font family (a small fixed list of choices)
- PROGRAM-band highlight style (a few named visual treatments, each pairing its own "+"
  add-affordance shape)
- Axis Year color (Levels 2/3 always derive from it — see §7.9)
- Gridline style (§7.8)
- Ghosts: on/off + style (badge/outline) — §7.3
- "Accept all" slipped-milestone bulk action, shown only when at least one milestone is currently
  ghosted, with an inline count-confirm
- At-risk projection: on/off + style (sibling/comet/zone) — §7.5
- Critical path: shown/hidden + line style (solid/thick/dashed/double)
- Correction-box UI mode *(Phase 2 only — bar vs. sidebar layout for the same underlying feature)*
- "Last updated" badge: shown/hidden
- "So what" panel: shown/hidden, fill color override, fill transparency, reset-to-theme
- Import a schedule *(Phase 2)*
- Generate/update Executive timeline summary (§6.3)
- Connector shape + line style/arrowhead — §7.10 **`(Archer delta)`**
- Today progress overlay: on/off — §7.11 **`(Archer delta)`**
- Duration-pill %-complete style — §7.12 **`(Archer delta)`**
- Auto lane height: on/off; date-label placement (below/inline); swimlane owner: shown/hidden —
  §7.13 **`(Archer delta)`**
- Legend category-fill encoding: on/off — §7.6 **`(Archer delta)`**
- Edit/View mode lock — §8.8 **`(Archer delta)`**
- Select mode: on/off — arms the mass-edit rubber-band/click picker, §5.6 **`(Archer delta)`**

Also per-viewer (own storage keys, not swept into the options menu list above): legend
open/closed, BLUF panel position, every manual per-label drag override (§7.1).

**Contrast with document content:** lane color, lane RAG override, lane density, lane owner,
company-logo placement, BLUF box size, and the legend-category vocabulary are all *document*
content (§4) specifically because they're editorial calls the document owner makes that everyone
opening the file should see identically — don't accidentally implement any of those as per-viewer
preferences.

### 10.1 Saved Views `(Archer delta)`

**[Phase 1]** A named-snapshot layer on top of every preference above: capture the current value
of every viewer preference into one named object, store it alongside a per-viewer list of such
snapshots, and apply one back by writing every field it contains through that preference's own
setter (an unset field in a snapshot leaves the corresponding preference untouched, so a snapshot
only needs to name what it actually cares about).

- **Built-in presets** — three read-only, non-deletable starting points shipped with the app
  (e.g. **Presentation**: high-contrast theme, larger font, gridlines/today-overlay off, legend
  collapsed; **Dense**: smaller font, sparser label density, auto lane height on; **Minimal**: BLUF
  panel and legend hidden, gridlines off, critical-path line simplified).
- **Custom views** — the viewer names the current combination of preferences and saves it;
  deletable, unlike the built-ins.
- Legend open/closed is a defensible field to leave out of the snapshot if the legend's
  open/closed state has no externally-drivable setter in your implementation — not essential to
  the feature's value.

---

## 11. Phase 2 — AI extraction pipeline

**Gate:** requires a server-side Anthropic API key. Do not build client-side calls to the model —
the key must live only in a Node.js backend/serverless function that the client calls.

### 11.1 Inputs

Four entry points, all converging on the same server call:

1. **Typed notes** (free text) — a textarea on the entry form.
2. **Photo** (whiteboard/napkin sketch) — image upload, sent as inline image content alongside any
   typed notes (both can be present at once — they're not mutually exclusive tabs).
3. **CSV upload** *(needs §13 built first — file parsing is Phase-1-buildable, but the extraction
   call itself is gated on the API key)* — parsed into rows, flattened to a labeled text block, fed
   in as "notes" text (reuses the same text-input path — no separate schema).
4. **Smartsheet pull** *(needs both the API key and a Smartsheet token)* — same flattening as CSV,
   from a live sheet pull instead of a file.

The import panel lets a user load a file and a Smartsheet source **independently** (loading one
doesn't clear the other) and choose, via checkboxes, which loaded source(s) combine into one
extraction call.

### 11.2 Server contract

One endpoint, `POST /api/extract`, body `{ text?: string, imageDataUrl?: string }` (at least one
required). Server-side:

1. Build a system prompt stating: today's date (for resolving relative/year-less dates), the
   extraction rules below, and the exact target JSON shape.
2. Call the model with **forced tool use** against a hand-authored JSON-schema tool definition
   mirroring the target shape (see §11.3) — don't rely on free-form JSON-in-prose parsing.
3. Validate the tool-call response against a strict schema (reject anything that doesn't match);
   separately check referential integrity of any temp-key cross-references (§11.3); reject empty
   extractions (no lanes/milestones/top-level-items at all) as their own distinct error case.
4. Return the validated draft to the client, which resolves temp-keys into real stable ids
   (`nanoid` or equivalent) client-side before merging into the document.

### 11.3 Extraction shape (draft, before id resolution)

Same overall structure as §4, with two differences: (a) every cross-referencing field
(`Swimlane`/`TopLevelItem`/`Milestone` "ids") is instead a model-invented **`tempKey`** string,
unique only within that one response — the model never emits real ids, since none exist yet; (b)
computed/derived fields (`isCriticalPath`, `originalDate` in the normal case) are absent — the
model never computes critical path itself.

Model instructions worth preserving verbatim in spirit:

- Never invent milestones/dates/owners not implied by the input; omit optional fields rather than
  guess.
- Resolve year-less dates relative to "today," picking the nearest future occurrence.
- Swimlanes should mirror organizational tracks/workstreams visible in the input; if none are
  evident, fall back to one lane named "Program."
- `dependsOn` should capture real logical/technical dependencies inferable from the input, not
  just chronological ordering.
- `showConnector: true` only for the small subset of edges worth drawing as a line — not every
  edge.
- `isCriticalPathOverride`, `endDate` (duration), and `showReferenceLine` are each **opt-in, rare**
  — only set when the input *explicitly* calls for that specific treatment, never as a default.
- The model does not compute critical path — that's client-side (§5.4).
- `bluf.statement` is one sentence; `bluf.bullets` is at most 4 items.
- Illegible/empty input still calls the tool, with empty arrays (except swimlanes, which still
  needs the one-lane placeholder) — never fabricate content to fill a bad input.

### 11.4 Client-side error handling

Distinguish and message these failure kinds distinctly (don't collapse them into one generic
"extraction failed"): no input given; the model didn't return a structured tool call; the response
failed schema validation; the response had a dangling temp-key reference; the model's API call
itself failed (network/auth/rate-limit); the extraction came back structurally valid but empty. At
least the schema-validation and dangling-reference cases should offer an expandable "show details"
with the specific field-level issues, mirroring the file-open error UX in §9.1.

---

## 12. Phase 2 — AI natural-language correction box

**Gate:** requires the same server-side Anthropic API key as extraction.

### 12.1 UX shape

An always-visible input ("Ask AI... describe a change") pinned near the bottom of the workspace.
Typing a request and submitting:

1. Sends the request plus a **compact snapshot of the live document** (every milestone's real id/
   title/lane-name/date/status/attachments; every lane's id/name/type; every top-level item's full
   shape; the document header + BLUF's current values) to the server.
2. Server resolves the request into a set of typed "ops" (§12.3) against those *real* ids — the
   model never invents ids, and everything it names must exist in what it was given.
3. Client runs the proposed direct date-changes through the deterministic cascade engine (§5.3)
   client-side — **the model is never asked to compute cascading effects on unmatched
   milestones**, only to point at direct effects.
4. The result renders as a **preview** ("Proposed correction" card: one line per change, showing
   before → after, plus a plain-English reason) — **nothing is applied yet.** Explicit Apply /
   Discard buttons. An inline Undo is always available next to the input regardless of pending
   state.
5. If the model's resolution came back as a genuine tie between multiple equally-plausible targets
   (see §12.2), render a distinct "which one did you mean?" conversational bubble with one button
   per candidate instead of the plain preview card — picking one turns it into a normal op with no
   retyping.
6. If the request produced nothing resolvable (no ops of any kind, not even a tie), say so plainly
   and invite a more specific rephrase — never silently no-op.

### 12.2 Reference-resolution policy (the single most important rule)

The model must resolve **which milestone(s)/lane(s)/items(s)** a request refers to using the whole
picture per candidate (id + title + lane name together), not a single shared keyword — a
real-world failure mode from an earlier prototype was "mark pilot site 3 complete" fuzzy-matching
3 unrelated milestones that all happened to contain the word "pilot." Concretely:

- Only include a candidate in a resolved op if the model is genuinely confident it's what the
  request means.
- If a plausible candidate is deliberately excluded (e.g. already complete, so a date-shift
  wouldn't make sense), report it in a `skipped` list with a reason — never silently drop it with
  no trace.
- If the request's subject **genuinely ties** across multiple candidates (not just "several
  plausible candidates," a real ambiguity), don't guess for any of them — surface the tie as a
  structured "ambiguous" response with every tied candidate's id and its precomputed would-be new
  value, so the person can pick without retyping.
- If nothing resolves confidently and it isn't a genuine tie either, return an entirely empty
  response (every op-list empty, both single-entity ops null) rather than a low-confidence guess.
- The model must never invent an id that wasn't in the reference lists it was given.

### 12.3 Op taxonomy the correction endpoint can emit

One request can produce a mix of any of the following in a single response:

| Op kind | Purpose | Key fields |
|---|---|---|
| `ops` | Direct field edit(s) on existing milestones | `targetId, field, newValue, reason` — field ∈ {date, status, title, percentComplete, owner, comment, isCriticalPathOverride, shortLabel, showReferenceLine, endDate, potentialDate} |
| `addMilestones` | Create a new lane milestone | `title, laneId (required, no guessing), date (nullable — null falls back to "create empty, open editor"), endDate?, reason` |
| `deletes` | Delete a milestone, top-level item, or swimlane | `targetId, entityType, reason` |
| `swimlaneOps` | Add/rename/reorder/recolor/RAG-override a lane or separator | `kind ∈ {add, rename, reorder, recolor, ragOverride}, ...` — recolor uses a **fixed named palette** (red/amber/green/blue/purple/gray) resolved to a real hex **server-side**; the model never emits a raw hex |
| `topLevelItemOps` | Edit a PROGRAM-band item's own fields | `targetId, field, newValue, reason` — only fields that exist on that item's variant |
| `addTopLevelItems` | Create a new PROGRAM-band item | `kind ∈ {milestone, phase, annotation}, title, date?, endDate?, message?, reason` |
| `dependencyOps` | Add/remove a dependency edge, optionally set connector visibility | `dependentId, dependencyId, add, showConnector?, reason` |
| `attachmentOps` | Add/remove one attachment on a milestone | `targetId, action ∈ {add, remove}, attachment/index, reason` |
| `bulkShiftOps` | Shift many items by the same day-delta at once | `selector ({lane}/{after}/{ids}), deltaDays, reason` — **resolved to concrete date ops deterministically client-side**, the model names a selector + one delta, never per-item absolute dates |
| `acceptBaselineOps` | Clear a slip baseline (one or all) | `{scope: "one", targetId, reason}` or `{scope: "all", reason}` |
| `blufOp` | Edit the So-what statement/bullets/label | Only the field(s) actually changing; `bullets`, if included, is the *whole* replacement list |
| `documentOp` | Edit programName/owner/reportsTo/nextReviewDate | Only the field(s) actually changing |
| `skipped` | Named-but-excluded candidates (see §12.2) | `targetId, reason` |
| `ambiguous` | A genuine tie needing human disambiguation (see §12.2) | `field, reason, candidates: [{targetId, newValue}]` |

**`date` vs `potentialDate` distinction (important, easy to get wrong):** `date`/`ops` field=`date`
is for a *confirmed* change to the committed date. `potentialDate` is for a *hypothetical* — the
request describes something that *might* happen ("could slip to...", "at risk of landing in..."),
never moves the committed date, and never stamps a new baseline. Route requests to the right one
based on this framing, not just presence of a date in the text.

**Bulk shift is a deterministic client-side resolution**, same reasoning as cascade (§5.3): the
model names *what* to shift (a lane, "everything on/after milestone X," or an explicit id list) and
*by how much* (one integer day-delta, converting whatever unit the user used — a week=7, month=30,
quarter=90, year=365), and a client-side resolver compiles that into ordinary per-item date ops
*before* cascade runs, so cascade's own dedup logic naturally prevents double-shifting an item that
was both explicitly selected and also a dependent of another selected item.

### 12.4 Server response contract & validation

`POST /api/correct`, body includes the correction text plus the compact document snapshot (§12.1
step 1). Server: build the system prompt (rules above, formatted reference lists), call the model
with forced tool use against a hand-authored tool schema (a flat, string-typed shape — every field
a plain string even for numeric/boolean fields like `percentComplete`/`isCriticalPathOverride`,
coerced into real types **after** the model responds — forced-tool-use models are more reliable at
emitting a uniform string type than a precisely-typed JSON union). Validate: full shape, then that
every referenced id/laneId actually exists in what was sent (reject with specific messages, same
posture as extraction). Return the validated, typed op-set to the client.

---

## 13. Phase 2 (partially Phase-1-buildable) — Structured import

**File-parsing itself has no AI dependency and can be built in Phase 1**; only the final
"Extract roadmap" call at the end of the import flow is Phase-2-gated.

- **CSV upload:** parse into rows (a real CSV parser, not a naive split — handle quoted fields,
  embedded commas/newlines). Require a header row plus at least one data row; reject with a
  specific message otherwise.
- **Smartsheet pull** *(also needs a Smartsheet Personal Access Token held server-side, never
  client-exposed)*: `GET` the sheet list, then `GET` one sheet's rows/columns, converting
  Smartsheet's column-id-keyed cell shape into the same `Record<string,string>`-per-row shape CSV
  parsing produces — one-way pull only, no write-back, no auto-sync, stated explicitly in the UI.
- Both sources converge on one flattening function: `sourceLabel + header row + each data row`,
  pipe-joined, become one plain-text block. This is the *same* "notes" text the extraction endpoint
  already accepts — no schema change needed to plug import into extraction.
- The import panel shows a live preview (first few rows) of each loaded source, lets the user
  toggle which loaded source(s) are included, shows the exact combined text block that will be
  sent, and only then triggers extraction.

### 13.1 Deterministic CSV/XLSX import wizard — no AI, fully Phase-1-buildable `(Archer delta)`

**[Phase 1]** A second, independent import path alongside 13's AI-extraction flow — this one never
calls the model at all, so it needs no API key and belongs entirely in Phase 1. Steps:

1. **Load** — CSV (reuse the same real parser as 13) or **XLSX**. XLSX parsing needs a real
   spreadsheet library; there's no CSV-style "avoid the dependency" option once `.xlsx` is a
   requirement.
   > **Security note, worth re-checking at build time:** the obvious XLSX library, SheetJS's
   > `xlsx` npm package, was evaluated first and dropped after `npm audit` showed **unpatched,
   > direct, high-severity advisories** (prototype pollution — GHSA-4r6h-8v6p-xvw6; ReDoS —
   > GHSA-5pgg-2g8v-p4x9) with no fix available on the npm-published package — a real risk for a
   > parser that runs directly against untrusted user-uploaded files. `exceljs` was used instead;
   > its only flagged advisory at evaluation time was moderate and transitive (via `uuid`). Re-run
   > this check against whatever XLSX library Archer's environment/ecosystem offers — don't assume
   > either package's audit status is still current by the time this gets rebuilt.
2. **Map columns** — a small mapping UI: Title and Date are required; Lane, End date, Status,
   Owner, % complete, and Comment are optional. Auto-guess a starting mapping from common header
   synonyms (case-insensitive: "task"/"milestone" → Title, "due"/"start" → Date, etc.), but never
   apply a guess silently — the mapping is always visible and editable before anything imports.
3. **Smart merge (deterministic, not AI inference)** — match each row to an existing milestone by
   normalized `(title, lane)`; a match with any differing mapped field becomes an **update**
   (diffed field-by-field, not a blind overwrite); no match becomes an **add** (creating the lane
   too, if the row's lane name doesn't exist yet — one new lane per distinct unmatched name,
   deduplicated across rows in the same import); a match with every mapped field already equal
   produces nothing. A row with no title, or a date that doesn't parse, is skipped with a
   per-row reason rather than silently dropped or crashing the import.
4. **Review** — the same generic diff-preview pattern §5.6 already establishes for mass-edit:
   one row per add/update, per-row accept/reject, defaulting to accepted. Apply commits the
   accepted subset as one atomic, undoable edit (new lanes + new milestones + field updates on
   matched ones, together).

---

## 14. Non-functional requirements

### 14.1 Accessibility

- Every icon-only control needs an `aria-label`; toggle controls need `aria-pressed`/`aria-
  expanded` as appropriate.
- Marker click targets need a native tooltip/title hinting "click to edit" separately from the
  custom hover tooltip that shows the title — discoverability of the edit affordance is a real,
  previously-reported gap, not a nice-to-have.
- Keyboard: Escape must cancel any in-progress placement gesture (§8.4) or dismiss an open
  ambiguous-choice/error banner.

### 14.2 Testing posture

The original ships unit tests for every pure-logic module (cascade, critical-path computation,
RAG rollup, bulk-shift resolution, corrections apply/preview, CSV/row parsing, label-layout math,
document-file parse/validate) and component tests for the main interactive surfaces. Recommend
the same split for the rebuild: **pure functions (data model transforms, algorithms) get thorough
unit tests; rendering gets narrower smoke/interaction tests.** Don't skip unit-testing the cascade
and critical-path algorithms specifically — both have subtle edge cases (cycles, ties, isolated
nodes) that are easy to regress silently.

### 14.3 Rich-text sanitization — hard security requirement

Any field that can carry the BLUF rich-text vocabulary (`bluf.statement`, `bluf.bullets[]`,
`bluf.label`) and is rendered as HTML **must** be sanitized before rendering, on **every** path
that can produce or receive one — not just the live editor. Concretely:

- Allow-list a small, fixed tag set (bold/italic/underline/strikethrough/inline-code/link/inline-
  color-span/line-break) and, per tag, a small allow-listed attribute set (e.g. `href`/`rel` on
  links, restricted to `http(s):`/`mailto:` schemes; `style` on color spans, restricted to
  `color`/`background-color` with a hex-or-named-color value pattern only).
  Force `rel="noopener noreferrer"` on every link.
- Strip (unwrap, don't delete the text inside) any tag outside the allow-list; strip any attribute
  outside the allow-list.
- **Sanitize at the file-open boundary** (§9.1), not just at render time — a hand-crafted
  `.wayframe.json` is fully untrusted input and must not be able to round-trip a malicious payload
  through an Open → Save cycle unsanitized.
- Also provide a **plain-text projection** (strip all markup, don't escape it) for the one place
  the statement is shown as plain prose rather than rendered HTML (the Executive-view subtitle).

### 14.4 Server-side secrets

Both Phase-2 external calls (Anthropic, Smartsheet) must be proxied through server-side
code — the API key/token must never be embedded in or reachable from client-side JavaScript.
Fail closed with a typed, specific error when a key/token isn't configured, rather than a generic
500 — Phase 1's whole value proposition is that the app works fully without these, so a missing
key should degrade exactly the two gated features, not the app as a whole.

**Shared env-guard helper + health endpoint `(Archer delta)`:** consolidate "is this secret
configured" into one small server-only helper (a boolean check for a health/status surface, and a
throwing variant — naming only *which* variable is missing, never echoing a configured value —
for the code paths that actually need the secret) rather than duplicating the check per
integration. Pair it with a `GET /api/health`-style endpoint returning which optional integrations
are configured as booleans only (`{ anthropicConfigured, smartsheetConfigured }`) — the
serverless-function equivalent of a startup log, since a stateless function has no persistent
process boot moment to log at the way a long-running Node/Express service would.

---

## 15. Suggested build order

1. Data model (§4) + schema validation + referential-integrity checks. Write this once, get it
   right — everything else depends on it.
2. Reducer + undo stack (§5.1–5.2) against an in-memory fixture document (no rendering yet).
3. Cascade + critical path (§5.3–5.4) as pure, independently unit-tested functions.
4. Program view rendering: swimlanes, markers, duration pills, dependency connectors, axis,
   themes/lane colors (§6.1, §7.1–7.2, §7.6, §7.9) — static/read-only first.
5. Executive view rendering (§6.2, §7.4, §6.3).
6. Manual editing: milestone editor, top-level editor, swimlane manager, drag-to-reschedule,
   click-to-add (§8.1–8.6).
7. Ghost rendering + at-risk projection (§7.3, §7.5).
8. Save/Open + localStorage autosave (§9.1).
9. Export to Deck (§9.2).
10. Viewer preferences / options menu, legend, gridlines (§7.7–7.8, §10).
11. Company logo (§8.7).
11.5. *(Archer delta, all Phase 1, safe to interleave with steps 4–11 above rather than treated as
   a separate pass)* Legend categories + category-fill encoding, connector shape/line style,
   today overlay, pill %-complete + stacking, auto lane height, date-label placement, swimlane
   owner, edit/view lock, mass-edit toolbar, Saved Views, Midnight starter template, the
   deterministic CSV/XLSX wizard, and the vector export option. See §17 for the full index.
12. **Phase 1 complete — usable end to end with hand-built or imported documents.**
13. *(Phase 2, once the API key exists)* Server-side extraction endpoint + entry-form ingestion
    (text/photo) (§11).
14. *(Phase 2)* CSV/Smartsheet structured-import flow (§13) — file parsing can actually be pulled
    forward into step 4–5 territory if useful groundwork, but gate the final "Extract" call behind
    the API key.
15. *(Phase 2)* Correction box + server-side correction endpoint (§12).

---

## 16. Open questions to confirm inside the Archer environment

These are places this spec makes a reasonable assumption that should be explicitly verified
before or during the build, since they weren't things I could resolve from the source app alone:

1. **Rendering approach** — does Archer's environment favor a specific charting/canvas library, or
   is hand-rolled SVG (as recommended in §3) workable? The collision-avoidance, drag, and
   connector-routing requirements all assume direct per-element control.
2. **File save/open mechanics** — confirm the browser download/file-input APIs assumed in §9.1 are
   available in Archer's hosting context (vs. needing a server-side file-storage integration
   instead).
3. **Where the Node.js backend lives** once Phase 2 starts — a serverless function per the original,
   or a persistent Node service — affects nothing in this spec's data model but affects deployment
   instructions not included here.
4. **Smartsheet access** — confirm whether Archer's environment can reach `api.smartsheet.com`
   outbound before committing to §13's Smartsheet path; if not, ship the CSV half only.
5. **Phase 1 entry point — resolved `(Archer delta)`.** Option (b) was picked: a "Midnight"
   starter template (a couple of placeholder lanes + one placeholder milestone, every label a
   visible "replace me") offered as a third option on the entry form, alongside notes/photo — not
   a replacement for AI extraction, additive to it.
6. **XLSX dependency choice** — §13.1's security note found `xlsx` (SheetJS) carrying unpatched
   high-severity advisories at evaluation time and used `exceljs` instead. Re-verify this against
   current advisory data before the rebuild locks in a library, since audit status changes over
   time and Archer's package ecosystem may differ from npm's.

---

## 17. Archer-shipped delta — index

Quick cross-reference of everything folded into the sections above, for anyone diffing this spec
against an earlier revision or against Archer's own feature-delta notes.

| Item | Documented in |
|---|---|
| Midnight starter template | §16 item 5 |
| Options-menu accordion sections | §10 |
| Saved Views + 3 built-in presets | §10.1 |
| Swimlane `owner` field + visibility toggle | §4.2, §7.13 |
| Legend categories + category-fill/status-outline encoding | §4.1, §7.6 |
| Hollow `not-started` marker (spec-constraint deviation) | §7.6 |
| Strikethrough `delayed` dates | §7.6 |
| Connector shape (elbow/S-curve/rounded) | §7.10 |
| Connector line style + arrowhead | §7.10 |
| Today progress overlay | §7.11 |
| Duration-pill %-complete visualization | §7.12 |
| Duration-pill vertical stacking | §7.12 |
| Pill drag-to-move | §7.12 |
| Auto lane height | §7.13 |
| Date-label placement (below/inline) | §7.13 |
| Edit/View mode lock | §8.8 |
| Mass-edit / bulk multi-select (rubber-band + toolbar) | §5.6, §8.9 |
| Deterministic CSV/XLSX import wizard | §13.1 |
| Vector (native-shape) PPTX export option | §9.2 |
| Backend env-guard helper + `/api/health` | §14.4 |

**Explicitly still *not* folded in as done** — these remain future work, not part of this
baseline:

- The AI-correction bar + op-log review panel (a broader "full parity with manual editing" framing
  than §12's narrower correction box) — still gated on the Anthropic API key.
- Smartsheet **bidirectional** sync (§13 is explicitly one-way pull only; two-way would reverse
  that stated constraint).
- Google Sheets sync — not part of this spec's scope at all.
- Exec-rollup "pinned snapshot" persistence (a schema field that would freeze a computed rollup
  into the document) — the live-computed rollup in §7.4 is still the spec'd behavior.
