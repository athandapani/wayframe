# Export pipeline rewrite: full fidelity + auto-pagination (2026-09-18)

**Supersedes the fix list in `google-slides-export-bugs-2026-09-18.md`.** That
doc's root-cause diagnosis is still accurate — it correctly explains *why*
today's export is broken — but the requirement has grown from "patch 6
defects in a from-scratch reimplementation of the layout" to "rebuild the
pipeline so fidelity is a structural guarantee, not a checklist," per this
explicit direction from the product owner:

> I want the export program to pptx or google slides be smart to handle
> space. The swimlanes should calculate a reasonable height for themselves
> to show all content without collision. After calculation, if the sum of
> swimlane height goes more than what can be shown in 1 page, the exporter
> should create additional slides with the timeline axis and remaining
> swimlanes. All elements in the visual app should be represented as they
> are in the exported pptx/google slide — marker size, font size, label
> placement overrides, connectors, connector lines, everything — except
> possibly split across N pages if they don't fit on one. If a logo is
> there, the logo should come too.

This doc is the new build spec. New scope beyond t1-t42, same as the other
docs in this directory dated 2026-09-18 — not a wayfinder ticket.

---

## The core architectural decision: harvest the real render, don't reimplement it

**Recommendation, decisive: read the actual rendered SVG's geometry back out
of the DOM ("harvest"), rather than building a second, parallel layout
engine that tries to recompute what the screen already computed correctly
("pure extraction").** This is the single most important decision in this
doc — everything else follows from it.

**Why extraction is the wrong call**, even though much of
`RoadmapTimeline.tsx`'s layout math already lives in separate, pure,
importable functions (`tier-allocator.ts`, `lane-rows.ts`, `label-layout.ts`,
`connector-router.ts`, `reference-line-layout.ts`, `title-layout.ts`,
`axis-tiers.ts`, `style-resolution.ts`): roughly 1,100 lines of *composition*
logic — how those pieces combine into final pixel positions — still live
inline in `RoadmapTimeline.tsx`'s JSX body (label tier→y math, connector
critical-path overprint, lane-height composition combining `markerFloor` +
row model + fit ratio, program-band phase/milestone geometry, logo
positioning). Extracting all of that into a second implementation means
every one of those ~1,100 lines becomes a place the export can silently
drift from the screen — which is exactly how today's pipeline got this
broken in the first place. A pure reimplementation can only ever be
*checked* against the real renderer; it can never be *guaranteed* to match
it.

**Why harvesting is the right call, concretely:**
1. **The harness for it already exists in this codebase and is dormant, not
   missing.** `RoadmapTimeline`'s `fixedWidth` prop and `RoadmapWorkspace`'s
   `OFFSCREEN_CLASS` were built for exactly this purpose (t10/t29's
   deterministic off-screen capture) — `chartWidth` still threads all the
   way through `RoadmapWorkspace.tsx`, but t30 deleted the consumer that used
   to call it, not the seam itself. ~15 props are still explicitly commented
   "omit for the off-screen export capture." This is a revival, not new
   plumbing.
2. **No headless browser is required.** Both export paths already run
   client-side in the user's real browser (`ExportDialog.tsx` builds the IR
   and either downloads a file or POSTs finished JSON to the Slides route) —
   there's a real, already-rendered `<svg>` sitting in the DOM (or trivially
   mountable off-screen) to read from directly.
3. **It fixes several of the previously-diagnosed bugs automatically, by
   construction**: real text metrics via `getComputedTextLength()`/`getBBox()`
   eliminate the fixed-size-textbox overlap/truncation bug entirely; reading
   the real `<image>` node's committed transform naturally excludes in-flight
   drag previews; CSS-only effects like `textTransform: uppercase` on lane
   names are captured correctly (a from-scratch reimplementation would have
   to remember to redo every such effect by hand and would silently miss
   some, forever).
