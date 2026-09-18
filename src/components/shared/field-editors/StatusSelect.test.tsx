import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusSelect, STATUS_OPTIONS } from "./StatusSelect";

describe("StatusSelect", () => {
  it("renders every status as an option", () => {
    render(<StatusSelect value="on-track" onChange={vi.fn()} />);
    for (const s of STATUS_OPTIONS) {
      expect(screen.getByRole("option", { name: s })).toBeInTheDocument();
    }
  });

  it("calls onChange with the picked status", () => {
    const onChange = vi.fn();
    render(<StatusSelect value="on-track" onChange={onChange} ariaLabel="Status" />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "at-risk" } });
    expect(onChange).toHaveBeenCalledWith("at-risk");
  });

  it("supports an uncommitted placeholder mode for bulk pickers", () => {
    render(<StatusSelect value="" placeholder="Set status to…" onChange={vi.fn()} ariaLabel="Set status to" />);
    expect(screen.getByRole("option", { name: "Set status to…" })).toBeInTheDocument();
  });
});
