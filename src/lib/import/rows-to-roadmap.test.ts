import { describe, expect, it } from "vitest";
import { guessColumnMapping, rowsToRoadmap, type ColumnMapping, type NewMilestone } from "./rows-to-roadmap";
import type { Program } from "@/components/timeline/types";

function baseData(): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: "lane-1", order: 0, type: "lane", name: "Engineering" }],
    topLevelItems: [],
    milestones: [
      {
        id: "m1",
        laneId: "lane-1",
        title: "Kickoff",
        date: "2026-01-01",
        status: "not-started",
        dependsOn: [],
        linksToTopLevelMilestone: null,
      },
    ],
  };
}

function idGen() {
  let n = 0;
  return () => `new-${n++}`;
}

describe("guessColumnMapping", () => {
  it("matches common header synonyms case-insensitively", () => {
    const mapping = guessColumnMapping(["Task", "Lane", "Due Date", "Status", "Owner"]);
    expect(mapping.title).toBe("Task");
    expect(mapping.lane).toBe("Lane");
    expect(mapping.date).toBe("Due Date");
    expect(mapping.status).toBe("Status");
    expect(mapping.owner).toBe("Owner");
  });

  it("leaves unmatched fields null", () => {
    const mapping = guessColumnMapping(["Random Column"]);
    expect(mapping.title).toBeNull();
    expect(mapping.date).toBeNull();
  });
});

describe("rowsToRoadmap", () => {
  const mapping: ColumnMapping = { title: "Task", lane: "Lane", date: "Date", endDate: null, status: "Status", owner: "Owner", percentComplete: null, comment: null };

  it("skips everything and reports a reason when title or date isn't mapped", () => {
    const result = rowsToRoadmap(baseData(), [{ Task: "X" }], { ...mapping, date: null });
    expect(result.adds).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/Title and Date/);
  });

  it("adds a new milestone in an existing lane", () => {
    const result = rowsToRoadmap(baseData(), [{ Task: "Design Review", Lane: "Engineering", Date: "2026-03-01", Status: "on-track", Owner: "A" }], mapping, idGen());
    expect(result.adds).toHaveLength(1);
    expect(result.adds[0]).toMatchObject({ title: "Design Review", laneId: "lane-1", date: "2026-03-01", status: "on-track", owner: "A" });
    expect(result.newLaneNames).toHaveLength(0);
  });

  it("flags a not-yet-existing lane once, even across multiple rows", () => {
    const rows = [
      { Task: "A", Lane: "Manufacturing", Date: "2026-02-01" },
      { Task: "B", Lane: "Manufacturing", Date: "2026-02-15" },
    ];
    const result = rowsToRoadmap(baseData(), rows, mapping, idGen());
    expect(result.newLaneNames).toEqual(["Manufacturing"]);
    expect(result.adds).toHaveLength(2);
    expect(result.adds[0].laneId).toBe("");
  });

  it("matches an existing milestone by (title, lane) and only diffs changed fields", () => {
    const result = rowsToRoadmap(baseData(), [{ Task: "Kickoff", Lane: "Engineering", Date: "2026-01-05", Status: "not-started" }], mapping);
    expect(result.adds).toHaveLength(0);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toMatchObject({ id: "m1", patch: { date: "2026-01-05" } });
    expect(result.updates[0].patch.status).toBeUndefined();
  });

  it("produces no update when every mapped field already matches", () => {
    const result = rowsToRoadmap(baseData(), [{ Task: "Kickoff", Lane: "Engineering", Date: "2026-01-01", Status: "not-started" }], mapping);
    expect(result.adds).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it("skips a row with an unparseable date", () => {
    const result = rowsToRoadmap(baseData(), [{ Task: "X", Date: "not-a-date" }], mapping);
    expect(result.adds).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/no parseable date/);
  });

  // wayframe#t39: the "target a brand-new Program" case (sibling to #t35's
  // AI-extraction path) matches every row against an empty seed document
  // instead of a live one — nothing to update against, so every row must
  // fall through to `adds`.
  it("against an empty seed document, every row becomes an add with no updates", () => {
    const empty: Program = {
      id: "",
      portfolioId: "",
      order: 0,
      programName: "",
      generatedAt: "",
      owner: "",
      bluf: { statement: "", bullets: [] },
      actionItems: [],
      swimlanes: [],
      topLevelItems: [],
      milestones: [],
    };
    const rows = [
      { Task: "Kickoff", Lane: "Engineering", Date: "2026-01-01" },
      { Task: "Design Review", Lane: "Engineering", Date: "2026-03-01" },
    ];
    const result = rowsToRoadmap(empty, rows, mapping, idGen());
    expect(result.updates).toHaveLength(0);
    expect(result.adds).toHaveLength(2);
    expect(result.newLaneNames).toEqual(["Engineering"]);
    expect(result.adds.every((m) => (m as NewMilestone).__newLaneName === "Engineering")).toBe(true);
  });
});
