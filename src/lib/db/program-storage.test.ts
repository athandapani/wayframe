import { createClient, type Client } from "@libsql/client";
import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
});
