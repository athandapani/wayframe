import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Slide } from "@/lib/export/deck-ir";
import type { SerializedExportSelection } from "./snapshots";

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

function fakeSelection(overrides: Partial<SerializedExportSelection> = {}): SerializedExportSelection {
  return {
    executive: true,
    combinedBaseline: false,
    individualBaseline: false,
    individualBaselineProgramIds: [],
    scenarioId: null,
    scenarioCombined: false,
    scenarioProgram: false,
    scenarioProgramProgramIds: [],
    ...overrides,
  };
}

function fakeSlides(): Slide[] {
  return [[{ id: "shape-1", kind: "rect", x: 0, y: 0, w: 1, h: 1, fill: "#2563eb" }]];
}

describe("snapshots (wayframe#t31)", () => {
  it("createSnapshot + listSnapshots round-trips summary fields without leaking slides", async () => {
    const { createSnapshot, listSnapshots } = await import("./snapshots");
    const selection = fakeSelection({ individualBaselineProgramIds: ["prog-1", "prog-2"] });
    const id = await createSnapshot("p1", "user-1", selection, fakeSlides());

    const list = await listSnapshots("p1");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].creatorIdentity).toBe("user-1");
    expect(list[0].selection).toEqual(selection);
    expect(list[0]).not.toHaveProperty("slides");
  });

  it("listSnapshots orders newest first", async () => {
    const { createSnapshot, listSnapshots } = await import("./snapshots");
    const first = await createSnapshot("p1", "user-1", fakeSelection(), fakeSlides());
    await new Promise((r) => setTimeout(r, 5));
    const second = await createSnapshot("p1", "user-1", fakeSelection(), fakeSlides());

    const list = await listSnapshots("p1");
    expect(list.map((s) => s.id)).toEqual([second, first]);
  });

  it("getSnapshot returns the full row including slides, round-tripped correctly", async () => {
    const { createSnapshot, getSnapshot } = await import("./snapshots");
    const selection = fakeSelection({ scenarioCombined: true, scenarioId: "scenario-1" });
    const slides = fakeSlides();
    const id = await createSnapshot("p1", "user-1", selection, slides);

    const snapshot = await getSnapshot("p1", id);
    expect(snapshot?.selection).toEqual(selection);
    expect(snapshot?.slides).toEqual(slides);
    expect(snapshot?.creatorIdentity).toBe("user-1");
  });

  it("getSnapshot returns null for a mismatched portfolio id", async () => {
    const { createSnapshot, getSnapshot } = await import("./snapshots");
    const id = await createSnapshot("p1", "user-1", fakeSelection(), fakeSlides());
    expect(await getSnapshot("someone-elses-portfolio", id)).toBeNull();
  });

  it("getSnapshot returns null for a nonexistent id", async () => {
    const { getSnapshot } = await import("./snapshots");
    expect(await getSnapshot("p1", "no-such-id")).toBeNull();
  });
});