4. **It solves a real pagination hazard that pure extraction would create.**
   `laneColorAt(theme.laneRamp, laneIndex, laneCount)` depends on the total
   lane count. If pagination were done by re-invoking a layout function per
   page with a lane subset, every lane's color would shift between pages.
   Harvesting captures the *whole* scene once, then pagination is pure
   Y-axis slicing of already-fixed colors/positions — no recomputation, no
   drift, ever.

**The one thing extraction would be needed for** is server-side/scheduled
export with no browser involved (e.g. a future "email me a weekly deck"
feature) — no such feature exists today. Reserve the
`computeTimelineScene(...)` pure-function signature as a documented future
option if that need ever arises, but do not build it now.

---

## Architecture end to end

```
RoadmapWorkspace
  → mounts <RoadmapTimeline exportCapture width={realFullWidth} ... /> off-screen
       (forces rowVirtualizationEnabled=false, fitRatio=1, no interaction handlers,
        current committed viewer prefs + document data — no drag/hover state)
  → harvestTimelineScene(svgEl, meta) walks the real DOM, returns ONE TimelineScene
  → paginate(scene) → TimelineScene[] (one per output page/slide)
  → sceneToPptx(pages) | sceneToSlides(pages)  — shared px→in scaling step,
       each primitive type mapped to the target format's native shape
```

### Required component-side change

Add an `exportCapture?: boolean` prop to `RoadmapTimeline`. When set:
- `rowVirtualizationEnabled` is forced `false` (a virtualized-out lane must
  never silently vanish from an export).
- `fitRatio` is forced `1` (export always wants true, uncompressed
  proportions — see pagination below for how overflow is actually handled:
  by adding pages, never by squeezing).
- All interactive handlers/drag-preview state are omitted (mirrors the
  existing "omit for off-screen export capture" convention already used
  elsewhere in this file).
- Stable `data-scene-*` attributes are added to lane/band/axis/marker/label
  `<g>` wrappers, so `harvestTimelineScene` can partition and identify
  elements without fragile structural DOM traversal.

### The `TimelineScene` type

A flat, fully-resolved, format-agnostic list of positioned drawing
primitives — richer and more specific than today's generic `deck-ir.ts`
`Shape` model, which is exactly what made the old translator's job
error-prone:

```ts
type Px = number;
interface Base { id: string; z: number; opacity?: number; clipToPlot?: boolean }

type ScenePrimitive =
  | ({ kind: "rect" } & Base & { x:Px;y:Px;w:Px;h:Px; rx?:Px; fill?:string; fillOpacity?:number;
        stroke?:string; strokeWidth?:number; strokeDasharray?:string })
  | ({ kind: "marker" } & Base & { cx:Px;cy:Px;r:Px; shape:MarkerShape; fill:string; fillOpacity?:number;
        stroke:string; strokeWidth:number; strokeDasharray?:string })
      // shape is SEMANTIC ("diamond","star",...) — the compiler picks the
      // native shape type; it must NEVER also apply a decorative rotation
      // on top of an already-correct shape (this was the exact root cause
      // of the old "markers render as squares" bug).
  | ({ kind: "pill" } & Base & { x:Px;y:Px;w:Px;h:Px; rx:Px; fill:string;
        progress?: { style:"fill"|"hatch"|"bar"; w:Px; fill:string } })
  | ({ kind: "path" } & Base & { d:string; fill?:string; stroke?:string; strokeWidth?:number;
        strokeDasharray?:string; arrowEnd?: "standard"|"open"|"circle"|"critical"|"trace" })
  | ({ kind: "connector" } & Base & { pts:{x:Px;y:Px}[]; routing:"elbow"|"s-curve"|"rounded";
        stroke:string; strokeWidth:number; strokeDasharray?:string; strokeOpacity?:number;
        arrowEnd?:string; overprint?: { stroke:string; strokeWidth:number } })
      // overprint carries the critical-path highlight color/width, drawn
      // on top of the normal connector — matches the on-screen technique.
  | ({ kind: "text" } & Base & { x:Px;y:Px; anchor:"start"|"middle"|"end"; baseline?:"middle"|"alphabetic";
        runs:{text:string;bold?:boolean;italic?:boolean;strike?:boolean}[];
        sizePx:number; weight:number; fill:string; letterSpacing?:number;
        measuredW:Px; measuredH:Px })
      // measuredW/H come from the REAL DOM (getComputedTextLength/getBBox),
      // not an estimated character-width table — this is what makes label
      // sizing correct in the export for the first time.
  | ({ kind: "image" } & Base & { x:Px;y:Px;w:Px;h:Px; dataUrl:string; fit:"contain" });

interface LaneSlice { laneId:string; groupPath:string[]; top:Px; height:Px; kind:"lane"|"separator"|"groupHeader" }

export interface TimelineScene {
  widthPx: Px; heightPx: Px;
  plotLeft: Px; plotRight: Px;
  axisTop: Px; axisHeight: Px;         // the band that repeats on every page
  bandTop: Px; bandHeight: Px;         // the PROGRAM band (page 1 only, see below)
  lanesTop: Px;
  lanes: LaneSlice[];                  // pagination packs THESE
  primitives: ScenePrimitive[];        // painter's order, each tagged with an owning laneId where applicable
  domain: { min: number; max: number };
  fontFamily: string; ground: string;
}
```

