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
