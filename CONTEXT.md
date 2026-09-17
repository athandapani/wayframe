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

**Swimlane Group** (t21):
A structural container owning an ordered set of member Swimlanes (via `Swimlane.groupId`), rendered as a full-width header band above them — generalizing the look of today's separator row, not a rotated side rail (that prototype variant went illegible on short groups with long names, and the interactive canvas doesn't need it since it's deferred to export/Slides). A Group and an ungrouped Swimlane are peers sharing one top-level `order` space; a member lane's `order` is scoped to its group's siblings instead.
_Avoid_: Separator (`Swimlane.type === "separator"`) — the pre-t21 flat-band concept a schema migration converts into a real Swimlane Group on load; it remains a legal type value only as a defensive fallback for a not-yet-migrated or hand-edited document, not a permanently-coexisting concept, Section

**Lane Row**:
A structural sub-division of a Swimlane that a milestone or phase can be assigned to, letting items be placed at different vertical positions within one lane. A Swimlane owns a variable-length list of Lane Rows (starting at 2, growing as needed) independent of any single milestone's placement.
_Avoid_: Row (ambiguous with table/UI rows elsewhere), Track

**Role**:
One of `owner` / `editor` / `viewer`, held per-identity on a Portfolio and checked server-side at the Partykit room on every connection — never trusted from anything a client sends. A room-access token proves *identity* only; the room looks up the current role itself. See "Server-side enforcement" below.
_Avoid_: Permission (informal synonym — Role is the canonical term for what's actually stored per identity)

**Guest Session**:
The identity a public-link visitor gets: a fresh, ephemeral `guest:<id>` granted whichever role (`editor`/`viewer`, never `owner`) the link itself carries. Distinct from Role/membership — a guest is never written to the Portfolio's membership list, since the link itself (not a stored grant) is the credential. An unsigned-in visitor with no link at all gets no hosted access whatsoever, not a guest session with some default role.
_Avoid_: Anonymous user (implies an unauthenticated identity with default access; a guest session always requires holding an actual link)

**Pending Invite**:
An owner-chosen role (`editor`/`viewer`) sitting keyed by email rather than identity, because at invite time the recipient's real (Google `sub`-based) identity isn't known yet. Resolved into a real Role the moment a matching-email identity signs in, then discarded — a Pending Invite never itself grants access anywhere before that resolution, and is checked by nothing else. Distinct from Guest Session: an invite becomes a real, permanent membership row once accepted, while a Guest Session's access lives and dies with the link token.
_Avoid_: Invitation (used loosely elsewhere for the email/UI flow as a whole; Pending Invite is specifically the stored, not-yet-resolved row)

## Doctrine

**Document content vs. viewer preference** (#76):
A knob is *document content* if changing it is an editorial act on the shared plan — true for every collaborator, live, and for anyone who later opens, exports, or snapshots the document. A knob is a *viewer preference* if it only affects how one person is personally reading an otherwise-unchanged plan, with no bearing on what anyone else sees. Test: *"Do I want this true of the plan, or only true of my screen, right now?"*

This restates the older single-user rule (`docs/rebuild-spec.md` §10 — "editorial calls the document owner makes that everyone opening the file should see identically") for a world with no single owner: under realtime CRDT collaboration, any collaborator with edit access can make the editorial call, and "everyone opening the file" now includes everyone already looking at it live. It's why Style Override, Theme, Snapshot, and swimlane visibility are all document content, alongside the pre-existing list (lane color, lane density, lane owner, BLUF box size, etc.) — none of that is a case-by-case list to re-derive per field, it's one test.

Consequences settled alongside the rule:
- **Live propagation**: document-content changes sync exactly like any other document edit — instant, silent, CRDT-synced, undoable via the normal per-Program undo stack. No bespoke "someone changed the theme" notification; the general collaborator-presence UI (cursors/avatars) already required by realtime collab covers "who did this."
- **No per-viewer override layer**: document content is single-source-of-truth WYSIWYG for every collaborator. There is no "hide this lane for just me" or "render in my own theme regardless of the document's" shadow-rendering path. Known gap, left open rather than silently dropped: this leaves no accessibility escape hatch (e.g. a colorblind-safe override of Theme's RAG colors) for a future ticket to pick up.
- **Saved Views narrow to viewer-prefs-only**: since Theme/visibility are no longer viewer preferences at all, Saved Views (`docs/rebuild-spec.md` §10.1) can never capture or re-apply them — applying a personal view must never mutate the document. The built-in presets had their content-field clauses (e.g. "Presentation"'s theme swap) rewritten out for this reason.

**Server-side enforcement** (#90):
Access control is never a client-owned toggle, because a client that can flip its own write-gate can never be trusted to gate its own writes — the check has to live somewhere the writer doesn't control. In practice that means the Partykit room, not the browser: a Role is resolved fresh from the database on every connection, using only a signed proof of *identity* the client can't forge, never a role the client asserts about itself.

This is why `wayframe:edit-lock` (the pre-multi-user "Edit lock"/"View only" toggle) split into two unrelated things rather than being replaced wholesale: its access-control half (can this write actually reach the document) moved server-side and stopped being a toggle at all — it's just whatever Role resolves to. Its presentation-preference half (collapse my own affordances so I don't fat-finger an edit while presenting) is a real, still-useful, purely personal setting with no bearing on what anyone else can do — that half is an ordinary viewer preference (see "Document content vs. viewer preference" above) and survives unchanged in `use-edit-lock.ts`, untouched by Role.
