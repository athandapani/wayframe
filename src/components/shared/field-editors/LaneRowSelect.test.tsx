import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LaneRowSelect } from "./LaneRowSelect";

describe("LaneRowSelect", () => {
  it("renders rows 1..maxRow plus a + New row option", () => {
    render(<LaneRowSelect value={1} maxRow={3} onChange={vi.fn()} ariaLabel="Lane row" />);
    expect(screen.getByRole("option", { name: "Row 1 (home)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Row 2" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Row 3" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "+ New row" })).toBeInTheDocument();
  });

  it("calls onChange with a plain row number", () => {
    const onChange = vi.fn();
    render(<LaneRowSelect value={1} maxRow={3} onChange={onChange} ariaLabel="Lane row" />);
    fireEvent.change(screen.getByLabelText("Lane row"), { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("calls onChange with maxRow+1 when '+ New row' is picked", () => {
    const onChange = vi.fn();
    render(<LaneRowSelect value={1} maxRow={3} onChange={onChange} ariaLabel="Lane row" />);
    fireEvent.change(screen.getByLabelText("Lane row"), { target: { value: "new" } });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("can omit + New row and show a placeholder for bulk pickers", () => {
    render(<LaneRowSelect value="" maxRow={2} allowNewRow={false} placeholder="Move to lane row…" onChange={vi.fn()} ariaLabel="Move to lane row" />);
    expect(screen.getByRole("option", { name: "Move to lane row…" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "+ New row" })).not.toBeInTheDocument();
  });
});
