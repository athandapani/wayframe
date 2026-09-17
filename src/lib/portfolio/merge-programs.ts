// The merge boundary for the All-Programs merged view (t26, wayframe#104).
//
// Per t26's resolved gist: ids are only unique within a Program's own CRDT
// subdoc (t14's decision) — two sibling Programs can each have a Swimlane
// literally named "lane-1" with the same id. Nothing downstream of this
// module (mergeForRender, RoadmapTimeline) is safe to hand a document that
// mixes ids from more than one Program without first namespacing every one
// of them. This module does exactly that, and nothing else: it produces a
// single, plain, Program-shaped object — never a RenderableProgram, never
// I/O, never a Portfolio lookup — so a caller still has to run the result
// through the existing `mergeForRender(portfolio, mergedProgram)` (see
// src/components/timeline/types.ts) to get something RoadmapTimeline can
// render.
//
// The other half of the gist — "a Program is just a depth-0
// (parentGroupId-less) SwimlaneGroup wrapping that Program's real
// SwimlaneGroups as depth-1 children" — is what `mergeProgramsForAllView`
// builds: one synthetic wrapping SwimlaneGroup per Program, with every one
// of that Program's own Swimlanes (grouped or not) and SwimlaneGroups
// (nested or not) ending up somewhere underneath it. That's what gives "no
// cross-Program lane interleaving": a lane can never render as a top-level
// sibling of another Program's lane, because every lane always has *some*
// groupId after this runs — its own real group's namespaced id, or the
// Program band's id as a fallback.

import type { Milestone, Program, Swimlane, SwimlaneGroup, TopLevelItem } from "@/components/timeline/types";

/** Separator between a namespaced id's owning-Program half and its Program-local half. See `namespaceId`/`splitNamespacedId`. */
export const MERGED_ID_SEP = "::";

/** Namespaces a Program-local id so it's unique across every Program in a merged view (t14: ids are only unique within one Program's own CRDT subdoc). */
export function namespaceId(programId: string, localId: string): string {
  return `${programId}${MERGED_ID_SEP}${localId}`;
}

/**
 * Inverse of namespaceId — splits a merged-view id back into its owning
 * Program id and that Program's own local id. Returns null for an id that
 * was never namespaced (e.g. malformed input) — never throws.
 *
 * Splits only on the FIRST occurrence of MERGED_ID_SEP, deliberately: a
 * Program-local id could itself happen to contain "::" (nothing forbids
 * that upstream), and a Program's own id is not expected to. Splitting on
 * the first occurrence rather than the last preserves that asymmetry, so a
 * local id containing the separator still round-trips through
 * namespaceId/splitNamespacedId unchanged.
 */
export function splitNamespacedId(id: string): { programId: string; localId: string } | null {
  const idx = id.indexOf(MERGED_ID_SEP);
  if (idx === -1) return null;
  return { programId: id.slice(0, idx), localId: id.slice(idx + MERGED_ID_SEP.length) };
}

/** The synthetic id every Program gets namespaced under for its own depth-0 wrapping SwimlaneGroup — see mergeProgramsForAllView's doc. */
const PROGRAM_BAND_LOCAL_ID = "__program__";

/**
 * Merges N Programs into one Program-shaped object for a read-only
 * All-Programs view: namespaces every id, and wraps each Program's own
 * content under one synthetic depth-0 SwimlaneGroup (id =
 * namespaceId(program.id, "__program__")) so it renders as a Program band —
 * per the gist, a Program *is* a depth-0 SwimlaneGroup, not a second
 * mechanism. Every one of a Program's own Swimlanes (grouped or not) and
 * SwimlaneGroups (nested or not) ends up somewhere under that Program's own
 * band — this is what gives "no cross-Program lane interleaving": a lane
 * can never render as a top-level sibling of another Program's lane.
 *
 * Programs are laid out in `order` order (Portfolio > Program tier, t11) —
 * the returned pseudo-Program's own swimlaneGroups/swimlanes/topLevelItems/
 * milestones arrays are simply concatenated in that order, so downstream
 * consumers that iterate array order rather than re-sorting by `order` still
 * see Programs sequentially, not interleaved.
 *
 * accentHue is assigned evenly across the color wheel by each Program's
 * position in the (order-sorted) input array (360/count * index) — same
 * "evenly spread across the wheel" idiom lane-colors.ts's own doc already
 * uses for lane accents, just applied one tier up.
 */
export function mergeProgramsForAllView(portfolioId: string, programs: Program[]): Program {
  const sorted = [...programs].sort((a, b) => a.order - b.order);

  const swimlaneGroups: SwimlaneGroup[] = [];
  const swimlanes: Swimlane[] = [];
  const topLevelItems: TopLevelItem[] = [];
  const milestones: Milestone[] = [];

  sorted.forEach((program, i) => {
    const programBandId = namespaceId(program.id, PROGRAM_BAND_LOCAL_ID);
    const accentHue = (360 / sorted.length) * i;

    // The Program band itself — depth-0, no parentGroupId, tinted per this
    // Program's slot in the wheel.
    swimlaneGroups.push({
      id: programBandId,
      order: program.order,
      name: program.programName,
      accentHue,
    });

    // This Program's own real (t21) SwimlaneGroups nest one level deeper —
    // a group that already had a parentGroupId keeps nesting under its own
    // (now-namespaced) parent; one that didn't becomes a direct depth-1
    // child of the Program band.
    for (const g of program.swimlaneGroups ?? []) {
      swimlaneGroups.push({
        ...g,
        id: namespaceId(program.id, g.id),
        parentGroupId: g.parentGroupId ? namespaceId(program.id, g.parentGroupId) : programBandId,
      });
    }

    // Every Swimlane, grouped or not, ends up with a groupId pointing
    // somewhere under this Program's own band — an originally-ungrouped
    // lane becomes a direct depth-1 child of the Program band rather than
    // floating top-level (which would let it render as a sibling of another
    // Program's lanes).
    for (const sl of program.swimlanes) {
      swimlanes.push({
        ...sl,
        id: namespaceId(program.id, sl.id),
        groupId: sl.groupId ? namespaceId(program.id, sl.groupId) : programBandId,
      });
    }

    // TopLevelItem has no other id-shaped fields to namespace.
    for (const item of program.topLevelItems) {
      topLevelItems.push({ ...item, id: namespaceId(program.id, item.id) });
    }

    // laneId, every dependsOn[].id, and linksToTopLevelMilestone (when
    // non-null) all reference another id within this same Program's id
    // space, so all namespace together. categoryId is left alone — it's a
    // Portfolio-level legendCategories FK, shared and already unique across
    // every Program.
    for (const m of program.milestones) {
      milestones.push({
        ...m,
        id: namespaceId(program.id, m.id),
        laneId: namespaceId(program.id, m.laneId),
        dependsOn: m.dependsOn.map((d) => ({ ...d, id: namespaceId(program.id, d.id) })),
        linksToTopLevelMilestone: m.linksToTopLevelMilestone != null ? namespaceId(program.id, m.linksToTopLevelMilestone) : m.linksToTopLevelMilestone,
      });
    }
  });

  return {
    id: `merged:${portfolioId}`,
    portfolioId,
    order: 0,
    programName: "All Programs",
    generatedAt: new Date().toISOString(),
    owner: "",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes,
    swimlaneGroups,
    topLevelItems,
    milestones,
  };
}