`renderable-to-slide.ts`'s entire layout-recomputation logic is deleted
under this design — only its executive-slide/BLUF-slide builder (content
that never lived in the SVG timeline to begin with) survives, now consuming
`TimelineScene` primitives instead of hand-rolled layout.

---

## Pagination

**Lane heights are trustworthy on screen** (`lane-rows.ts`'s
`computeLaneRowModel`, covered by its own test suite, and independently
confirmed via the previously-generated broken PDF that lane *bands*
themselves had zero overlap — the reported overlap was text overflow, not a
lane-height bug). Harvesting reads the *rendered* band height directly,
sidestepping the earlier bug where the export's own composition of
`markerFloor`/row-model/fit-ratio diverged from the real one.

**Packing algorithm.** Build `blocks` from `scene.lanes`: a swimlane-group
header plus its entire subtree is one atomic block (never split a group
across pages unless the group alone is taller than one full page's budget —
in that case, split at the deepest nesting boundary that fits and repeat the
ancestor header chain on the continuation page, suffixed "(cont.)"); an
ungrouped lane or a separator row is its own block.

```
pack(blocks, pageBudget):     // pageBudget = plotBottom - plotTop for that page
  for block in blocks:
    if block.height <= remaining-on-current-page:  place it there
    elif block.height <= pageBudget:                start a new page, place it
    elif block.isGroup:                              recurse into its children
    else:                                            new page, place alone
```

**Horizontal (time) domain is identical across every page, by
construction — never split by time.** Because the scene is harvested
*once* from a single full render, every page's primitives are literally the
same X coordinates, just translated in Y (`y -= page.topOffsetPx`). There is
no per-page recomputation to keep in sync, and therefore no way for pages to
disagree on the time axis.

**Respect the viewer's current zoom window — do not force the full
document domain.** The product owner's requirement is "exactly as shown on
screen"; if the viewer has zoomed into a sub-range, that zoomed range is
what's on screen, so that's what should export. (This also matches an
existing, deliberate t29 decision already in `ExportDialog.tsx`.) Forcing
the full document range instead would show items the on-screen zoom is
currently hiding — a fidelity violation, not a fix.

**Per-page repeat policy** (defaults below — flag for product-owner
confirmation, but ship with these as the committed starting behavior):

