import { describe, expect, it } from "vitest";
import { blueprintTheme, defaultPortfolioTheme, graphiteTheme, resolvePortfolioTheme, THEMES } from "./theme";

describe("resolvePortfolioTheme (wayframe#88/t18)", () => {
  it("resolves to the base preset untouched when there are no overrides", () => {
    expect(resolvePortfolioTheme({ baseId: "blueprint" })).toEqual(blueprintTheme);
  });

  it("defaultPortfolioTheme resolves to the Blueprint preset", () => {
    expect(resolvePortfolioTheme(defaultPortfolioTheme)).toEqual(blueprintTheme);
  });

  it("layers a sparse override map on top of the chosen base, leaving every other field at the base's value", () => {
    const resolved = resolvePortfolioTheme({ baseId: "graphite", overrides: { accent: "#0bb0a8" } });
    expect(resolved.accent).toBe("#0bb0a8");
    expect(resolved.ground).toBe(graphiteTheme.ground);
    expect(resolved.id).toBe("graphite");
  });

  it("an override never changes the resolved id — baseId is the only thing that picks the base", () => {
    const resolved = resolvePortfolioTheme({ baseId: "press", overrides: { accent: THEMES.blueprint.accent } });
    expect(resolved.id).toBe("press");
  });
});
