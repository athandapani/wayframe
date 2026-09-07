# Wayframe

Wayframe turns rough plans, whiteboard photos, CSVs, or Smartsheets into swimlane roadmap visualizations. This context covers the domain concepts introduced by the multi-program/scenario/theming rebuild planned via the wayfinder map "Wayframe multi-program rebuild."

## Language

**Portfolio**:
The top-level container holding multiple Programs. Owns the all-programs view and the cross-program executive rollup. New concept — today's app has no equivalent; a single Program is the whole app.

**Program**:
One roadmap document — what `RoadmapData` is today (swimlanes, milestones, phases, annotations), gaining its own identity so a Portfolio can hold many of them. Baseline and Scenario are owned by the Portfolio, not by the Program — see below.
_Avoid_: Roadmap (the visual artifact rendered from a Program), Document (the file-persistence concern, not the domain object)

**Baseline**:
The default Scenario: the committed plan with no deltas applied, owned at Portfolio scope. Distinct from today's narrow `Milestone.originalDate` snapshot field, which is a single-value per-milestone slip marker, not a full plan state.

**Scenario**:
A named alternate plan owned by the Portfolio (not by an individual Program), layered on top of Baseline. A Scenario's deltas can add, remove, or modify milestones and phases in any Program within the Portfolio — a fuller alternate-state structure, not a sparse date-only diff. Selecting a Scenario for the executive view or an export is a Portfolio-level choice that can affect multiple Programs at once.
_Avoid_: Variant, What-if (informal synonyms — Scenario is the canonical term)

**Snapshot**:
An immutable, timestamped freeze of an entire Portfolio — every Program, the Baseline, and every Scenario — taken after a team review. View-only forever; cannot be edited or re-baselined. Distinct from Baseline (the live, editable default Scenario) and from Scenario (a live, editable alternate plan) — a Snapshot freezes all of them at once.
_Avoid_: Version, Backup (a Snapshot is a deliberate archival record, not an autosave)

**Style Override**:
Document-content data letting any visual element (milestone, phase, annotation, swimlane) override a rendering property (shape, scale, label attachment, font scale, show/hide) that otherwise falls back to a global default. Lives in the document so it travels with save/share/export — distinct from today's viewer-local drag nudges (`use-label-overrides.ts`), which stay local and are not part of the document.
_Avoid_: Preference (viewer-local settings like theme choice or font family remain viewer preferences, not Style Overrides — Style Override is specifically per-element and document-content)

**Theme**:
The existing `Theme` interface (colors, lane ramps) — reclassified from a viewer-local preference (localStorage) to **Portfolio document content**, so a shared or snapshotted Portfolio renders with the author's intended palette rather than each viewer's own. Custom themes are created and managed per Portfolio.
_Avoid_: Skin (informal), View preference (the old scope, no longer accurate)

**Swimlane Group**:
A structural container owning an ordered set of child Swimlanes, rendered as a single vertical band spanning those lanes with a rotated label. New concept — today's "group" (`SwimlaneManager.tsx`) is actually a `separator`-type Swimlane, a flat band in the same ordered list, not a container other lanes belong to.
_Avoid_: Separator (the existing flat-band concept, kept distinct from Swimlane Group), Section

**Lane Row**:
A structural sub-division of a Swimlane that a milestone or phase can be assigned to, letting items be placed at different vertical positions within one lane. A Swimlane owns a variable-length list of Lane Rows (starting at 2, growing as needed) independent of any single milestone's placement.
_Avoid_: Row (ambiguous with table/UI rows elsewhere), Track

## Doctrine

**Document content vs. viewer preference** (#76):
A knob is *document content* if changing it is an editorial act on the shared plan — true for every collaborator, live, and for anyone who later opens, exports, or snapshots the document. A knob is a *viewer preference* if it only affects how one person is personally reading an otherwise-unchanged plan, with no bearing on what anyone else sees. Test: *"Do I want this true of the plan, or only true of my screen, right now?"*

This restates the older single-user rule (`docs/rebuild-spec.md` §10 — "editorial calls the document owner makes that everyone opening the file should see identically") for a world with no single owner: under realtime CRDT collaboration, any collaborator with edit access can make the editorial call, and "everyone opening the file" now includes everyone already looking at it live. It's why Style Override, Theme, Snapshot, and swimlane visibility are all document content, alongside the pre-existing list (lane color, lane density, lane owner, BLUF box size, etc.) — none of that is a case-by-case list to re-derive per field, it's one test.

Consequences settled alongside the rule:
- **Live propagation**: document-content changes sync exactly like any other document edit — instant, silent, CRDT-synced, undoable via the normal per-Program undo stack. No bespoke "someone changed the theme" notification; the general collaborator-presence UI (cursors/avatars) already required by realtime collab covers "who did this."
- **No per-viewer override layer**: document content is single-source-of-truth WYSIWYG for every collaborator. There is no "hide this lane for just me" or "render in my own theme regardless of the document's" shadow-rendering path. Known gap, left open rather than silently dropped: this leaves no accessibility escape hatch (e.g. a colorblind-safe override of Theme's RAG colors) for a future ticket to pick up.
- **Saved Views narrow to viewer-prefs-only**: since Theme/visibility are no longer viewer preferences at all, Saved Views (`docs/rebuild-spec.md` §10.1) can never capture or re-apply them — applying a personal view must never mutate the document. The built-in presets had their content-field clauses (e.g. "Presentation"'s theme swap) rewritten out for this reason.
