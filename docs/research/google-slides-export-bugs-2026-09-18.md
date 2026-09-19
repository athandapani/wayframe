# Google Slides export is "complete garbage" — root cause report (2026-09-18)

Source: product owner ran a real "Send to Google Slides" export of the demo
fixture (Atlas Mobile Robot Platform) after enabling the Slides API, and the
result was unusable. This doc traces every distinct defect to its root cause
in the actual code, verified against the actual generated deck (pulled via
the Google Drive connector, exported to PDF, and the PDF's content stream
parsed directly — not guessed from a screenshot). Read-only investigation;
nothing has been changed yet. New scope beyond t1-t42, same as
`ux-feedback-2026-09-18.md` in this directory — not a wayfinder ticket.

## Read this first: two independent failure layers

**Layer A — one wrong constant, catastrophic, Slides-only.** The Deck IR is
authored at **13.333 × 7.5 in** (`src/lib/export/export-to-deck.ts:14-15`,
shared by both export paths), but the presentation Google actually created is
**10 × 5.625 in** — confirmed from the PDF's own MediaBox (`[0 0 720 405]`
pt). `createPresentation` (`src/lib/google/slides-api.ts:282-289`) sets
`pageSize` in the `presentations.create` request body, but **the Slides API
ignores it** — the REST reference says verbatim: *"Other fields in the
request, including any provided content, are ignored."* Only
`title`/`presentationId` are honored. `slides-api.ts`'s own header comment
(`:19-21`) asserts the opposite; that claim was apparently never live-checked
against the real API (the header itself hedges this at `:33-38`) — and it's
wrong.

**Consequence**: everything past **73.5%** of the timeline's date range
falls off the right edge of the slide. The BLUF box in particular
(`x = 13.333−3.6 = 9.733in`, `renderable-to-slide.ts:333`) lands **97% off
the visible slide** — only a 19pt sliver survives.

**The `.pptx` download path does NOT have this bug** —
`export-native-deck.ts:140-141` calls `pres.defineLayout({width: 13.333,
height: 7.5})`, matching the IR. Layer A is Slides-only.

**Layer B — shared by both export paths.** `ExportDialog.tsx:222-226` builds
one `Slide[]` via `buildSlideIR` and feeds it to both
`exportNativeDeckFromSlides` (pptx) and `POST /api/google/slides-export`
(Slides). Defects 2–6 below all live in `renderable-to-slide.ts`/`deck-ir.ts`
— **the .pptx download is equally broken on all of them.** Fixing Layer A
alone makes the Slides deck merely match the (still-wrong) pptx deck, not
match the real app.

**Why nothing caught this**: `renderable-to-slide.test.ts` and
`export-native-deck.test.ts` assert only "shape exists" / "doesn't throw" —
there is not one geometry, bounds, or fits-on-canvas assertion anywhere in
the test suite.

---

## 1. The "garbled duplicate text block" — turns out not to be a real defect

Parsed the PDF's content stream directly (164 `BT`/`ET` blocks, 152 `Tj`
runs, 96 filled paths): every text run maps 1:1 to a distinct label box —
there is **no** element anywhere containing all titles concatenated. Grepped
`src/lib/export`, `src/lib/google`, `src/components/workspace` for
`notesPage`/`speakerNotes`/`altText`/any title-joining code: zero hits.
`requestsForSlide` (`slides-api.ts:154-262`) only emits
`createShape`/`updateShapeProperties`/`createLine`/`insertText`/
`updateTextStyle` — no notes/accessibility path exists to misroute.

What was actually seen is **defect 5 + Layer A together**: the top strip
holds the title box, the program-band labels wrapping 3-5 lines deep in
undersized boxes, and the BLUF box hanging almost entirely off-slide. The
Google Drive `read_file_content` tool's flat concatenated-text result (which
looked like independent confirmation) is a red herring — that tool returns
any Slides deck's shape text in element order; a flat concatenation is its
*normal* output for any deck, not evidence of a rogue text box.

