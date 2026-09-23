import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Program } from "@/components/timeline/types";

let testClient: Client;

vi.mock("./client", () => ({
  getDbClient: () => testClient,
}));

beforeEach(() => {
  testClient = createClient({ url: ":memory:" });
});

afterEach(() => {
  testClient.close();
});

function fakeProgram(id: string, milestoneCount: number, order = 0): Program {
  return {
    id,
    portfolioId: "p1",
    order,
    programName: `Program ${id}`,
    generatedAt: "2026-01-02T00:00:00.000Z",
    owner: "Priya N.",
    bluf: { statement: "", bullets: [] },
    actionItems: [],
    swimlanes: [{ id: `${id}-lane`, order: 0, type: "lane", name: "Delivery" }],
    topLevelItems: [],
    milestones: Array.from({ length: milestoneCount }, (_, i) => ({
      id: `${id}-m${i}`,
      laneId: `${id}-lane`,
      title: `Milestone ${i}`,
      date: "2026-03-01",
      status: "on-track" as const,
      dependsOn: [],
      linksToTopLevelMilestone: null,
    })),
  };
}

describe("versions (wayframe#128)", () => {
  it("createVersion + listVersions round-trips summary fields without shipping the Program documents", async () => {
    const { createVersion, listVersions } = await import("./versions");
    const id = await createVersion("p1", "user-1", "Priya N.", [fakeProgram("a", 3), fakeProgram("b", 2, 1)]);

    const list = await listVersions("p1");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].creatorIdentity).toBe("user-1");
    expect(list[0].creatorName).toBe("Priya N.");
    expect(list[0].label).toBeNull();
    // Denormalized at write time so the list's "what changed" line needs no diff.
    expect(list[0].programCount).toBe(2);
    expect(list[0].milestoneCount).toBe(5);
    expect(list[0]).not.toHaveProperty("programs");
  });

  it("listVersions orders newest first, and still does so for two saves in the same millisecond", async () => {
    const { createVersion, listVersions } = await import("./versions");
    const first = await createVersion("p1", "user-1", null, [fakeProgram("a", 1)]);
    const second = await createVersion("p1", "user-1", null, [fakeProgram("a", 1)]);
    const third = await createVersion("p1", "user-1", null, [fakeProgram("a", 1)]);

    expect((await listVersions("p1")).map((v) => v.id)).toEqual([third, second, first]);
  });

  it("getVersion returns the full Program documents, round-tripped intact", async () => {
    const { createVersion, getVersion } = await import("./versions");
    const programs = [fakeProgram("a", 2), fakeProgram("b", 1, 1)];
    const id = await createVersion("p1", "user-1", "Priya N.", programs, "Before the replan");

    const version = await getVersion("p1", id);
    expect(version?.label).toBe("Before the replan");
    expect(version?.programs).toEqual(programs);
  });

  it("getVersion won't hand one Roadmap's Version to another Roadmap's member", async () => {
    const { createVersion, getVersion } = await import("./versions");
    const id = await createVersion("p1", "user-1", null, [fakeProgram("a", 1)]);
    expect(await getVersion("someone-elses-roadmap", id)).toBeNull();
  });

  it("getVersion returns null for a nonexistent id", async () => {
    const { getVersion } = await import("./versions");
    expect(await getVersion("p1", "no-such-id")).toBeNull();
  });

  it("listVersions is scoped to one Roadmap", async () => {
    const { createVersion, listVersions } = await import("./versions");
    await createVersion("p1", "user-1", null, [fakeProgram("a", 1)]);
    await createVersion("p2", "user-1", null, [fakeProgram("b", 1)]);
    expect(await listVersions("p1")).toHaveLength(1);
  });

  it("renameVersion changes the label and nothing else — a Version's content stays immutable", async () => {
    const { createVersion, getVersion, renameVersion } = await import("./versions");
    const programs = [fakeProgram("a", 2)];
    const id = await createVersion("p1", "user-1", null, programs);

    expect(await renameVersion("p1", id, "Board review")).toBe(true);
    const renamed = await getVersion("p1", id);
    expect(renamed?.label).toBe("Board review");
    expect(renamed?.programs).toEqual(programs);
    expect(renamed?.createdAt).toBe((await getVersion("p1", id))!.createdAt);
  });

  it("renameVersion clears the label when given null", async () => {
    const { createVersion, getVersion, renameVersion } = await import("./versions");
    const id = await createVersion("p1", "user-1", null, [fakeProgram("a", 1)], "Named at save time");
    await renameVersion("p1", id, null);
    expect((await getVersion("p1", id))?.label).toBeNull();
  });

  it("renameVersion reports false for a mismatched Roadmap or unknown id, so a route can 404", async () => {
    const { createVersion, renameVersion } = await import("./versions");
    const id = await createVersion("p1", "user-1", null, [fakeProgram("a", 1)]);
    expect(await renameVersion("someone-elses-roadmap", id, "Nope")).toBe(false);
    expect(await renameVersion("p1", "no-such-id", "Nope")).toBe(false);
  });
});
