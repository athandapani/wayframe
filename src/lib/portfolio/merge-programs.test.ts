import { describe, expect, it } from "vitest";
import type { Milestone, Portfolio, Program, Swimlane, SwimlaneGroup } from "@/components/timeline/types";
import { mergeForRender } from "@/components/timeline/types";
import { MERGED_ID_SEP, mergeProgramsForAllView, namespaceId, programBandId, programStripGroupIds, splitNamespacedId } from "./merge-programs";

function lane(overrides: Partial<Swimlane> & Pick<Swimlane, "id" | "order">): Swimlane {
  return { type: "lane", name: overrides.id, ...overrides };
}

function milestone(overrides: Partial<Milestone> & Pick<Milestone, "id" | "laneId">): Milestone {
  return {
    title: overrides.id,
    date: "2026-01-01",
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    ...overrides,
  };
}

function program(overrides: Partial<Program> & Pick<Program, "id" | "order">): Program {
  return {
    portfolioId: "portfolio-1",
    programName: overrides.id,
    generatedAt: "2026-01-01T00:00:00.000Z",
    owner: "",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [],
    topLevelItems: [],
    milestones: [],
    ...overrides,
  };
}

describe("namespaceId / splitNamespacedId", () => {
  it("round-trips a plain id", () => {
    const id = namespaceId("program-1", "lane-1");
    expect(splitNamespacedId(id)).toEqual({ programId: "program-1", localId: "lane-1" });
  });

  it("round-trips a local id that itself contains the separator, splitting only on the FIRST occurrence", () => {
    const id = namespaceId("program-1", `lane${MERGED_ID_SEP}1`);
    expect(splitNamespacedId(id)).toEqual({ programId: "program-1", localId: `lane${MERGED_ID_SEP}1` });
  });

  it("returns null for a plain non-namespaced string", () => {
    expect(splitNamespacedId("just-a-plain-id")).toBeNull();
  });
});

