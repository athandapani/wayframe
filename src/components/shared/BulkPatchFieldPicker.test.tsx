import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Milestone } from "@/components/timeline/types";
import { BulkPatchFieldPicker } from "./BulkPatchFieldPicker";

function pointMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "m1",
    laneId: "lane-1",
    title: "Milestone 1",
    date: "2026-01-01",
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    ...overrides,
  };
}

function openFieldMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Set property…" }));
  return screen.getByLabelText("Set property to");
}

describe("BulkPatchFieldPicker", () => {
  it("offers laneId/laneRow when not excluded, using getLaneOptions for laneId's option list", () => {
    // laneRow only applies to a duration-pill Milestone (endDate set, per
    // lib/bulk-edit/types.ts's own applicability research) — a plain point
    // Milestone alone would leave laneRow with zero applicable items and so
    // (correctly) absent from the menu.
    render(
      <BulkPatchFieldPicker
        selectedItems={[pointMilestone({ endDate: "2026-02-01" })]}
        getLaneOptions={() => ({ lanes: [{ id: "lane-1", name: "Lane One" }], maxLaneRow: 3 })}
        onCommit={vi.fn()}
      />,
    );
    const select = openFieldMenu();
    const optionLabels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionLabels).toContain("Lane");
    expect(optionLabels).toContain("Lane row");
  });

  it("excludes laneId/laneRow entirely when excludeFields names them, regardless of applicability", () => {
    render(<BulkPatchFieldPicker selectedItems={[pointMilestone()]} excludeFields={["laneId", "laneRow"]} onCommit={vi.fn()} />);
    const select = openFieldMenu();
    const optionLabels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionLabels).not.toContain("Lane");
    expect(optionLabels).not.toContain("Lane row");
    expect(optionLabels).toContain("Status");
  });

  it("only offers a field that applies to at least one selected item", () => {
    // A duration-pill Milestone (endDate set) never applies to
    // styleOverride.color (see lib/bulk-edit/types.ts's own applicability
    // research) — with only pill Milestones selected, "Color" shouldn't
    // appear at all.
    render(<BulkPatchFieldPicker selectedItems={[pointMilestone({ endDate: "2026-02-01" })]} excludeFields={["laneId", "laneRow"]} onCommit={vi.fn()} />);
    const select = openFieldMenu();
    const optionLabels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionLabels).not.toContain("Color");
    expect(optionLabels).toContain("Phase shape");
  });

  it("commits an op once a value is chosen for an immediate-commit field (status)", () => {
    const onCommit = vi.fn();
    render(<BulkPatchFieldPicker selectedItems={[pointMilestone()]} onCommit={onCommit} />);
    const select = openFieldMenu();
    fireEvent.change(select, { target: { value: "status" } });
    fireEvent.change(screen.getByLabelText("Set status to"), { target: { value: "at-risk" } });
    expect(onCommit).toHaveBeenCalledWith({ field: "status", value: "at-risk" });
  });

  it("shows the 'applies to N of M selected' hint for a partially-applicable field", () => {
    render(
      <BulkPatchFieldPicker
        selectedItems={[pointMilestone({ id: "m1" }), pointMilestone({ id: "m2", endDate: "2026-02-01" })]}
        excludeFields={["laneId", "laneRow"]}
        onCommit={vi.fn()}
      />,
    );
    const select = openFieldMenu();
    // styleOverride.color only applies to a point Milestone (m1), not the
    // duration-pill one (m2) — 1 of 2 selected.
    fireEvent.change(select, { target: { value: "styleOverride.color" } });
    expect(screen.getByText("Applies to 1 of 2 selected")).toBeInTheDocument();
  });
});
