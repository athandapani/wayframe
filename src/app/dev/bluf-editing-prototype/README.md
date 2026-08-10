# PROTOTYPE — throwaway, do not build on

Answers wayframe#38 item 4: **what should editing the "So what" (BLUF)
callout look like**, and specifically — the user's own framing — *how would
someone actually write something bold or italic in it?*

Three structurally different authoring surfaces, mounted over the real
demo chart/theme so each is judged in context, switchable via `?variant=`
on `/dev/bluf-editing-prototype`:

- **A — Type the syntax.** An explicit Edit-mode toggle drops into plain
  `<textarea>`/`<input>` fields; bold/italic are typed literally as
  `**bold**`/`*italic*` and only render as such once you leave edit mode.
  Font size is a whole-box Small/Medium/Large scale. No schema change
  needed beyond what's already there — `statement`/`bullets` stay plain
  strings.
- **B — Live rich text + toolbar.** No edit-mode toggle at all — click
  straight into the text (`contentEditable`, Notion/Docs-style). Select a
  phrase and a floating Bold/Italic toolbar appears over the selection;
  the result renders immediately, no visible syntax ever. Font size is
  per-bullet, not per-box. This is the one with a real schema consequence:
  `bluf.statement`/`bluf.bullets` would have to become markup, not plain
  strings — `document.execCommand` here is a quick stand-in for a real
  contentEditable range implementation, not something to ship.
- **C — Structured modal, no free-form rich text.** No inline editing at
  all. A small centered modal (same shape as wayframe#17's winning
  milestone-editor pattern) lets you edit the statement as plain text and
  each bullet as text + a whole-row Bold/Italic/Plain toggle — no
  per-character emphasis anywhere. Box size is three presets (S/M/L), not
  a free drag. Deliberately the most constrained option, to actually test
  whether per-word emphasis is needed at all or whether per-bullet is
  enough.

Resize itself is **not** part of the comparison — all three answer it the
same way (drag a corner handle, shared `shared.tsx`), because the open
question was the authoring surface for text, not how resizing works.

## Run it

```
npm run dev
```

Then visit `http://localhost:3000/dev/bluf-editing-prototype`. Cycle
variants with the floating bottom bar or `←`/`→`.

## Try in each variant

- Change the bottom-line statement.
- Add a bullet, delete a bullet.
- Make a phrase bold, then italic.
- Resize the box.

## Two decisions this prototype settles independent of which variant wins

- **Undo:** So-what edits should join `useCorrectionBox`'s existing undo
  stack, the same way `editMilestone`/`editTopLevelItem` do — instant-save,
  no AI interpretation to double-check, so there's no reason for a separate
  undo mechanism. Not simulated here (out of scope for "what should this
  look like"), just decided.
- **Resize is a document property, not a viewer preference** — unlike
  `BlufCallout`'s existing *position*, which is explicitly a per-viewer
  localStorage preference (wayframe#31) because where one person likes to
  read the chart says nothing about the roadmap. Size is different: a
  program owner picking "this callout needs to be bigger, there's a lot to
  say this week" is a real editorial choice about the content, and everyone
  viewing the file should see the box they sized it to, not their own
  default. Travels with the file like `Milestone.shortLabel` does, not like
  position does.

## Answer

**Variant A wins — type the syntax.** Tried all three live against the real
demo BLUF content, including actually making phrases bold and italic in
each.

- **A** rendered `**Atlas**` / `*on track*` correctly on every attempt,
  needs zero schema change (`statement`/`bullets` stay plain strings —
  the same shape a future AI-driven "So-what" correction op would use,
  composing cleanly with wayframe#38 item 1's widened `PatchOpSchema`),
  and the authoring convention (`**bold**`) is one this specific audience
  already knows cold from Markdown/GitHub/Slack. The one rough edge: at
  the default box width the header row (label + SM/MD/LG + Edit/Done) is
  cramped enough that "Done" nearly clips — fine once resize is available,
  worth a slightly wider default.
- **B** (live rich text + toolbar) is the most modern-feeling interaction,
  but testing it surfaced a real architectural cost, not just a nice-to-have
  schema change: the toolbar's bold/italic only works while a live browser
  text *selection* survives the trip from mouseup to button-click — nothing
  else in this app depends on transient selection state surviving a click
  to another element. `document.execCommand` itself worked fine once a
  selection existed (confirmed by driving it directly), but the dependency
  on selection state at all is the kind of thing that's fine 95% of the
  time and silently no-ops the other 5% — a worse failure mode than A's
  (which never has a not-quite-there intermediate state) for a feature
  whose whole point is being trustworthy enough to hand off to non-technical
  stakeholders.
- **C** (structured modal, whole-bullet emphasis only) is the safest and
  reuses a proven pattern (wayframe#17's modal), but doesn't actually answer
  the question that was asked — "how will someone write something bold or
  italic" implies inline, per-word emphasis, and C can only bold or
  italicize an entire bullet at once. Keep it in mind as a fallback if A
  turns out to need more scaffolding than expected, not as the primary
  answer.

**Also answered, independent of the variant:** So-what edits join
`useCorrectionBox`'s undo stack (instant-save, same as `editMilestone`),
and box size is a document property, not a viewer preference like
position — see the reasoning above.

**Graduates to a Build ticket:** fold Variant A into `BlufCallout.tsx` —
add/delete-bullet controls, the SM/MD/LG font-size control (give the header
row more room than this prototype's default width), the `**`/`*` inline
renderer, and a `size: { width, height }` field on `RoadmapData.bluf`. `B`
and `C` stay on this throwaway branch as primary sources, not folded in.
