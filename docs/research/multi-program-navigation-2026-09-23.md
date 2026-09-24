# Multi-Program navigation: revising #125's Variant B (2026-09-23)

Record of what wayframe#144 changed about a **resolved** verdict, and what it
deliberately kept. #125 chose "Variant B" for the combined multi-Program
editor and #126 built it; #144 revises one property of that layout after
seeing it carry four real Programs. Writing it down here rather than letting
the code quietly contradict a closed decision.

## What #125 decided, and why it still holds

#125 prototyped three layouts and picked **B**: a left Program rail that
doubles as the structure editor (no tabs anywhere — the expanded rail card
*is* the selected tab), a merged canvas beside it always showing every
Program, and a right-docked inspector for whatever is being edited. It
rejected:

- **A** (bottom dock + spreadsheet tabs) — a permanent vertical cost, and
  band-collapse state buried behind a tab switch.
- **C** (drawer over the canvas) — covers the Programs you are moving
  between, and breadcrumb-as-move makes a cross-document move read like a
  rename.

Every one of those arguments survives #144, and none of the rail's jobs
moved: lanes and groups, add/reorder/delete Program, per-lane cross-Program
move, and the two deliberately independent per-card affordances (collapse
that Program's *band* on the canvas; expand that card into its *structure
editor*) — the thing Variant B was picked for, since it lets a Program be
restructured while its band is collapsed, with all 3-4 collapse states
readable at once.

## What #144 revised

One word: **permanent**.

The prototype chose a rail-first layout before there was real multi-Program
content on screen. With four real Programs loaded, the cost showed: ~290-320px
charged to every session to display information most sessions don't need,
beside an executive-style cross-Program rollup bar stacked on top of an
editing canvas. The surface read as two products competing for one screen.

So:

- **The rail starts collapsed** and opens on demand, as a thin strip that
  still reports how many Programs the Roadmap has and which of their bands are
  collapsed. Viewer-local state, like band collapse. Both states carry an
  obvious control — the other half of the brief, since neither dock had an
  intuitive way in or out once opened (the right inspector's close affordance
  went from a bare grey glyph to a real bordered button in the same pass).
- **The surface gains the Executive/Program toggle** it never had. The
  single-Program page has had that primitive since #8; multi-Program should
  extend it rather than invent a second navigation model.
- **The cross-Program rollup leaves the editing canvas** for the Executive
  reading, which is where "how is each Program doing" belongs. #145 breaks it
  down Program by Program there.
- **A Programs picker replaces two mis-described links** (#150). `/all`
  offered "← Back to Roadmap" that went to a *single* Program, and `/p/[id]`
  offered "View all Programs" as though the combined canvas were a special
  mode rather than the Roadmap itself. Both framed the single Program as home
  and the Roadmap as the detour, which is backwards. One picker beside the
  mode toggle now says `All Programs` (the Roadmap) or a Program by name.

## The route question #144 asked, and the answer

> `/p/[portfolioId]/all` and `/p/[portfolioId]` converge in the user's mental
> model here; decide whether the dropdown replaces the separate route or just
> drives what the existing one renders.

**The picker navigates between the two routes; it does not filter the combined
canvas down to one Program.** The two routes are not two views of one surface.
`/p/[id]` carries Portfolio-level editing the combined surface structurally
cannot — theme, legend categories, export, saved views — because each of its
boxes holds its own copy of the Portfolio and only the Program half of a box
syncs (see `CombinedProgramEditor.tsx`'s header, seam 3). Scoping the combined
canvas to a single Program in place would therefore hand the user a *worse*
single-Program editor than the one that already exists, three feet away. The
picker points at the real one.

`All Programs` stays the combined, **editable** canvas — every Program as a
band on one shared time axis, cross-Program move intact. Only the chrome
around it changed.
