import { describe, expect, it } from "vitest";
import type { Milestone } from "@/components/timeline/types";
import { traceFrom } from "./trace";

function m(id: string, deps: string[] = []): Milestone {
  return {
    id,
    laneId: "lane-1",
    title: id,
    date: "2026-01-01",
    status: "not-started",
    dependsOn: deps.map((d) => ({ id: d, showConnector: false })),
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
  };
}

//   a -> b -> d
//        c -> d -> e
const GRAPH = [m("a"), m("b", ["a"]), m("c"), m("d", ["b", "c"]), m("e", ["d"])];

describe("traceFrom", () => {
  it("walks the full upstream closure, not just direct predecessors", () => {
    expect(traceFrom(GRAPH, "e", "upstream")).toEqual(new Set(["e", "d", "b", "c", "a"]));
  });

  it("walks downstream", () => {
    expect(traceFrom(GRAPH, "a", "downstream")).toEqual(new Set(["a", "b", "d", "e"]));
  });

  it("excludes branches that aren't connected in the chosen direction", () => {
    // `c` feeds d, but tracing upstream from b must not reach it.
    expect(traceFrom(GRAPH, "b", "upstream")).toEqual(new Set(["b", "a"]));
  });

  it("covers both directions from a midpoint", () => {
    expect(traceFrom(GRAPH, "d", "both")).toEqual(new Set(["d", "b", "c", "a", "e"]));
  });

  it("returns just the root when it has no relations", () => {
    expect(traceFrom([m("lonely")], "lonely", "both")).toEqual(new Set(["lonely"]));
  });

  it("returns empty for an unknown id", () => {
    expect(traceFrom(GRAPH, "nope", "both")).toEqual(new Set());
  });

  it("terminates on a cyclic graph", () => {
    const cyclic = [m("x", ["y"]), m("y", ["x"])];
    expect(() => traceFrom(cyclic, "x", "both")).not.toThrow();
    expect(traceFrom(cyclic, "x", "both")).toEqual(new Set(["x", "y"]));
  });
});
