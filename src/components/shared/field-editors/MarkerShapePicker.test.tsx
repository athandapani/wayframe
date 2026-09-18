import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkerShapePicker, MARKER_SHAPES } from "./MarkerShapePicker";

describe("MarkerShapePicker", () => {
  it("renders one button per shape", () => {
    render(<MarkerShapePicker value={undefined} onChange={vi.fn()} />);
    for (const shape of MARKER_SHAPES) {
      expect(screen.getByRole("button", { name: `Marker shape: ${shape}` })).toBeInTheDocument();
    }
  });

  it("renders the label when passed", () => {
    render(<MarkerShapePicker label="Marker shape" value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText("Marker shape")).toBeInTheDocument();
  });

  it("calls onChange with the clicked shape", () => {
    const onChange = vi.fn();
    render(<MarkerShapePicker value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Marker shape: star" }));
    expect(onChange).toHaveBeenCalledWith("star");
  });

  it("defaults resolvedValue to value when resolvedValue is omitted", () => {
    render(<MarkerShapePicker value="star" onChange={vi.fn()} />);
    const starButton = screen.getByRole("button", { name: "Marker shape: star" });
    // isOverride styling (violet) applies since value === "star"
    expect(starButton.className).toContain("border-violet-500");
  });
});
