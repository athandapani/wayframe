import { describe, expect, it } from "vitest";
import { parseCsvText } from "./parse-csv";

describe("parseCsvText", () => {
  it("parses a simple header + rows CSV", () => {
    const csv = "Task,Date,Status\nKickoff,2026-01-01,complete\nDesign Freeze,2026-03-01,on-track";
    expect(parseCsvText(csv)).toEqual([
      { Task: "Kickoff", Date: "2026-01-01", Status: "complete" },
      { Task: "Design Freeze", Date: "2026-03-01", Status: "on-track" },
    ]);
  });

  it("handles a quoted field containing a comma — the exact case the prototype's naive splitter broke on", () => {
    const csv = 'Task,Owner,Status\n"Certification, phase 2",T. Boyer,at-risk';
    expect(parseCsvText(csv)).toEqual([{ Task: "Certification, phase 2", Owner: "T. Boyer", Status: "at-risk" }]);
  });

  it("handles an escaped quote inside a quoted field", () => {
    const csv = 'Task,Comment\nReview,"Says ""done"" but not verified"';
    expect(parseCsvText(csv)).toEqual([{ Task: "Review", Comment: 'Says "done" but not verified' }]);
  });

  it("handles a quoted field containing a newline", () => {
    const csv = 'Task,Comment\nReview,"Line one\nLine two"';
    expect(parseCsvText(csv)).toEqual([{ Task: "Review", Comment: "Line one\nLine two" }]);
  });

  it("returns an empty array for a header-only CSV", () => {
    expect(parseCsvText("Task,Date,Status")).toEqual([]);
  });
});
