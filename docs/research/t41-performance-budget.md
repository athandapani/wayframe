# t41 — Performance budget & virtualization strategy

`RoadmapTimeline.tsx` is a single continuous SVG timeline with no windowing.
t26's All-Programs merged view multiplies its lane-row count by however many
Programs are stacked into one view, and `Swimlane.rollupHistory` grows
unbounded (by design — see t9/t14). This records the explicit budget and
where virtualization does and doesn't apply, before either becomes a
retrofit.

## The budget

**Stay fully smooth, no virtualization, up to ~500 milestones/phases and 50
rendered lane-rows in one view.** Sized to this tool's real scale —
leadership roadmaps, a few hundred KB per Program (`docs/rebuild-spec.md`) —
not an arbitrary Gantt-chart-tool number. A single Program essentially never
approaches 50 lanes on its own; the case this budget actually guards against
is t26's All-Programs view stacking many Programs' lanes into one vertical
list.

## Vertical only, not horizontal

Only the lane-row (vertical) axis gets virtualized. Time-range (horizontal)
virtualization is deliberately out of scope: #84/t10's zoom already lets a
viewer shrink the rendered date domain on demand, and a single Program's own
date span was never the bottleneck — it's Programs stacking *vertically*
(t26) that made the unbounded axis the vertical one, not the horizontal one
widening.

## Mechanism (implementation, once the budget is exceeded)

`RoadmapTimeline`'s row-bearing container (`containerRef`, already wrapping
the `<svg>`) only becomes its own `overflow-y` scroll region once a
document's real lane-row count exceeds the 50-row budget
(`LANE_VIRTUALIZATION_THRESHOLD` in `RoadmapTimeline.tsx`) — **this is the
implementation's own design choice, not spelled out verbatim in the gist**:
below the threshold, rendering stays byte-identical to pre-t41 (the page/
window scrolls, every row paints), matching the gist's "stay fully smooth...
before it becomes a retrofit" framing rather than imposing a new fixed-height
scroll container on every document regardless of size.

Once active: windowed SVG-row rendering (`use-row-virtualization.ts`) mounts
only the lane rows within the scrolled viewport plus a buffer
(`ROW_VIRTUALIZATION_BUFFER_PX`), keeping today's real SVG nodes and their
drag/click interaction model intact rather than a canvas/WebGL rewrite or an
unbuilt warn-and-degrade fallback. Because the SVG is one absolutely
positioned coordinate space (not a flow-layout list), there's no react-window-
style spacer element to reserve off-screen height — every row's `relY`/
`height` already reserves its space in the SVG's own total height regardless
of whether its content paints, so virtualization only skips the (real) per-
lane layout computation and content painting, never a row's position.

A virtualized-out lane still counts as "visible" for `laneVisible` (t22's
existing lane-hide predicate, unchanged) — virtualization is purely a
render-cost optimization, never a document-content or hidden-lane state. A
dependency connector with either endpoint on a virtualized-out lane is
dropped entirely for that render, mirroring exactly how a connector to a t22-
hidden lane already behaves today.

## `rollupHistory` stays unbounded

`rollupHistory` is **not** pruned or capped — it's t9/t14's already-settled
"genuine append-only history" doctrine, and pruning it would quietly overturn
that decision. The actual liability was never the data's size but the read
path: `rag.ts`'s `priorSnapshot()` did a full `Object.keys().filter().sort()`
scan on every call. Fixed by caching the sorted key list per distinct
`rollupHistory` object reference (a `WeakMap`) and binary-searching it —
`rollupHistory` is only ever replaced via immutable spread
(`use-correction-box.ts`), never mutated in place, so a fresh append always
produces a fresh reference and a correct cache miss.
