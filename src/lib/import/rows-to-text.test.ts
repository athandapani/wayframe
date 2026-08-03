import { describe, expect, it } from "vitest";
import { rowsToText, type ParsedRow } from "./rows-to-text";

describe("rowsToText", () => {
  it("emits a Source header, a pipe-joined header row, and a pipe-joined row per entry", () => {
    const rows = [
      { Task: "Kickoff", Date: "2026-01-01" },
      { Task: "Design Freeze", Date: "2026-03-01" },
    ];
    expect(rowsToText("schedule.csv", rows)).toBe("Source: schedule.csv\nTask | Date\nKickoff | 2026-01-01\nDesign Freeze | 2026-03-01");
  });

  it("returns an empty string for no rows", () => {
    expect(rowsToText("schedule.csv", [])).toBe("");
  });

  it("fills in a blank cell for a row missing a header present in the first row", () => {
    const rows: ParsedRow[] = [{ Task: "Kickoff", Owner: "A" }, { Task: "Freeze" }];
    expect(rowsToText("s", rows)).toBe("Source: s\nTask | Owner\nKickoff | A\nFreeze | ");
  });
});
