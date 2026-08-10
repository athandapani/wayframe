# PROTOTYPE — throwaway, do not build on

Answers wayframe#38 item 4: **what should editing the "So what" (BLUF)
callout look like**, and specifically — the user's own framing — *how would
someone actually write rich text in it?*

**This ran in two rounds, and the second changed the answer.** Round 1
(below, kept for the record) only tested bold/italic, because that's what
the original issue said. Live feedback afterward clarified the real ask was
broader — "all kinds" of rich text (bold, italic, underline, strikethrough,
inline code, links, text color/highlight) — which is a materially different
question, not a bigger version of the same one. See "Round 2" below for
what changed and why.

Three structurally different authoring surfaces, mounted over the real
demo chart/theme so each is judged in context, switchable via `?variant=`
on `/dev/bluf-editing-prototype`:

- **A — Type the syntax.** An explicit Edit-mode toggle drops into plain
  `<textarea>`/`<input>` fields; formatting is typed literally
  (`**bold**`, `*italic*`, `__underline__`, `~~strike~~`, `` `code` ``,
  `[text](url)`, `==highlight==`, `{color:red}text{/color}`) and only
  renders as such once you leave edit mode. A syntax legend is shown while
  editing. Font size is a whole-box Small/Medium/Large scale. No schema
  change needed beyond what's already there — `statement`/`bullets` stay
  plain strings.
- **B — Live rich text + toolbar.** No edit-mode toggle at all — click
  straight into the text (`contentEditable`, Notion/Docs-style). Select a
  phrase and a floating toolbar appears over the selection — Bold, Italic,
  Underline, Strikethrough, Code, Link, text Color, Highlight — the result
  renders immediately, no visible syntax ever. Font size is per-bullet, not
  per-box. This is the one with a real schema consequence:
  `bluf.statement`/`bluf.bullets` would have to become markup, not plain
  strings. Bold/Italic/Underline/Strikethrough use the standard
  `document.execCommand` names; Code/Color/Highlight have no reliable
  execCommand equivalent so those wrap the live selection with
  `insertHTML` directly; Link saves the selection Range before showing a
  URL input (which would otherwise steal focus and collapse it), then
  restores it to call `execCommand('createLink', ...)`. All of this is a
  deliberately quick stand-in for a real contentEditable implementation,
  not something to ship as-is.
- **C — Structured modal, no free-form rich text.** No inline editing at
  all. A small centered modal (same shape as wayframe#17's winning
  milestone-editor pattern) lets you edit the statement as plain text and
  each bullet as text + independent, combinable Bold/Italic/Underline/
  Strikethrough toggles, a whole-bullet color swatch, and an optional
  whole-bullet link — no per-character/per-phrase formatting anywhere.
  Box size is three presets (S/M/L), not a free drag. Deliberately the
  most constrained option.

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

## Round 1 answer (bold/italic only — superseded by Round 2 below)

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

## Round 2 answer (full rich-text set) — the verdict flips to Variant B

Extended all three variants to the full set (underline, strikethrough,
code, links, color, highlight — not just bold/italic) and drove every
token/control in each one live: in **A**, typed all eight tokens into one
bullet and confirmed all eight rendered correctly (`<strong>`, `<em>`,
`<u>`, `<s>`, `<code>`, `<a>`, `<mark>`, colored `<span>` — verified via the
DOM, one of each, zero misses). In **B**, verified Underline/Strikethrough
(`execCommand`), Code/Color (`insertHTML` wrap), and the Link flow
(save-range → show URL input → restore range → `createLink`) all work
correctly against the live selection. In **C**, combined Bold+Underline on
one bullet, set a color swatch on another, and turned a third bullet into
a link — all rendered correctly, and it reconfirmed C's ceiling for real:
the link swallows the *entire* bullet's text, because whole-bullet is the
only granularity C has. There's no way in C to link or color just one
phrase inside a longer sentence — which is the normal real use for a link
or a highlight color ("see the *cert schedule*", not "make this whole
6-line bullet a link").

**That ceiling is why the verdict flips.** At bold/italic-only scope, A's
"just type `**this**`" was a genuine strength — a convention this audience
already knows, zero schema cost. At full rich-text scope, that strength
inverts: eight different bracket/token conventions is a real memorization
tax (hence the legend added to A in this round), and two of them
(underline, color) have **no existing convention to lean on** — they're
invented for this prototype specifically because standard Markdown has no
syntax for either. `{color:red}text{/color}` is not something anyone
already knows; it's exactly as foreign as a toolbar button, except slower
to use and one typo away from not rendering at all (unlike a toolbar,
where every state is reachable by clicking, never by getting punctuation
exactly right). B's toolbar cost doesn't scale with token count the same
way — it went from 2 buttons to 8 and the *interaction* stayed identical:
select text, click a button. The dependency on live selection state is
real (see Round 1's caveat) and needs a proper implementation, not
`execCommand`, before shipping — but that's a one-time engineering cost
to pay once, versus A's memorization cost, which every future editor of
the So-what box pays every time they format anything.

**Revised recommendation: build Variant B for real**, replacing
`document.execCommand`/`insertHTML` with an actual contentEditable range
implementation (or a small, audited rich-text library) so the selection
-dependent commands are reliable rather than "usually fine." `bluf`
becomes markup-bearing (`statement`/`bullets` hold sanitized HTML, not
plain strings) — a real schema change, flagged not silently made. A and C
stay on this throwaway branch as primary sources.

**One caught bug, fixed in Variant A, worth checking in B/C too before
shipping either:** clicking "+ Add bullet" left browser focus on that
button (default behavior for `<button>`), so if the very next keystroke
was a space — near-guaranteed when typing a sentence — it re-activated
the button instead of typing, silently adding another empty bullet instead
of text. Caught it live: typing one sentence into a freshly-added bullet
produced nine empty bullets instead. Fixed in A by auto-focusing the new
input on add; B/C's "+ Add bullet" wasn't re-audited for the same pattern
in this round.