**Fix**: none needed here specifically — resolved by fixing 5 + Layer A. As a
genuine improvement, the BLUF probably *should* go to Slides speaker notes
(`createSlide` returns a `notesPage` whose `notesObjectId` accepts
`insertText`) — `slides-api.ts` has no notes support today and would need it
added if wanted.

**Open question**: confirm the PO wasn't looking at the Slides editor's
outline/thumbnail pane, which does render exactly a flat concatenation by
design.

---

## 2. Missing timeline axis entirely (no years/quarters/gridlines/Today marker)

**Root cause: genuine scope gap, not a bug.** `buildSlideIR`
(`renderable-to-slide.ts:210-338`) emits, in order: title, phase rects +
labels, lane background rects + names, markers + labels, pills + labels,
connectors, BLUF. **No axis/band/tick/gridline/today element is ever
constructed**, and the IR has no axis primitive — though it wouldn't need
one, since axis chrome is just rects/lines/text, all of which `deck-ir.ts`
already supports.

Neither t28's nor t30's `gist` in `.wayfinder/tickets-meta.json` mentions
"axis," "gridline," "quarter," "year," or "today" at all. The file's own
SCOPE BOUNDARY comment (`renderable-to-slide.ts:10-25`) lists deliberate cuts
(ghost badges, at-risk projections, tiered label collision-avoidance, elbow
routing, group nesting, critical-path glow) and **does not list the axis** —
this is an unstated omission, and the single biggest reason the deck doesn't
read as a roadmap at all.

**Shared** between pptx and Slides paths — the pptx deck has no axis either.

**Fix**: add an `emitAxis()` step before the lane loop in
`renderable-to-slide.ts`. Reuse the real on-screen tier/segment logic
(`axisTiers` and the year/quarter/month segmenters already in
`RoadmapTimeline.tsx`) to produce segments, then per segment emit: an
alternating-wash `rect` band spanning `plotTop..plotBottom`, a `text` label,
and a thin full-height `rect` as a gridline (prefer a rect over a
zero-width `connector` — the `EPS_EMU` floor in `lineTransform`,
`slides-api.ts:130-139`, exists precisely because degenerate lines are
fragile). For "Today": a vertical `rect` at `xOf(todayISO)`; there's no
triangle primitive in the IR today, so either skip the marker triangle or add
`triangle` to `SHAPE_KINDS` (native on both Slides and pptxgenjs per t6/t7's
fidelity probes). Note: `ExportRenderPrefs` was trimmed to just
`legendCategoryFillEnabled` during t30 — `axisTiers` and `today` were among
~19 fields dropped and need to be re-threaded from `RoadmapWorkspace.tsx`
into `BuildSlideIRInput`.

**Open question**: full 3-tier axis, or just year bands + Today marker?

---

## 3. Missing critical-path connector lines

**Root cause: two concrete omissions**, both in `renderable-to-slide.ts:311-328`.

1. **The critical-path branch is simply absent.** On-screen
   (`RoadmapTimeline.tsx:3193`) an edge draws when `d.showConnector || traced
   || (showCriticalPath && m.isCriticalPath && from?.isCriticalPath)`. The
   export translator (line 322) checks **only** `edge.showConnector`. The
   on-screen code's own comment (lines 3183-3187) notes that in the demo
   fixture, the curated `showConnector` set and the computed critical-path
   set don't overlap at all — so for this exact fixture, the critical-path
   edges are precisely the ones the translator drops. `isCriticalPath` is
   already available on `RenderableProgram`'s milestones (computed at the
   render boundary per t14) and `theme.criticalPathColor` exists
   (`theme.ts:179`) — both are ignored by the translator.
