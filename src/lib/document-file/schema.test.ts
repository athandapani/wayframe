import { describe, expect, it } from "vitest";
import { validatePortfolioDocument, CURRENT_SCHEMA_VERSION } from "./schema";
import { demoPortfolio, demoRoadmap } from "@/data/demo-roadmap";
import type { PortfolioDocument } from "@/components/timeline/types";

const demoDocument: PortfolioDocument = { portfolio: demoPortfolio, programs: [demoRoadmap] };

/** A pre-t11 flat document — schemaVersion/companyLogo/legendCategories inline, no id/portfolioId/order — for exercising the migration ladder. */
function legacyFlatDocument(schemaVersion: unknown): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, portfolioId: _portfolioId, order: _order, ...rest } = demoRoadmap;
  return { ...rest, schemaVersion };
}

describe("validatePortfolioDocument", () => {
  it("accepts the demo document as-is", () => {
    const result = validatePortfolioDocument(demoDocument);
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown top-level key instead of silently stripping it (.strict())", () => {
    const result = validatePortfolioDocument({ ...demoDocument, notAField: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((s) => s.includes("notAField"))).toBe(true);
  });

  it("rejects an unknown key on a nested Program object (.strict() applies recursively)", () => {
    const withExtra: PortfolioDocument = {
      ...demoDocument,
      programs: [{ ...demoRoadmap, swimlanes: demoRoadmap.swimlanes.map((l, i) => (i === 0 ? { ...l, notAField: true } : l)) }],
    };
    const result = validatePortfolioDocument(withExtra);
    expect(result.ok).toBe(false);
  });

  it("rejects a Program missing owner (was silently optional pre-t1)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { owner: _owner, ...rest } = demoRoadmap;
    const result = validatePortfolioDocument({ ...demoDocument, programs: [rest] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((s) => s.includes("owner"))).toBe(true);
  });

  it("rejects actionItems that aren't shaped like ActionItem (was z.unknown() pre-t1)", () => {
    const result = validatePortfolioDocument({ ...demoDocument, programs: [{ ...demoRoadmap, actionItems: [{ notAnActionItem: true }] }] });
    expect(result.ok).toBe(false);
  });

  it("rejects an annotation missing message (was silently optional pre-t1)", () => {
    const withAnnotation = {
      ...demoDocument,
      programs: [
        { ...demoRoadmap, topLevelItems: [...demoRoadmap.topLevelItems, { id: "ann-1", type: "annotation" as const, title: "Note", date: "2027-01-01" }] },
      ],
    };
    const result = validatePortfolioDocument(withAnnotation);
    expect(result.ok).toBe(false);
  });

  it("accepts a Portfolio with no theme field at all (wayframe#88/t18 — optional, like companyLogo/legendCategories)", () => {
    const result = validatePortfolioDocument(demoDocument);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.portfolio.theme).toBeUndefined();
  });

  it("accepts a Portfolio theme with a base id and a sparse override map (wayframe#88/t18)", () => {
    const withTheme: PortfolioDocument = {
      ...demoDocument,
      portfolio: { ...demoPortfolio, theme: { baseId: "graphite", overrides: { accent: "#0bb0a8", laneRamp: { L: 0.6, C: 0.14, startHue: 10 } } } },
    };
    const result = validatePortfolioDocument(withTheme);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.portfolio.theme).toEqual({ baseId: "graphite", overrides: { accent: "#0bb0a8", laneRamp: { L: 0.6, C: 0.14, startHue: 10 } } });
  });

  it("rejects an unrecognized theme base id", () => {
    const withTheme: PortfolioDocument = { ...demoDocument, portfolio: { ...demoPortfolio, theme: { baseId: "neon" as never } } };
    const result = validatePortfolioDocument(withTheme);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown key inside theme.overrides (.strict() applies recursively)", () => {
    const withTheme: PortfolioDocument = {
      ...demoDocument,
      portfolio: { ...demoPortfolio, theme: { baseId: "blueprint", overrides: { notAThemeField: true } as never } },
    };
    const result = validatePortfolioDocument(withTheme);
    expect(result.ok).toBe(false);
  });

  it("rejects a Program whose portfolioId doesn't match its Portfolio (wayframe t11)", () => {
    const result = validatePortfolioDocument({ ...demoDocument, programs: [{ ...demoRoadmap, portfolioId: "some-other-portfolio" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/broken references/);
  });

  it("rejects a categoryId that isn't in the Portfolio's legendCategories (wayframe t11 — moved off Program)", () => {
    const withCategory: PortfolioDocument = {
      portfolio: { ...demoPortfolio, legendCategories: [{ id: "cat-1", name: "Regulatory", color: "#000" }] },
      programs: [{ ...demoRoadmap, milestones: demoRoadmap.milestones.map((m, i) => (i === 0 ? { ...m, categoryId: "cat-missing" } : m)) }],
    };
    const result = validatePortfolioDocument(withCategory);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/broken references/);
  });

  it("migrates a legacy schemaVersion:1 flat document into a Portfolio+Program envelope", () => {
    const result = validatePortfolioDocument(legacyFlatDocument(1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.portfolio.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.document.programs).toHaveLength(1);
      expect(result.document.programs[0].programName).toBe(demoRoadmap.programName);
      expect(result.document.programs[0].portfolioId).toBe(result.document.portfolio.id);
    }
  });

  it("migrates a legacy schemaVersion string ('1.0') all the way to the current envelope", () => {
    const result = validatePortfolioDocument(legacyFlatDocument("1.0"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.portfolio.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("migrates a flat document with no schemaVersion field at all", () => {
    const flat = legacyFlatDocument(undefined);
    delete flat.schemaVersion;
    const result = validatePortfolioDocument(flat);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.portfolio.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("carries a legacy flat document's companyLogo/legendCategories up onto the new Portfolio", () => {
    const flat = legacyFlatDocument(1);
    flat.companyLogo = { dataUrl: "data:image/png;base64,x" };
    flat.legendCategories = [{ id: "cat-1", name: "Regulatory", color: "#000" }];
    const result = validatePortfolioDocument(flat);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.portfolio.companyLogo).toEqual({ dataUrl: "data:image/png;base64,x" });
      expect(result.document.portfolio.legendCategories).toEqual([{ id: "cat-1", name: "Regulatory", color: "#000" }]);
    }
  });

  it("still catches broken references after migration", () => {
    const flat = legacyFlatDocument("1.0");
    flat.milestones = [{ ...demoRoadmap.milestones[0], laneId: "lane-that-does-not-exist" }];
    const result = validatePortfolioDocument(flat);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/broken references/);
  });

  it("migrates a v2 document's isCriticalPath removal and rollupHistory array->record shape (t14, wayframe#89)", () => {
    const v2Document = {
      portfolio: { ...demoPortfolio, schemaVersion: 2 },
      programs: [
        {
          ...demoRoadmap,
          milestones: [{ ...demoRoadmap.milestones[0], isCriticalPath: true }],
          // Attached to swimlanes[1] (a "lane" row), not swimlanes[0] (a
          // "separator" row) — since t21's later v3->v4 migration step
          // (which now also runs, since CURRENT_SCHEMA_VERSION has advanced
          // past 3) strips separator rows into SwimlaneGroups, which don't
          // carry rollupHistory. This test is only exercising the v2->v3
          // array->record conversion, so it needs a swimlane that survives
          // every later step too.
          swimlanes: [
            demoRoadmap.swimlanes[0],
            {
              ...demoRoadmap.swimlanes[1],
              rollupHistory: [{ date: "2026-06-09", rag: "amber", atRiskCount: 1, delayedCount: 0 }],
            },
            ...demoRoadmap.swimlanes.slice(2),
          ],
        },
      ],
    };

    const result = validatePortfolioDocument(v2Document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.portfolio.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const migratedMilestone = result.document.programs[0].milestones[0] as unknown as Record<string, unknown>;
    expect(migratedMilestone.isCriticalPath).toBeUndefined();
    const migratedLane = result.document.programs[0].swimlanes.find((l) => l.id === demoRoadmap.swimlanes[1].id)!;
    expect(migratedLane.rollupHistory).toEqual({
      "2026-06-09": { rag: "amber", atRiskCount: 1, delayedCount: 0 },
    });
  });

  it("migrates a v3 document's separator rows into SwimlaneGroups, writing each member lane's groupId (t21, wayframe#100)", () => {
    const v3Document = {
      portfolio: { ...demoPortfolio, schemaVersion: 3 },
      programs: [
        {
          ...demoRoadmap,
          milestones: [],
          swimlanes: [
            { id: "s1", type: "separator", order: 0, name: "Group A" },
            { id: "l1", type: "lane", order: 1, name: "Lane 1" },
            { id: "l2", type: "lane", order: 2, name: "Lane 2" },
            { id: "s2", type: "separator", order: 3, name: "Group B" },
            { id: "l3", type: "lane", order: 4, name: "Lane 3" },
          ],
        },
      ],
    };

    const result = validatePortfolioDocument(v3Document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.portfolio.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const program = result.document.programs[0];

    // Separators are gone; the surviving lanes keep their original `order`
    // values unrenumbered.
    expect(program.swimlanes.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
    expect(program.swimlanes.map((l) => l.order)).toEqual([1, 2, 4]);

    expect(program.swimlaneGroups).toHaveLength(2);
    const groupA = program.swimlaneGroups!.find((g) => g.name === "Group A")!;
    const groupB = program.swimlaneGroups!.find((g) => g.name === "Group B")!;
    expect(groupA.order).toBe(0);
    expect(groupB.order).toBe(3);

    const byId = new Map(program.swimlanes.map((l) => [l.id, l]));
    expect(byId.get("l1")!.groupId).toBe(groupA.id);
    expect(byId.get("l2")!.groupId).toBe(groupA.id);
    expect(byId.get("l3")!.groupId).toBe(groupB.id);
  });

  it("leaves swimlanes/swimlaneGroups untouched (modulo the schemaVersion bump) for a v3 document with no separator rows", () => {
    const v3Document = {
      portfolio: { ...demoPortfolio, schemaVersion: 3 },
      programs: [
        {
          ...demoRoadmap,
          milestones: [],
          swimlanes: [
            { id: "l1", type: "lane", order: 0, name: "Lane 1" },
            { id: "l2", type: "lane", order: 1, name: "Lane 2" },
          ],
        },
      ],
    };

    const result = validatePortfolioDocument(v3Document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.portfolio.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const program = result.document.programs[0];
    expect(program.swimlanes).toEqual([
      { id: "l1", type: "lane", order: 0, name: "Lane 1" },
      { id: "l2", type: "lane", order: 1, name: "Lane 2" },
    ]);
    expect(program.swimlaneGroups).toBeUndefined();
  });
});