describe("mergeProgramsForAllView", () => {
  it("wraps each Program in its own depth-0 band with distinct evenly-spread accentHues, and points every lane's groupId at its own Program's band", () => {
    const p1 = program({
      id: "p1",
      order: 0,
      swimlanes: [lane({ id: "lane-1", order: 0 })],
      milestones: [milestone({ id: "m1", laneId: "lane-1" })],
    });
    const p2 = program({
      id: "p2",
      order: 1,
      swimlanes: [lane({ id: "lane-1", order: 0 })],
      milestones: [milestone({ id: "m1", laneId: "lane-1" })],
    });

    const merged = mergeProgramsForAllView("portfolio-1", [p1, p2]);

    const bands = (merged.swimlaneGroups ?? []).filter((g) => !g.parentGroupId);
    expect(bands).toHaveLength(2);
    const p1Band = bands.find((b) => b.id === namespaceId("p1", "__program__"))!;
    const p2Band = bands.find((b) => b.id === namespaceId("p2", "__program__"))!;
    expect(p1Band).toBeDefined();
    expect(p2Band).toBeDefined();
    expect(p1Band.accentHue).toBe(0);
    expect(p2Band.accentHue).toBe(180);

    const p1Lane = merged.swimlanes.find((sl) => sl.id === namespaceId("p1", "lane-1"))!;
    const p2Lane = merged.swimlanes.find((sl) => sl.id === namespaceId("p2", "lane-1"))!;
    expect(p1Lane.groupId).toBe(p1Band.id);
    expect(p2Lane.groupId).toBe(p2Band.id);
    expect(p1Lane.groupId).not.toBe(p2Lane.groupId);
  });

  it("nests a Program's own real SwimlaneGroup one level deeper under its Program band, and namespaces its member lane's groupId to point at the (now-namespaced) real group", () => {
    const realGroup: SwimlaneGroup = { id: "grp-1", order: 0, name: "Workstream" };
    const p1 = program({
      id: "p1",
      order: 0,
      swimlaneGroups: [realGroup],
      swimlanes: [lane({ id: "lane-1", order: 0, groupId: "grp-1" })],
    });

    const merged = mergeProgramsForAllView("portfolio-1", [p1]);

    const programBandId = namespaceId("p1", "__program__");
    const nestedGroup = (merged.swimlaneGroups ?? []).find((g) => g.id === namespaceId("p1", "grp-1"))!;
    expect(nestedGroup).toBeDefined();
    expect(nestedGroup.parentGroupId).toBe(programBandId);

    const memberLane = merged.swimlanes.find((sl) => sl.id === namespaceId("p1", "lane-1"))!;
    expect(memberLane.groupId).toBe(nestedGroup.id);
    expect(memberLane.groupId).not.toBe(programBandId);
  });

  it("namespaces a milestone's dependsOn and linksToTopLevelMilestone within the same Program, and keeps two Programs' identically-named milestones distinct", () => {
    const p1 = program({
      id: "p1",
      order: 0,
      swimlanes: [lane({ id: "lane-1", order: 0 })],
      topLevelItems: [{ id: "top-1", type: "milestone", title: "Top", date: "2026-01-01", status: "not-started" }],
      milestones: [
        milestone({ id: "m1", laneId: "lane-1" }),
        milestone({ id: "m2", laneId: "lane-1", dependsOn: [{ id: "m1", showConnector: true }], linksToTopLevelMilestone: "top-1" }),
      ],
    });
    const p2 = program({
      id: "p2",
      order: 1,
      swimlanes: [lane({ id: "lane-1", order: 0 })],
      milestones: [milestone({ id: "m1", laneId: "lane-1" })],
    });

    const merged = mergeProgramsForAllView("portfolio-1", [p1, p2]);

    const p1m1 = namespaceId("p1", "m1");
    const p1m2 = namespaceId("p1", "m2");
    const p2m1 = namespaceId("p2", "m1");

    expect(merged.milestones.map((m) => m.id)).toEqual(expect.arrayContaining([p1m1, p1m2, p2m1]));
    // Distinct ids — p1's "m1" and p2's "m1" never collided/overwrote each other.
    expect(new Set(merged.milestones.map((m) => m.id)).size).toBe(3);

    const m2 = merged.milestones.find((m) => m.id === p1m2)!;
    expect(m2.dependsOn).toEqual([{ id: p1m1, showConnector: true }]);
    expect(m2.linksToTopLevelMilestone).toBe(namespaceId("p1", "top-1"));
  });

  it("leaves a milestone's categoryId untouched (Portfolio-level FK, not namespaced)", () => {
    const p1 = program({
      id: "p1",
      order: 0,
      swimlanes: [lane({ id: "lane-1", order: 0 })],
      milestones: [milestone({ id: "m1", laneId: "lane-1", categoryId: "cat-1" })],
    });
    const merged = mergeProgramsForAllView("portfolio-1", [p1]);
    expect(merged.milestones[0].categoryId).toBe("cat-1");
  });

  it("sets the pseudo-Program's own top-level fields as documented", () => {
    const p1 = program({ id: "p1", order: 0 });
    const merged = mergeProgramsForAllView("portfolio-1", [p1]);
    expect(merged.portfolioId).toBe("portfolio-1");
    expect(merged.order).toBe(0);
    expect(merged.programName).toBe("All Programs");
    expect(merged.id).toBe("merged:portfolio-1");
  });

  it("concatenates Programs in `order` order regardless of input array order", () => {
    const p1 = program({ id: "p1", order: 1 });
    const p2 = program({ id: "p2", order: 0 });
    const merged = mergeProgramsForAllView("portfolio-1", [p1, p2]);
    const bandIds = (merged.swimlaneGroups ?? []).filter((g) => !g.parentGroupId).map((g) => g.id);
    expect(bandIds).toEqual([namespaceId("p2", "__program__"), namespaceId("p1", "__program__")]);
  });

  it("feeds cleanly through mergeForRender — a smoke test that the result type-checks and critical-path resolution doesn't crash", () => {
    const p1 = program({
      id: "p1",
      order: 0,
      swimlanes: [lane({ id: "lane-1", order: 0 })],
      milestones: [
        milestone({ id: "m1", laneId: "lane-1", date: "2026-01-01" }),
        milestone({ id: "m2", laneId: "lane-1", date: "2026-06-01", dependsOn: [{ id: "m1", showConnector: true }] }),
      ],
    });
    const merged = mergeProgramsForAllView("portfolio-1", [p1]);
    const portfolio: Portfolio = { id: "portfolio-1", schemaVersion: 4 };
    const renderable = mergeForRender(portfolio, merged);
    expect(renderable.milestones).toHaveLength(2);
    expect(renderable.milestones.every((m) => typeof m.isCriticalPath === "boolean")).toBe(true);
  });
});

describe("programStripGroupIds (wayframe#152)", () => {
  it("maps every merged top-level item to its own Program's band, so no two Programs share a strip", () => {
    const p1 = program({
      id: "p1",
      order: 0,
      topLevelItems: [{ id: "phase-1", type: "phase", title: "P1 Phase", startDate: "2026-01-01", endDate: "2026-03-01", status: "on-track" }],
    });
    const p2 = program({
      id: "p2",
      order: 1,
      topLevelItems: [{ id: "phase-1", type: "phase", title: "P2 Phase", startDate: "2026-01-01", endDate: "2026-03-01", status: "on-track" }],
    });
    const merged = mergeProgramsForAllView("portfolio-1", [p1, p2]);
    const strips = programStripGroupIds(merged);
    // Both Programs named their phase "phase-1" locally (t14: ids are only
    // unique within one Program) — the merge namespaced them apart, and each
    // lands on its own Program's band, not one shared strip.
    expect(strips.get(namespaceId("p1", "phase-1"))).toBe(programBandId("p1"));
    expect(strips.get(namespaceId("p2", "phase-1"))).toBe(programBandId("p2"));
    expect(new Set(strips.values()).size).toBe(2);
  });

  it("leaves an id that was never namespaced out entirely — the render layer keeps it in the shared top band", () => {
    const strips = programStripGroupIds({
      topLevelItems: [{ id: "unnamespaced", type: "milestone", title: "Loose", date: "2026-01-01", status: "on-track" }],
    });
    expect(strips.size).toBe(0);
  });
});
