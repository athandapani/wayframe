import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectionToolbar } from "./SelectionToolbar";
import type { Program } from "@/components/timeline/types";
import type { UseSelectionResult } from "@/components/timeline/use-selection";

/**
 * One Program covering the entity shapes this toolbar's field-applicability
 * filtering needs to distinguish — mirrors src/lib/bulk-edit/apply.test.ts's
 * own fixture reasoning:
 *   - pm1: a point Milestone (no endDate) — laneRow/endDate/phaseShape/
 *     phaseSize don't apply.
 *   - dm1: a duration-pill Milestone (endDate set) — laneRow/phaseShape/
 *     phaseSize DO apply; markerShape/markerScale/titleLabelPosition/
 *     dateLabelPosition/color don't.
 *   - tp1: a TopLevelItem "phase" — status/date/endDate/phaseShape/
 *     phaseSize apply; laneId/laneRow/color/label-position/markerShape/
 *     markerScale don't.
 */
function baseProgram(): Program {
  return {
    id: "program-1",
    portfolioId: "portfolio-1",
    order: 0,
    programName: "Test Program",
    generatedAt: "2026-01-01T00:00:00Z",
    owner: "Owner",
    bluf: { statement: "s", bullets: [] },
    actionItems: [],
    swimlanes: [
      { id: "lane-1", order: 0, type: "lane", name: "Lane A" },
      { id: "lane-2", order: 1, type: "lane", name: "Lane B" },
    ],
    topLevelItems: [{ id: "tp1", type: "phase", title: "Top phase", startDate: "2026-01-01", endDate: "2026-01-10", status: "not-started" }],
    milestones: [
      { id: "pm1", laneId: "lane-1", title: "Point milestone", date: "2026-01-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null },
      {
        id: "dm1",
        laneId: "lane-1",
        title: "Duration pill",
        date: "2026-01-01",
        endDate: "2026-01-10",
        laneRow: 1,
        status: "not-started",
        dependsOn: [],
        linksToTopLevelMilestone: null,
      },
    ],
  };
}

function selectionWith(ids: string[]): UseSelectionResult {
  return { selectedIds: new Set(ids), isSelected: (id) => ids.includes(id), toggle: vi.fn(), replace: vi.fn(), addAll: vi.fn(), clear: vi.fn() };
}

function openFieldPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Set property…" }));
  return screen.getByLabelText("Set property to");
}