| Element | Page 1 | Continuation pages |
|---|---|---|
| Timeline axis (years/quarters/gridlines) | yes | **yes — explicitly required by the PO** |
| Reference lines + Today marker | yes | yes, re-clipped to that page's plot band (they're full-height verticals; omitting them makes them silently vanish) |
| Company logo | yes | yes (cheap, consistent branding across the deck) |
| Program title / owner | full | compact continuation header, e.g. "Atlas Mobile Robot Platform (2 of 3)" |
| PROGRAM band (top-level phases/milestones) | yes | **no** — this is real document content; repeating it duplicates information rather than continuing it |
| Legend | yes | no |
| BLUF / so-what | yes | no |

---

## Company logo

Currently **entirely absent from export** — `deck-ir.ts`'s `SHAPE_KINDS` has
no `"image"` kind at all, confirmed by direct inspection. `Portfolio.companyLogo`
(`{dataUrl, dx?, dy?, scale?}`) is a real, positioned, on-screen feature with
zero representation in either export path today.

**A real technical constraint, verified against the actual Google Slides
REST API reference — not assumed:** `CreateImageRequest.url` requires a
**publicly-accessible URL that Google's own servers fetch at insertion
time** ("a copy is stored for display inside the presentation"), and that
URL is capped at **2 KB in length** and must resolve to PNG/JPEG/GIF under
50 MB / 25 megapixels. **A `data:` URI cannot be used** — the 2 KB cap alone
rules it out regardless of format. `slides-api.ts` is hand-rolled `fetch`
(no `googleapis` package dependency), so this constraint isn't something a
type definition would have caught.

