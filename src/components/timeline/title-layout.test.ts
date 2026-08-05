import { describe, expect, it } from "vitest";
import { layoutTitleLabels, shouldLabel } from "./title-layout";
import { wrapText } from "./wrap-text";

describe("wrapText", () => {
  it("breaks on word boundaries", () => {
    expect(wrapText("UL 3100 Certification Issued", 14)).toEqual(["UL 3100", "Certification", "Issued"]);
  });

  it("keeps punctuation attached instead of dropping it", () => {
    // The old initialism scheme turned this into "HA(" by taking the first
    // character of "(Preliminary)".
    expect(wrapText("Hazard Analysis (Preliminary)", 20)).toEqual(["Hazard Analysis", "(Preliminary)"]);
  });

  it("truncates with an ellipsis past maxLines", () => {
    const lines = wrapText("Pilot Fleet Uptime >= 95% Sustained (30 days)", 12, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });

  it("hard-breaks a single word longer than the column", () => {
    expect(wrapText("Supercalifragilistic", 8)).toEqual(["Supercal", "ifragili", "stic"]);
  });

  it("returns an empty list for empty input", () => {
    expect(wrapText("   ", 10)).toEqual([]);
  });
});

describe("layoutTitleLabels", () => {
  const item = (id: string, x: number, title: string) => ({ id, x, title });

  it("alternates tiers so neighbours never compete for the same row", () => {
    const out = layoutTitleLabels([item("a", 0, "Alpha"), item("b", 50, "Bravo"), item("c", 100, "Charlie")]);
    expect(out.get("a")!.tier).toBe(0);
    expect(out.get("b")!.tier).toBe(1);
    expect(out.get("c")!.tier).toBe(0);
  });

  it("gives a crowded marker a smaller budget than an isolated one", () => {
    const crowded = layoutTitleLabels([
      item("a", 0, "Perception Accuracy Field Validation"),
      item("b", 20, "x"),
      item("c", 40, "Perception Accuracy Field Validation"),
      item("d", 60, "x"),
      item("e", 80, "Perception Accuracy Field Validation"),
    ]);
    const roomy = layoutTitleLabels([item("solo", 0, "Perception Accuracy Field Validation")]);
    const crowdedLen = crowded.get("c")!.lines.join("").length;
    const roomyLen = roomy.get("solo")!.lines.join("").length;
    expect(crowdedLen).toBeLessThan(roomyLen);
  });

  it("uses an explicit shortLabel verbatim, unwrapped", () => {
    const out = layoutTitleLabels([{ id: "a", x: 0, title: "Some Very Long Milestone Title Here", shortLabel: "GA" }]);
    expect(out.get("a")!.lines).toEqual(["GA"]);
  });

  it("never exceeds the requested line count", () => {
    const out = layoutTitleLabels([item("a", 0, "A title long enough to need more than two lines at any budget")], 2);
    expect(out.get("a")!.lines.length).toBeLessThanOrEqual(2);
  });
});

describe("shouldLabel", () => {
  it("labels everything on 'all'", () => {
    expect(shouldLabel("all", { critical: false, offTrack: false })).toBe(true);
  });

  it("labels nothing on 'none'", () => {
    expect(shouldLabel("none", { critical: true, offTrack: true })).toBe(false);
  });

  it("on 'key' keeps the critical path and anything off-track", () => {
    expect(shouldLabel("key", { critical: true, offTrack: false })).toBe(true);
    expect(shouldLabel("key", { critical: false, offTrack: true })).toBe(true);
    expect(shouldLabel("key", { critical: false, offTrack: false })).toBe(false);
  });
});
