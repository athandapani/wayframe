import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhaseSizeSelect } from "./PhaseSizeSelect";

describe("PhaseSizeSelect", () => {
  it("renders lean/normal/tall options", () => {
    render(<PhaseSizeSelect value="normal" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "lean" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "normal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "tall" })).toBeInTheDocument();
  });

  it("calls onChange with the picked size", () => {
    const onChange = vi.fn();
    render(<PhaseSizeSelect value="normal" onChange={onChange} ariaLabel="Phase size" />);
    fireEvent.change(screen.getByLabelText("Phase size"), { target: { value: "tall" } });
    expect(onChange).toHaveBeenCalledWith("tall");
  });
});
