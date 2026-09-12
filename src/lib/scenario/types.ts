import type { Milestone, Status, TopLevelItem } from "@/components/timeline/types";

/**
 * Scenario document model (t13, wayframe#87) — a named alternate plan layered
 * over Baseline as a sparse delta list, resolved live against a Program's
 * current state every time (see resolve.ts's `resolveScenario`), never a
 * materialized copy. Same base+override idiom PortfolioTheme (theme.ts,
 * wayframe#88/t18) borrowed *from* this ticket's own resolution — see its
 * doc for why a sparse per-field delta beats a whole-item blob under
 * concurrent edits.
 *
 * Ported from the throwaway prototype (prototypes/scenario-rebase-87.html,
 * wayframe#87) with one real-schema correction: the prototype modeled
 * Baseline as a single flat `items` map shared by milestones and phases,
 * written before Program's actual shape (two independent id spaces,
 * `milestones: Milestone[]` and `topLevelItems: TopLevelItem[]`) was known.
 * `Scenario` mirrors that split with two parallel override/addition maps
 * instead of one, since a milestone id and a topLevelItem id can collide
 * without meaning the same target.
 *
 * Storage-agnostic on purpose (t14's own gist, not yet implemented, plans to
 * nest a Scenario as a Y.Map inside its Program's CRDT subdoc, and to reuse
 * this ticket's live orphan-detection doctrine more broadly) — this is a
 * plain object today, not a CRDT type.
 */
export interface Scenario {
  id: string;
  name: string;
  /** Keyed by Baseline `Milestone.id`. At most one override per target — see setMilestoneOverride's doc for why a second `set` replaces rather than stacks. */
  milestoneOverrides: Record<string, MilestoneOverride>;
  /** Keyed by Baseline `TopLevelItem.id`. */
  topLevelItemOverrides: Record<string, TopLevelItemOverride>;
  /** Scenario-only new milestones — never rebased against Baseline, since they have no Baseline counterpart to conflict with. Can still dangle if `dependsOn` points at a Baseline id that later disappears (see resolveScenario's dangling-reference conflict). */
  milestoneAdditions: Record<string, Milestone>;
  /** Scenario-only new top-level items (phases/annotations/top-level milestones). */
  topLevelItemAdditions: Record<string, TopLevelItem>;
}

/** Fields a Scenario override can patch onto a Baseline Milestone — everything except its identity and its own drift counter. */
export type MilestonePatch = Partial<Omit<Milestone, "id" | "rev">>;

/**
 * Fields a Scenario override can patch onto a Baseline TopLevelItem.
 * `TopLevelItem` is a discriminated union with only `id`/`type`/`title` in
 * common across its three variants, so this is spelled out as the flat union
 * of every variant's own patchable fields (each optional) rather than
 * `Partial<Omit<TopLevelItem, ...>>` (which would collapse to just the
 * shared fields) — same field set use-correction-box.ts's own
 * `TopLevelItemPatch` covers, written as a flat interface rather than an
 * intersection of per-variant `Partial<Omit<Extract<...>>>` types so its
 * shape matches schema.ts's Zod-mirror bit-for-bit under the compile-time
 * `Equals<>` check (an intersection and an equivalent flattened object type
 * aren't always structurally identical under that check's strict
 * mutual-conditional comparison, even though they accept the same values).
 */
export interface TopLevelItemPatch {
  title?: string;
  date?: string;
  status?: Status;
  showReferenceLine?: boolean;
  potentialDate?: string;
  startDate?: string;
  endDate?: string;
  message?: string;
}

/** Hides the Baseline item in this Scenario — no conflict regardless of what Baseline does to it afterward (resolveScenario), until/unless it later gets GC'd (gcScenario) once Baseline agrees by deleting the target too. */
export interface RemoveOverride {
  op: "remove";
}

export interface ModifyMilestoneOverride {
  op: "modify";
  patch: MilestonePatch;
  /** The Baseline item's `rev` (see Milestone.rev's doc, types.ts) at the moment this override was set — resolveScenario compares it against the item's *current* rev to flag "plan moved since you set this" drift. */
  baseRevAtCreation: number;
}

export interface ModifyTopLevelItemOverride {
  op: "modify";
  patch: TopLevelItemPatch;
  baseRevAtCreation: number;
}

export type MilestoneOverride = ModifyMilestoneOverride | RemoveOverride;
export type TopLevelItemOverride = ModifyTopLevelItemOverride | RemoveOverride;

export function createScenario(id: string, name: string): Scenario {
  return { id, name, milestoneOverrides: {}, topLevelItemOverrides: {}, milestoneAdditions: {}, topLevelItemAdditions: {} };
}
