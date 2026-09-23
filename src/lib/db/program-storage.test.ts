import { createClient, type Client } from "@libsql/client";
import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoRoadmap } from "@/data/demo-roadmap";

let testClient: Client;

vi.mock("./client", () => ({
  getDbClient: () => testClient,
}));

// Fresh in-memory libSQL client per test (wayframe#t12) — `ensureSchema`
// memoizes per-Client instance, so a new client each test also gets a
// clean bootstrap for free, no manual schema reset needed.
beforeEach(() => {
  testClient = createClient({ url: ":memory:" });
});

afterEach(() => {
  testClient.close();
});

function encodeText(doc: Y.Doc, value: string): Uint8Array {
  const before = Y.encodeStateVector(doc);
  const text = doc.getText("body");
  text.insert(text.length, value);
  return Y.encodeStateAsUpdate(doc, before);
}

describe("program-storage", () => {
  it("getProgramSnapshot returns null before any row exists", async () => {
    const { getProgramSnapshot } = await import("./program-storage");
    expect(await getProgramSnapshot("p1")).toBeNull();
  });

  it("appendProgramUpdate never writes to the programs table", async () => {
    const { appendProgramUpdate, getProgramSnapshot, listProgramSnapshotsForPortfolio } = await import("./program-storage");
    const doc = new Y.Doc();
    await appendProgramUpdate("p1", encodeText(doc, "hello"));

    expect(await getProgramSnapshot("p1")).toBeNull();
    expect(await listProgramSnapshotsForPortfolio("portfolio-1")).toEqual([]);
  });

  it("compactProgram merges pending updates into a fresh snapshot and clears the log", async () => {
    const { appendProgramUpdate, compactProgram, getProgramSnapshot } = await import("./program-storage");
    const doc = new Y.Doc();
    await appendProgramUpdate("p1", encodeText(doc, "hello "));
    await appendProgramUpdate("p1", encodeText(doc, "world"));

    await compactProgram("p1", "portfolio-1");

    const snapshot = await getProgramSnapshot("p1");
    expect(snapshot).not.toBeNull();
    const merged = new Y.Doc();
    Y.applyUpdate(merged, snapshot!);
    expect(merged.getText("body").toString()).toBe("hello world");

    // Log should be cleared — a second compaction with nothing pending no-ops.
    const rowsAfter = await testClient.execute("SELECT * FROM program_updates WHERE program_id = 'p1'");
    expect(rowsAfter.rows.length).toBe(0);
  });

  it("compactProgram merges onto an existing snapshot rather than replacing it", async () => {
    const { appendProgramUpdate, compactProgram, getProgramSnapshot } = await import("./program-storage");
    const doc = new Y.Doc();
    await appendProgramUpdate("p1", encodeText(doc, "hello "));
    await compactProgram("p1", "portfolio-1");

    await appendProgramUpdate("p1", encodeText(doc, "world"));
    await compactProgram("p1", "portfolio-1");

    const snapshot = await getProgramSnapshot("p1");
    const merged = new Y.Doc();
    Y.applyUpdate(merged, snapshot!);
    expect(merged.getText("body").toString()).toBe("hello world");
  });

  it("compactProgram bumps rev on every compaction", async () => {
    const { appendProgramUpdate, compactProgram, listProgramSnapshotsForPortfolio } = await import("./program-storage");
    const doc = new Y.Doc();
    await appendProgramUpdate("p1", encodeText(doc, "a"));
    await compactProgram("p1", "portfolio-1");
    await appendProgramUpdate("p1", encodeText(doc, "b"));
    await compactProgram("p1", "portfolio-1");

    const [row] = await listProgramSnapshotsForPortfolio("portfolio-1");
    expect(row.rev).toBe(2);
  });

  it("compactProgram no-ops when there is nothing pending", async () => {
    const { compactProgram, listProgramSnapshotsForPortfolio } = await import("./program-storage");
    await compactProgram("p1", "portfolio-1");
    expect(await listProgramSnapshotsForPortfolio("portfolio-1")).toEqual([]);
  });

  it("listProgramSnapshotsForPortfolio only returns rows for the requested portfolio, and never reads program_updates", async () => {
    const { appendProgramUpdate, compactProgram, listProgramSnapshotsForPortfolio } = await import("./program-storage");
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    await appendProgramUpdate("pA", encodeText(docA, "a"));
    await appendProgramUpdate("pB", encodeText(docB, "b"));
    await compactProgram("pA", "portfolio-1");
    await compactProgram("pB", "portfolio-2");

    const rows = await listProgramSnapshotsForPortfolio("portfolio-1");
    expect(rows.map((r) => r.id)).toEqual(["pA"]);
  });

  it("createProgramFromData (wayframe#t17) seeds a snapshot that round-trips the whole Program object via the field-level bridge (program-ydoc.ts, t38)", async () => {
    const { createProgramFromData, getProgramSnapshot } = await import("./program-storage");
    const { readProgramFromDoc } = await import("@/lib/realtime/program-ydoc");
    const program = { ...demoRoadmap, id: "prog-migrated", portfolioId: "portfolio-1" };
    await createProgramFromData(program);

    const snapshot = await getProgramSnapshot("prog-migrated");
    expect(snapshot).not.toBeNull();
    const doc = new Y.Doc();
    Y.applyUpdate(doc, snapshot!);
    expect(readProgramFromDoc(doc)).toEqual(program);
  });

  it("createProgramFromData rows are visible to the All-Programs read path", async () => {
    const { createProgramFromData, listProgramSnapshotsForPortfolio } = await import("./program-storage");
    const program = { ...demoRoadmap, id: "prog-migrated", portfolioId: "portfolio-1" };
    await createProgramFromData(program);

    const [row] = await listProgramSnapshotsForPortfolio("portfolio-1");
    expect(row.id).toBe("prog-migrated");
    expect(row.rev).toBe(1);
  });

  it("decodeProgramSnapshot round-trips createProgramFromData's own encoding", async () => {
    const { createProgramFromData, getProgramSnapshot, decodeProgramSnapshot } = await import("./program-storage");
    const program = { ...demoRoadmap, id: "prog-migrated", portfolioId: "portfolio-1" };
    await createProgramFromData(program);

    const snapshot = await getProgramSnapshot("prog-migrated");
    expect(decodeProgramSnapshot(snapshot!)).toEqual(program);
  });

  it("loadLiveProgramsForPortfolio (wayframe#128) sees a pending Yjs update the compacted snapshot row doesn't", async () => {
    const { createProgramFromData, loadLiveProgramsForPortfolio, appendProgramUpdate, decodeProgramSnapshot, getProgramSnapshot } = await import("./program-storage");
    const { applyProgramPatch } = await import("@/lib/realtime/program-ydoc");
    const program = { ...demoRoadmap, id: "prog-1", portfolioId: "portfolio-1", order: 0 };
    await createProgramFromData(program);

    // An edit that only ever reached `program_updates` — exactly the state a
    // connected room leaves behind between compactions. The whole reason
    // Version History reads through this function rather than the cheap
    // All-Programs path is that the cheap path cannot see this yet.
    const doc = new Y.Doc();
    Y.applyUpdate(doc, (await getProgramSnapshot("prog-1"))!);
    const before = Y.encodeStateVector(doc);
    applyProgramPatch(doc, program, { ...program, programName: "Renamed live" });
    await appendProgramUpdate("prog-1", Y.encodeStateAsUpdate(doc, before));

    expect(decodeProgramSnapshot((await getProgramSnapshot("prog-1"))!)?.programName).toBe(program.programName);
    const live = await loadLiveProgramsForPortfolio("portfolio-1");
    expect(live.map((p) => p.programName)).toEqual(["Renamed live"]);
  });

  it("loadLiveProgramsForPortfolio is scoped to one Portfolio and ordered by Program order", async () => {
    const { createProgramFromData, loadLiveProgramsForPortfolio } = await import("./program-storage");
    await createProgramFromData({ ...demoRoadmap, id: "prog-second", portfolioId: "portfolio-1", order: 1 });
    await createProgramFromData({ ...demoRoadmap, id: "prog-first", portfolioId: "portfolio-1", order: 0 });
    await createProgramFromData({ ...demoRoadmap, id: "prog-elsewhere", portfolioId: "portfolio-2", order: 0 });

    expect((await loadLiveProgramsForPortfolio("portfolio-1")).map((p) => p.id)).toEqual(["prog-first", "prog-second"]);
    expect(await loadLiveProgramsForPortfolio("portfolio-3")).toEqual([]);
  });

  it("decodeProgramSnapshot returns null for an empty/garbage snapshot", async () => {
    const { decodeProgramSnapshot } = await import("./program-storage");
    const emptyDoc = new Y.Doc();
    expect(decodeProgramSnapshot(Y.encodeStateAsUpdate(emptyDoc))).toBeNull();
    expect(decodeProgramSnapshot(new Uint8Array())).toBeNull();
  });
});
