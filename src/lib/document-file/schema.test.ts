import { describe, expect, it } from "vitest";
import { validateRoadmapDocument, CURRENT_SCHEMA_VERSION } from "./schema";
import { demoRoadmap } from "@/data/demo-roadmap";

describe("validateRoadmapDocument", () => {
  it("accepts the demo roadmap as-is", () => {
    const result = validateRoadmapDocument(demoRoadmap);
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown top-level key instead of silently stripping it (.strict())", () => {
    const result = validateRoadmapDocument({ ...demoRoadmap, notAField: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((s) => s.includes("notAField"))).toBe(true);
  });

  it("rejects an unknown key on a nested object (.strict() applies recursively)", () => {
    const withExtra = { ...demoRoadmap, swimlanes: demoRoadmap.swimlanes.map((l, i) => (i === 0 ? { ...l, notAField: true } : l)) };
    const result = validateRoadmapDocument(withExtra);
    expect(result.ok).toBe(false);
  });

  it("rejects a document missing owner (was silently optional pre-t1)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { owner: _owner, ...rest } = demoRoadmap;
    const result = validateRoadmapDocument(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((s) => s.includes("owner"))).toBe(true);
  });

  it("rejects actionItems that aren't shaped like ActionItem (was z.unknown() pre-t1)", () => {
    const result = validateRoadmapDocument({ ...demoRoadmap, actionItems: [{ notAnActionItem: true }] });
    expect(result.ok).toBe(false);
  });

  it("rejects an annotation missing message (was silently optional pre-t1)", () => {
    const withAnnotation = {
      ...demoRoadmap,
      topLevelItems: [...demoRoadmap.topLevelItems, { id: "ann-1", type: "annotation" as const, title: "Note", date: "2027-01-01" }],
    };
    const result = validateRoadmapDocument(withAnnotation);
    expect(result.ok).toBe(false);
  });

  it("migrates a legacy schemaVersion string up to the current integer version", () => {
    const legacy = { ...demoRoadmap, schemaVersion: "1.0" };
    const result = validateRoadmapDocument(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("migrates a document with no schemaVersion field at all", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { schemaVersion: _schemaVersion, ...legacy } = demoRoadmap;
    const result = validateRoadmapDocument(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("still catches broken references after migration", () => {
    const legacy = {
      ...demoRoadmap,
      schemaVersion: "1.0",
      milestones: [{ ...demoRoadmap.milestones[0], laneId: "lane-that-does-not-exist" }],
    };
    const result = validateRoadmapDocument(legacy);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/broken references/);
  });
});
