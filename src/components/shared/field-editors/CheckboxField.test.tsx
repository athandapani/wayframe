import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckboxField } from "./CheckboxField";

describe("CheckboxField", () => {
  it("renders the label associated with the checkbox via htmlFor/id", () => {
    render(<CheckboxField id="hidden-m1" checked={false} onChange={vi.fn()} label="Hide from chart" />);
    const checkbox = screen.getByLabelText("Hide from chart");
    expect(checkbox).not.toBeChecked();
  });

  it("reflects checked=true", () => {
    render(<CheckboxField id="hidden-m1" checked={true} onChange={vi.fn()} label="Hide from chart" />);
    expect(screen.getByLabelText("Hide from chart")).toBeChecked();
  });

  it("calls onChange with the new checked state", () => {
    const onChange = vi.fn();
    render(<CheckboxField id="hidden-m1" checked={false} onChange={onChange} label="Hide from chart" />);
    fireEvent.click(screen.getByLabelText("Hide from chart"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