describe("SelectionToolbar (t33 generic field-patch redesign)", () => {
  it("returns null (renders nothing) when the selection is empty", () => {
    const { container } = render(<SelectionToolbar data={baseProgram()} selection={selectionWith([])} onBulkEdit={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists only fields that apply to at least one selected item, for a single point-Milestone selection", () => {
    render(<SelectionToolbar data={baseProgram()} selection={selectionWith(["pm1"])} onBulkEdit={vi.fn()} />);
    const select = openFieldPicker();
    const optionLabels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);

    // Applies to a point Milestone:
    expect(optionLabels).toContain("Status");
    expect(optionLabels).toContain("Lane");
    expect(optionLabels).toContain("Date");
    expect(optionLabels).toContain("Marker shape");
    expect(optionLabels).toContain("Color");
    // Does NOT apply to a point Milestone (needs a duration pill / phase):
    expect(optionLabels).not.toContain("Lane row");
    expect(optionLabels).not.toContain("End date");
    expect(optionLabels).not.toContain("Phase shape");
    expect(optionLabels).not.toContain("Phase size");
  });

  it("includes a field once it applies to at least one selected item, even in a mixed selection", () => {
    render(<SelectionToolbar data={baseProgram()} selection={selectionWith(["pm1", "dm1"])} onBulkEdit={vi.fn()} />);
    const select = openFieldPicker();
    const optionLabels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    // laneRow only applies to dm1 (the duration pill), not pm1 — still listed.
    expect(optionLabels).toContain("Lane row");
  });

  it("choosing a field shows its value editor, and committing a value builds the correct preview", () => {
    const data = baseProgram();
    render(<SelectionToolbar data={data} selection={selectionWith(["pm1"])} onBulkEdit={vi.fn()} />);
    const select = openFieldPicker();
    fireEvent.change(select, { target: { value: "status" } });

    // The Status value-editor is now showing, in its uncommitted "pick a
    // value" mode.
    const statusSelect = screen.getByLabelText("Set status to");
    fireEvent.change(statusSelect, { target: { value: "at-risk" } });

    // Committing the value replaces the picker with a DiffBanner preview.
    expect(screen.getByText("Bulk edit — 1 selected")).toBeInTheDocument();
    expect(screen.getByText("Point milestone")).toBeInTheDocument();
    expect(screen.getByText(/not-started/)).toBeInTheDocument();
    expect(screen.getByText("at-risk")).toBeInTheDocument();
  });

  it("Apply calls onBulkEdit with the committed op and accepted ids, in fork 1's generic shape", () => {
    const onBulkEdit = vi.fn();
    render(<SelectionToolbar data={baseProgram()} selection={selectionWith(["pm1"])} onBulkEdit={onBulkEdit} />);
    fireEvent.change(openFieldPicker(), { target: { value: "status" } });
    fireEvent.change(screen.getByLabelText("Set status to"), { target: { value: "at-risk" } });

    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));

    expect(onBulkEdit).toHaveBeenCalledTimes(1);
    expect(onBulkEdit).toHaveBeenCalledWith([{ op: { field: "status", value: "at-risk" }, ids: ["pm1"] }], [], []);
  });

  it("shows an 'applies to N of M selected' note for a field that applies to only part of a mixed selection", () => {
    render(<SelectionToolbar data={baseProgram()} selection={selectionWith(["pm1", "dm1"])} onBulkEdit={vi.fn()} />);
    fireEvent.change(openFieldPicker(), { target: { value: "laneRow" } });

    expect(screen.getByText("Applies to 1 of 2 selected")).toBeInTheDocument();
  });

  it("does not show the note when a field applies to every selected item", () => {
    render(<SelectionToolbar data={baseProgram()} selection={selectionWith(["pm1", "dm1"])} onBulkEdit={vi.fn()} />);
    fireEvent.change(openFieldPicker(), { target: { value: "status" } });

    expect(screen.queryByText(/Applies to/)).not.toBeInTheDocument();
  });

  it("Delete previews the items to remove via DiffBanner, then calls onBulkEdit with deleteIds", () => {
    const onBulkEdit = vi.fn();
    render(<SelectionToolbar data={baseProgram()} selection={selectionWith(["pm1", "dm1"])} onBulkEdit={onBulkEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Point milestone")).toBeInTheDocument();
    expect(screen.getByText("Duration pill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));

    expect(onBulkEdit).toHaveBeenCalledTimes(1);
    expect(onBulkEdit).toHaveBeenCalledWith([], ["pm1", "dm1"], []);
  });

  it("Accept baseline previews only ids with a baseline, then calls onBulkEdit with acceptBaselineOps", () => {
    const data = baseProgram();
    data.milestones[0] = { ...data.milestones[0], originalDate: "2025-12-01" };
    const onBulkEdit = vi.fn();
    render(<SelectionToolbar data={data} selection={selectionWith(["pm1", "dm1"])} onBulkEdit={onBulkEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept baseline" }));
    // Only pm1 has an originalDate — dm1 contributes no preview row.
    expect(screen.getByText("Point milestone")).toBeInTheDocument();
    expect(screen.queryByText("Duration pill")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));

    expect(onBulkEdit).toHaveBeenCalledWith([], [], [{ scope: "one", targetId: "pm1", reason: "bulk accept baseline" }]);
  });

  it("Clear calls selection.clear", () => {
    const selection = selectionWith(["pm1"]);
    render(<SelectionToolbar data={baseProgram()} selection={selection} onBulkEdit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(selection.clear).toHaveBeenCalledTimes(1);
  });
});
