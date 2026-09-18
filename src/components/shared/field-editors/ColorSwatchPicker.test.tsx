import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorSwatchPicker, DEFAULT_COLOR_SWATCHES } from "./ColorSwatchPicker";

describe("ColorSwatchPicker", () => {
  it("renders one swatch button per color", () => {
    render(<ColorSwatchPicker value={undefined} onChange={vi.fn()} />);
    for (const c of DEFAULT_COLOR_SWATCHES) {
      expect(screen.getByRole("button", { name: `Color ${c}` })).toBeInTheDocument();
    }
  });

  it("does not render a resolved-color reference swatch when resolvedValue is omitted", () => {
    render(<ColorSwatchPicker value={undefined} onChange={vi.fn()} />);
    expect(screen.queryByTitle("Currently resolved color")).not.toBeInTheDocument();
  });

  it("renders a resolved-color reference swatch when resolvedValue is passed", () => {
    render(<ColorSwatchPicker value={undefined} resolvedValue="#123456" onChange={vi.fn()} />);
    expect(screen.getByTitle("Currently resolved color")).toBeInTheDocument();
  });

  it("calls onChange with the clicked swatch's color", () => {
    const onChange = vi.fn();
    render(<ColorSwatchPicker value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: `Color ${DEFAULT_COLOR_SWATCHES[0]}` }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_COLOR_SWATCHES[0]);
  });

  it("supports a custom swatch list", () => {
    render(<ColorSwatchPicker value={undefined} onChange={vi.fn()} swatches={["#ffffff"]} />);
    expect(screen.getByRole("button", { name: "Color #ffffff" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Color ${DEFAULT_COLOR_SWATCHES[0]}` })).not.toBeInTheDocument();
  });
});
