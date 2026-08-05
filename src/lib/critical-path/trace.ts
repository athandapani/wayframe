import type { Milestone } from "@/components/timeline/types";

/**
 * Ad-hoc path highlighting — "show me everything feeding this milestone".
 *
 * WHY THIS IS NOT `isCriticalPath`. The obvious shortcut is to mark the
 * milestones you want highlighted as critical. Don't: critical path is a
 * computed answer to a specific question ("what sequence sets the finish
 * date?"), and hand-marking unrelated milestones critical destroys that
 * signal for everyone reading the chart afterwards — including the
 * executive view's risk rollup and the export. It also isn't durable in the
 * way you'd want: the next recompute overwrites anything not pinned with
 * isCriticalPathOverride, so you'd be fighting the algorithm.
 *
 * A trace is a different kind of thing: a *view state*, not document
 * content. It answers "what does this one milestone depend on?" for one
 * reader, right now, and it's cleared by clicking away. Nothing about the
 * roadmap changes, so two people can trace two different milestones from
 * the same document at the same time.
 *
 * Colour is what keeps them apart: critical path is red (fixed, meaningful,
 * always the same thing), a trace is the theme's own accent (blue in
 * Blueprint and Graphite, ink in Press). Red says "this paces the program",
 * accent says "you asked about this". Where they overlap, critical wins the
 * line and the trace still lifts the markers, so a traced critical edge
 * doesn't hide which one it is.
 */

export type TraceDirection = "upstream" | "downstream" | "both";

/**
 * Transitive closure from `rootId` in the requested direction, including
 * the root. Iterative rather than recursive, and guarded with a visited
 * set, so a cyclic document can't hang the render.
 */
export function traceFrom(milestones: readonly Milestone[], rootId: string, direction: TraceDirection): Set<string> {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  if (!byId.has(rootId)) return new Set();

  const successors = new Map<string, string[]>();
  for (const m of milestones) {
    for (const d of m.dependsOn) {
      if (!successors.has(d.id)) successors.set(d.id, []);
      successors.get(d.id)!.push(m.id);
    }
  }

  const seen = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const next: string[] = [];
    if (direction === "upstream" || direction === "both") next.push(...(byId.get(id)?.dependsOn.map((d) => d.id) ?? []));
    if (direction === "downstream" || direction === "both") next.push(...(successors.get(id) ?? []));
    for (const n of next) {
      if (!seen.has(n) && byId.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** True when the edge from -> to lies inside the traced set (so it should be drawn). */
export function isTracedEdge(traced: Set<string>, fromId: string, toId: string): boolean {
  return traced.has(fromId) && traced.has(toId);
}
