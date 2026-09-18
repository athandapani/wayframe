import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RangeSlider } from "./RangeSlider";

describe("RangeSlider", () => {
  it("renders the label and formatted value", () => {
    render(<RangeSlider label="Marker scale" value={1.25} onChange={vi.fn()} min={0.6} max={2} step={0.05} />);
    expect(screen.getByText("Marker scale")).toBeInTheDocument();
    expect(screen.getByText("1.25x")).toBeInTheDocument();
  });

  it("omits the label when none is passed", () => {
    render(<RangeSlider value={1} onChange={vi.fn()} min={0.6} max={2} step={0.05} />);
    expect(screen.queryByText("Marker scale")).not.toBeInTheDocument();
  });

  it("calls onChange with a parsed number when the slider moves", () => {
    const onChange = vi.fn();
    render(<RangeSlider label="Font scale" value={1} onChange={onChange} min={0.6} max={2} step={0.05} ariaLabel="Font scale" />);
    fireEvent.change(screen.getByLabelText("Font scale"), { target: { value: "1.5" } });
    expect(onChange).toHaveBeenCalledWith(1.5);
  });

  it("supports a custom formatValue", () => {
    render(<RangeSlider value={3} onChange={vi.fn()} min={0} max={10} step={1} formatValue={(v) => `${v} days`} />);
    expect(screen.getByText("3 days")).toBeInTheDocument();
  });
});
