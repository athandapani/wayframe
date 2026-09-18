import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhaseShapeSelect } from "./PhaseShapeSelect";

describe("PhaseShapeSelect", () => {
  it("renders pill and rectangle options", () => {
    render(<PhaseShapeSelect value="pill" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "pill" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "rectangle" })).toBeInTheDocument();
  });

  it("calls onChange with the picked shape", () => {
    const onChange = vi.fn();
    render(<PhaseShapeSelect value="pill" onChange={onChange} ariaLabel="Phase shape" />);
    fireEvent.change(screen.getByLabelText("Phase shape"), { target: { value: "rectangle" } });
    expect(onChange).toHaveBeenCalledWith("rectangle");
  });
});