2. **Duration-pill milestones can't be connector endpoints at all.**
   `pointCenters` is populated only from non-`endDate` milestones
   (`renderable-to-slide.ts:313`), and line 318 `continue`s on any pill
   target. The Atlas fixture has 18 `endDate` items out of 32 `dependsOn`
   edges, so most edges have no registered endpoint and are silently
   dropped.

Net result verified in the PDF: of 10 `showConnector: true` edges, only 2
lines actually reached the deck (one of those mostly off-slide per Layer A),
and both render as hairline grey (`theme.connector = #a8b7c6`) with no
explicit line weight, making them nearly invisible even where present.

**Shared** — t6's probe already confirmed Slides supports BENT/CURVED
connectors natively, and `deck-ir.ts:234`'s `compileToSlidesRequests` already
maps `elbow→BENT`/`curved→CURVED` — but `renderable-to-slide.ts:325`
hardcodes `style: "straight"`, so that native capability is never exercised.
pptxgenjs would degrade an elbow style to straight anyway (per t7's probe),
so hardcoding straight only actively hurts the Slides path.

**Fix**:
1. Extend the predicate at line 322 to also fire when
   `m.isCriticalPath && fromMilestone?.isCriticalPath`, setting
   `color: critical ? theme.criticalPathColor : theme.connector`.
2. Populate `pointCenters` from *all* non-hidden milestones — for a pill, use
   its `pillCenterById` cell center (or the pill's start/end x), not only
   `row1CenterIn`.
3. Pass `style: "elbow"` so Slides gets real BENT connectors matching the
   on-screen orthogonal router (pptx still degrades to straight, as
   designed/expected).
4. Add `lineProperties.weight` to `updateLineProperties`
   (`slides-api.ts:198-204`) — only color is set today, leaving Slides'
   default hairline weight.

**Open question**: `showCriticalPath` is a viewer preference that was
trimmed out of `ExportRenderPrefs` during t30 — decide whether export always
draws the critical path regardless of the on-screen toggle, or should follow
it (would need re-threading, same as defect 2's `axisTiers`/`today`).

---

## 4. Markers render as squares instead of diamonds (or whichever shape)

**Root cause: double rotation — fully pinned, one-line fix.**
`renderable-to-slide.ts:104-119` + `:126-139`: `markerIrKind` maps a
resolved `"diamond"` shape to IR kind `"diamond"` — which is **already**
diamond geometry (`ShapeType.DIAMOND` natively on Slides, `diamond` natively
on pptxgenjs, confirmed by both t6 and t7's fidelity probes). But
`markerShapeFor:138` *also* sets `rotationDeg: 45`, with a comment claiming
this "matches CushionMarker's own on-screen 45deg rotation." That's the bug:
`CushionMarker`'s diamond case (`RoadmapTimeline.tsx:472`) is a `<rect>`
rotated 45° — the rotation is *how SVG makes a diamond out of a square
primitive*. Applying that same 45° rotation on top of a primitive that is
*already* a diamond just rotates it back into an axis-aligned square.

Confirmed numerically from the PDF: `MARKER_BASE_RADIUS_IN = 0.11` → declared
w=h=0.22in=15.84pt, but every marker measures as an axis-aligned square of
**11.2×11.2pt**, and `15.84 / √2 = 11.20` — exactly a diamond-of-bbox-15.84
rotated 45° back into a square. The rotation math itself
(`transformFor`, `slides-api.ts:97-117`) is correct; the *request* is wrong.

**Secondary bug, same function**: `markerIrKind` collapses both `"square"`
and `"rectangle"` marker shapes to IR kind `"rect"`, and `markerShapeFor`
(`:127-128`) then gives *both* the 2.4r×1.6r proportions that
`CushionMarker` uses only for `"rectangle"` — so a `square`-shaped marker
exports as a wide rectangle instead of a square.

**Shared** — `compileToPptxOps:201` passes the same erroneous `rotate: 45`
to pptxgenjs's already-diamond shape.

**Fix**: `renderable-to-slide.ts:138` — drop the rotation for the diamond
kind entirely (`rotationDeg: undefined`), keep `kind: "diamond"`. Separately,
thread the real resolved marker shape into `markerShapeFor` so `"square"`
gets `2r×2r` and only `"rectangle"` gets `2.4r×1.6r`. Add a regression test
asserting `rotationDeg` is unset when the resolved shape is `"diamond"`.

**Open questions**: none — fully pinned.

---

## 5. Text overlapping, truncated, wrapping mid-word

**Root cause: fixed, far-too-small text-box dimensions — not a units bug.**
Checked the unit chain end to end: `sizeFor`/`transformFor`
(`slides-api.ts:81-117`) correctly convert IR inches → EMU at 914400/inch,
confirmed against the PDF (every box lands at exactly `inches × 72pt`). EMU
handling is correct throughout.

The real cause is `renderable-to-slide.ts:66-67`:
```
const LABEL_HEIGHT_IN = 0.16;   // 11.52pt
const LABEL_WIDTH_IN  = 1.1;    // 79.2pt
```
Every point-milestone label (`:234`) gets a fixed **1.1in × 0.16in** box
regardless of string length, at 8pt font. Pill labels (`:301`) get
`Math.max(0.6, pillWidth) × 0.16in` at 7pt — a short pill yields a **0.6in
(43.2pt)** box. The PDF shows exactly these declared sizes (79.2, 48.0,
43.2pt widths, 11.5pt height everywhere). "Ruggedized Enclosure
Qualification" at 7pt in a 48pt box wraps to five lines and breaks mid-word
because Slides must break inside a word when no break point fits the
declared width. A 0.16in box can barely fit *one* 8pt line with leading —
three-to-five-line labels overflow 3-4× their declared height, and Slides
text boxes don't clip, so the overflow paints straight over neighboring
elements.

**Nothing measures text anywhere in this pipeline.** There's no font-metrics
helper and no `createZone`/occupancy usage in `src/lib/export/` at all — yet
**t28's own `gist` explicitly required** label/annotation positions to reuse
t24's `createZone` occupancy output "captured at export time." That
requirement was never implemented, and `renderable-to-slide.ts:20-21`
instead declares "tiered label collision-avoidance" out of scope — this is a
real deviation from the ticket's stated design, not a documented, deliberate
cut like the others in that same scope-boundary comment block.

**Shared** between both export paths.

**Fix, in increasing order of cost:**
1. **Cheapest real win**: add `autofit: {autofitType: "SHRINK_ON_OVERFLOW"}`
   via `updateShapeProperties` (Slides) / `shrinkText: true`, `fit: "shrink"`
   (pptxgenjs) so text scales to fit its box instead of overflowing.
2. Compute the box from the actual text: a small `estimateTextWidth(text,
   sizePt)` (average-advance approximation, or a real per-character width
   table for the deck's font) → set `w = min(maxAllowed, measured)` and
   `h = ceil(measured / w) * sizePt * 1.25`, so the declared box matches what
   will actually render.
3. **The proper fix, matching t28's original spec**: implement the
   `createZone`-occupancy requirement — capture the real on-screen tier
   allocator's output (`src/lib/layout/tier-allocator.ts`, already used by
   `RoadmapTimeline.tsx`) and feed real label rects into
   `BuildSlideIRInput`, so exported placement matches the screen exactly.

**Open question**: even after fixing height, a 1.1in box at 8pt caps around
~20 characters per line — a max-width-plus-ellipsis policy or a dedicated
short-label field is a product decision, not just a layout fix.

---

## 6. Row/lane vertical overlap between adjacent swimlanes

**Root cause: the lane layout itself is correct — defect 5's overflow is
bleeding across band boundaries, not a lane-height bug.** `layoutLanes`
(`renderable-to-slide.ts:152-199`) does correctly reuse the real
`computeLaneRowModel`/`ROW_GAP` from `src/lib/layout/lane-rows.ts` (the same
functions the on-screen renderer uses), and it works: the PDF shows six lane
bands at y = 293.4, 252.9, 212.4, 171.9, 131.4, 90.9pt — a perfectly uniform
40.5pt pitch, 36pt tall bands, 4.5pt gaps, **zero overlap between the bands
themselves**.

What actually overlaps is *text*. A lane band is 0.5in tall; a marker label
sits below its marker (`:234`) and a pill label sits above its pill
(`:301`) with only a 0.01in gap — both using the too-small declared box from
defect 5. A label that declares 0.16in but renders 0.37in tall crosses into
the neighboring band on both sides. Confirmed in the PDF: "SLAM Localization
Alpha" wraps upward from y=289.6 straight into the Mechanical & Hardware
band (293.4-329.4) — exactly the reported visual collision with "Gripper
Module" and the "Autonomy & Perception Software" lane name.

**One genuine latent bug found in passing, worth fixing at the same time**:
`layoutLanes:169` computes `availableIn = plotBottomIn - plotTopIn` against
`SLIDE_HEIGHT_IN = 7.5`, targeting 6.3in of available space that, on the
*real* 5.625in Slides page (Layer A), doesn't exist. The Atlas fixture
happens to escape this because its natural stack (3.31in) is already under
budget, so the shrink-to-fit `scale` stays at 1 — **but a denser program will
be shrunk to "fit" 6.3in and then still get clipped at the bottom of the
actual 5.625in Slides page.** Fixing Layer A (correcting the slide-size
constant) resolves this automatically.

**Shared**: the text-overflow portion. The `availableIn` miscalculation is
Slides-specific in effect (pptx's canvas genuinely is 7.5in tall, matching
the constant).

**Fix**: defect 5's fix (real height computation + autofit) resolves the
observed overlap directly. Additionally, once label heights are computed for
real, `layoutLanes` should reserve label bands inside the row model — i.e.
feed `labelHeightIn` into each `RowItem.sizeFloor` so `computeLaneRowModel`
actually allocates space for labels, not just markers/pills.

**Open question**: same as defect 5 — how much of the on-screen tier
allocator + draggable label offsets is worth porting into the export path
versus a simpler fixed heuristic.

---

## Recommended fix sequence

1. **Layer A first, and it's the cheapest fix in this whole doc.** Change
   `SLIDE_WIDTH_IN`/`SLIDE_HEIGHT_IN` in `export-to-deck.ts:14-15` from
   `13.333 × 7.5` to Google's actual default, **`10 × 5.625`** — both export
   paths already consume these from one shared location, and pptxgenjs's
   `defineLayout` accepts the new values unchanged. (The alternative —
   issuing a follow-up `batchUpdate` with `updatePageProperties` to actually
   resize the created presentation to 13.333×7.5 — is real but unverified
   against the live API and strictly more work/risk than just matching the
   constant to what Google already gives you.)
2. **Defect 4** — one line (`renderable-to-slide.ts:138`, drop the diamond's
   extra rotation).
3. **Defect 5, step 1 only** (autofit) — biggest legibility win per unit of
   effort; this alone also resolves defect 6's visible symptom.
4. **Defect 3** — critical-path predicate + pill endpoints + explicit line
   weight.
5. **Defect 2** — the axis. Largest of the five; requires re-threading
   `axisTiers`/`today` through `BuildSlideIRInput` (same plumbing gap defect
   3's "follow the on-screen critical-path toggle" open question shares).
6. **Add the missing guardrail test** regardless of what else ships: assert
   every emitted shape's `x + w ≤ SLIDE_WIDTH_IN` and `y + h ≤
   SLIDE_HEIGHT_IN` for the Atlas fixture. This single test would have
   caught Layer A before it ever shipped, and should be added even if
   nothing else in this doc gets fixed immediately.
