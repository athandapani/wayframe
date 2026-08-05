import { describe, expect, it } from "vitest";
import { parseDocumentFile, documentFileName } from "./document-file";
import { demoRoadmap } from "@/data/demo-roadmap";

describe("parseDocumentFile", () => {
  it("round-trips the demo roadmap without loss", () => {
    const result = parseDocumentFile(JSON.stringify(demoRoadmap));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.milestones).toHaveLength(demoRoadmap.milestones.length);
      expect(result.document.swimlanes).toHaveLength(demoRoadmap.swimlanes.length);
      expect(result.document.programName).toBe(demoRoadmap.programName);
      // durations and dependency edges survive
      const ramp = result.document.milestones.find((m) => m.id === "mfg-6")!;
      expect(ramp.endDate).toBe("2027-07-01");
      expect(ramp.dependsOn).toEqual([{ id: "mfg-5", showConnector: true }]);
    }
  });

  it("rejects non-JSON with a readable message", () => {
    const result = parseDocumentFile("this is not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/valid JSON/);
  });

  it("rejects JSON that isn't a roadmap", () => {
    const result = parseDocumentFile(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/isn't a Wayframe roadmap/);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects a shape-valid file with broken references", () => {
    // A file can pass schema validation and still point at a lane that
    // doesn't exist — loading it would put the chart in a state that throws
    // on render, so integrity is checked before the document is accepted.
    const broken = { ...demoRoadmap, milestones: [{ ...demoRoadmap.milestones[0], laneId: "lane-that-does-not-exist" }] };
    const result = parseDocumentFile(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/broken references/);
      expect(result.issues[0]).toMatch(/lane-that-does-not-exist/);
    }
  });

  it("rejects a dependency pointing at a milestone that isn't in the file", () => {
    const broken = {
      ...demoRoadmap,
      milestones: demoRoadmap.milestones.map((m, i) => (i === 0 ? { ...m, dependsOn: [{ id: "ghost", showConnector: true }] } : m)),
    };
    const result = parseDocumentFile(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((s) => s.includes("ghost"))).toBe(true);
  });
});

describe("documentFileName", () => {
  it("slugifies the program name", () => {
    expect(documentFileName("Atlas Mobile Robot Platform — Launch Program")).toBe("atlas-mobile-robot-platform-launch-program.wayframe.json");
  });

  it("falls back when the name is empty", () => {
    expect(documentFileName("   ")).toBe("roadmap.wayframe.json");
  });
});
