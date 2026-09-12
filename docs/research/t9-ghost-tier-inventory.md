# t9 — Delta-annotation inventory & tier budget

Inventory of the two existing "ghost" annotation systems and the shared
vertical tier space they both draw into, ahead of t23's unified
delta-annotation layer. Source: `src/components/timeline/label-layout.ts`
and `src/components/timeline/RoadmapTimeline.tsx` as of 2026-09-11.

## Shared tier budget

`GHOST_TIER_DY = [-18, -30, -70]` (label-layout.ts:20) — 3 vertical slots
above a marker's `cy`, escalating outward: tier 0 (closest, -18), tier 1
(-30, a 12px step from tier 0), tier 2 (-70, a 40px step from tier 1, plus
a leader line since it's a large unconditional pull-out). Both systems
below place into these same 3 slots via the same `layoutGhostBadges()`
(label-layout.ts:52), which sorts items by `x`, tries tier 0 then tier 1
for a horizontally non-colliding, non-blocker-colliding slot (`MIN_GAP =
4px` horizontal clearance), and falls back to tier 2 unconditionally.

## System 1 — slip badge (`originalDate`)

- Trigger: `m.originalDate && m.originalDate !== m.date` (a milestone that
  slipped from a prior committed date).
- Two render styles, switched by the `GhostMode` viewer preference
  (`"off" | "badge" | "outline"`, RoadmapTimeline.tsx:723):
  - `"outline"` → `GhostOutline` (RoadmapTimeline.tsx:862): a dashed
    hollow circle (`strokeDasharray="2 2"`) at the original position,
    `ghostCx`. No label, no tier placement needed.
  - `"badge"` → `GhostBadge` (RoadmapTimeline.tsx:877): a filled pill at
    `cx+12, cy+GHOST_TIER_DY[tier]` with delta-only label text from
    `ghostBadgeLabel()` (RoadmapTimeline.tsx:730): `` `${late ? "+" : ""}${slipDays}d` ``
    (e.g. `+5d` if later, `-2d` if earlier). Pill color: amber `#f59e0b`
    if late, blue `#0ea5e9` otherwise. Supports manual drag-to-reposition
    on top of the tier position (leader line drawn when `moved`).
- Tier placement (RoadmapTimeline.tsx:1515–1541): only computed when
  `ghostMode === "badge"` (outline mode needs no collision pass). Seeded
  with `badgeItems` at `x(m.date) + 12 + w/2` and `blockers` = every
  lane milestone's already-placed **title** block from the `primary` map
  (both its tier-0 and tier-1 rows, since a wrapped 2-line title can reach
  into tier 1). Not seeded with anything from system 2.

## System 2 — at-risk projection (`potentialDate`)

- Trigger: `m.potentialDate` set (a forward-looking risk the committed
  date hasn't moved for yet).
- Three render styles, switched by the `AtRiskStyle` viewer preference
  (`"sibling" | "comet" | "zone"`, `AtRiskMode = "off" | AtRiskStyle"`,
  RoadmapTimeline.tsx:748–749), all sharing one label from `atRiskLabel()`
  (RoadmapTimeline.tsx:751): `` `+${days}d risk · ${formatDateShort(toDate)}` ``
  (e.g. `+12d risk · Mar 4`):
  - `"sibling"` (RoadmapTimeline.tsx:780): dotted leader to a dashed
    hollow diamond at `riskCx`, with a pill badge riding the tier offset
    — same grammar as system 1's outline+badge combined into one style.
  - `"comet"` (RoadmapTimeline.tsx:800): 4 fading tapered line segments
    from `cx` to `riskCx`, ending in a soft translucent halo + filled
    dot; label in plain text (no pill) at the tier offset.
  - `"zone"` (RoadmapTimeline.tsx:833): not a second marker — a
    translucent wedge polygon spanning committed→projected date, capped
    with a flag pin; label at the tier offset.
  - All three read `tier` from the same `GHOST_TIER_DY` table
    (`AtRiskProjection`'s `labelY = cy + GHOST_TIER_DY[tier]`,
    RoadmapTimeline.tsx:777).
- Tier placement (RoadmapTimeline.tsx:1550–1564): computed whenever
  `atRiskMode !== "off"`. Seeded with `items` at `x(m.potentialDate)` and
  **the same title-blockers construction as system 1**, rebuilt
  independently a few lines later — but *not* seeded with system 1's
  ghost-badge placements.

## The contention t23 needs to resolve

Both passes call the identical `layoutGhostBadges()` over the identical
3-tier budget, seeded only with title blockers, **never with each
other's output**. A milestone can carry both an `originalDate` slip and a
`potentialDate` projection at once (already slipped, now at risk of
slipping again) — each system places its own label independently, so
both can land at tier 0 with no knowledge the other slot is taken. The
two items sit at different x positions (`x(m.date)+12` for the slip
badge vs. `x(m.potentialDate)` for the projection), so it's not a
guaranteed collision, but there's no code preventing one when the two
x-positions land close together — the two passes are blind to each
other by construction, not by coincidence.

A third (scenario-diff) consumer envisioned for t23 would hit the exact
same blind spot if it's added as a fourth independent
`layoutGhostBadges()` call. The actual fix — one shared placement pass
across all delta-annotation consumers rather than N independent ones —
is t23's job, not this ticket's; this inventory exists so t23 can design
against precise current behavior instead of a guess.