**The `.pptx` path needs none of this** — pptxgenjs's `addImage({data:
base64String})` accepts inline base64 directly (confirmed in its own
type definitions), so `Portfolio.companyLogo.dataUrl` can be passed straight
through with no server involvement.

**Committed mechanism for the Slides path:**
1. Add `"image"` to `deck-ir.ts`'s `SHAPE_KINDS`, with an `ImageShape {kind:
   "image"; x; y; w; h; dataUrl}`. The pptx compiler maps it straight to
   `addImage`; the Slides compiler emits a `createImage` op still carrying
   the raw `dataUrl` at this stage — the *server* substitutes a real URL
   right before sending, not the client.
2. New route: `GET /api/portfolios/[portfolioId]/company-logo?token=...` —
   verifies a short-lived signed token, loads the Portfolio, decodes the
   stored `data:` URI, and responds with the raw image bytes + correct
   `Content-Type` + `Cache-Control: no-store`. This route must work
   **unauthenticated apart from the token** — Google's fetcher has no
   session cookie.
3. New `src/lib/auth/asset-token.ts` — copy the existing Web-Crypto
   HMAC-SHA256 + base64url pattern already used in `src/lib/auth/room-token.ts`,
   with its own payload shape `{res: "logo", pid, exp}` and a short TTL
   (10 minutes is ample for one export). **Do not reuse `mintRoomToken`
   itself** — a room token is a live-room identity credential
   (`party/src/membership.ts` trades it for real-time collaboration access);
   handing that same token to Google in a public-facing URL would turn a
   leaked export link into a room-join credential. This needs its own,
   narrowly-scoped token type.
4. In the `/api/google/slides-export` route: mint the logo token immediately
   before calling the Slides API, rewrite the image shape's `dataUrl` into
   the resulting absolute HTTPS URL, then proceed with `batchUpdate` as
   normal.

**Operational wrinkles to plan for, not discover in production:**
- The logo route must be reachable **from the public internet**, since
  Google's servers do the fetching — this will silently fail against
  `localhost` during local dev, and against a Vercel preview deployment that
  has Deployment Protection turned on, unless that specific route path is
  exempted.
- **Format gate needed.** The on-screen logo `<image>` element happily
  accepts an SVG data URI; Google Slides only accepts PNG/JPEG/GIF. Reject
  a non-raster logo at the export boundary with a clear, specific error
  message — don't let a raw `batchUpdate` 400 surface to the user.
- Size is already fine — the app's existing `MAX_LOGO_BYTES = 2MB` guardrail
  (t40) is well under Slides' 50 MB/25-megapixel ceiling.
- Considered and rejected: uploading the logo to Google Drive and
  referencing that file's URL instead of a signed wayframe route. It
  requires mutating that file's sharing permissions to make it publicly
  fetchable and leaves a stray, orphaned Drive artifact per export — strictly
  worse than a purpose-built signed route.

---

## Relationship to the previously-documented 6 defects

The earlier diagnosis (`google-slides-export-bugs-2026-09-18.md`) remains
the correct explanation of *why* today's output looks the way it does. Under
this rewrite:

- **Layer A (wrong slide-size constant)** — still real, still needs fixing.
  This is about what canvas the harvested scene gets *scaled into*, which is
  orthogonal to how the scene's content is produced. Fix regardless of when
  the rest of this rewrite lands.
- **Defect 1 (the "garbled text block")** — confirmed not a real defect;
  no action needed either way.
- **Defects 2 (missing axis), 3 (missing connectors), 5 (text
  overlap/truncation), 6 (lane overlap)** — all fully subsumed by the
  harvest approach. Once the exporter reads real rendered geometry, the axis
  exists because it's really on screen, connectors exist with their real
  routing and critical-path coloring because that's what's really drawn, and
  text sizing is exactly correct because it's measured from the real DOM,
  not estimated. No separate fix is needed for any of these four once the
  rewrite ships — implementing them as one-off patches to the old
  `renderable-to-slide.ts` first would be wasted work.
- **Defect 4 (double-rotated diamond markers)** — also moot under harvest;
  a harvested transform matches the real rendered element exactly, so there
  is no separate "reapply a rotation" step in the exporter to get wrong.

**Implication for sequencing**: don't spend time patching defects 2/3/4/5/6
in the old pipeline — go straight to the rewrite. Layer A is the only piece
of the old bug list still worth fixing on its own, and even that only
matters once there's a real scaling step to feed it into.

---

## Suggested implementation phases

1. **`exportCapture` prop + `data-scene-*` attributes** on `RoadmapTimeline.tsx`
   — additive, low-risk, mirrors the existing (currently dormant)
   off-screen-capture convention already documented in the file.
2. **`harvestTimelineScene()`** — the DOM walker producing a `TimelineScene`
   from a real (or off-screen-mounted) `<svg>`, including real text-metric
   capture.
3. **Pagination** — implement the block-packing algorithm above against a
   harvested `TimelineScene`.
4. **`sceneToPptx` / `sceneToSlides` compilers** — replace
   `renderable-to-slide.ts`'s layout logic entirely; keep only its
   executive/BLUF-slide content, ported to consume `TimelineScene`
   primitives.
5. **Company logo** — `"image"` shape kind, `asset-token.ts`, the signed
   logo route, and wiring the token-mint step into the Slides export route.
6. **Guardrail tests**, all new:
   - Every emitted shape's bounds fit within its page (from the earlier doc
     — still the cheapest regression net against a Layer-A-style bug).
   - A harvest round-trip test: mount a fixture, harvest it, assert
     primitive counts/positions/text against expected values.
   - A pagination test: a many-lane fixture (reuse t41's >50-lane
     virtualization test fixture if convenient) splits into the expected
     number of pages with the expected per-page repeat elements present/absent
     per the table above.
   - An end-to-end company-logo test against a stubbed token/route.

## Open decisions for the product owner to confirm before/while implementing

- The per-page repeat table above (axis/reference-lines/logo repeat;
  program-band/legend/BLUF do not) — confirm or adjust.
- Zoom-window behavior: this doc recommends respecting the viewer's current
  zoom (not forcing the full document range) — confirm that's the intended
  meaning of "exactly as shown on screen."
- Non-raster (SVG) company logos: reject with an error at export time (this
  doc's default), or invest in server-side rasterization (e.g. via a
  library like `sharp`/`resvg`) so any logo format works? Rasterization is
  strictly more work and pulls in a new dependency — recommend shipping the
  reject-with-clear-error behavior first and revisiting only if it's
  actually hit in practice.
