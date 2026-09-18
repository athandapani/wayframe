import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LabelPositionPicker } from "./LabelPositionPicker";

describe("LabelPositionPicker", () => {
  it("renders one button per non-corner compass position", () => {
    render(<LabelPositionPicker label="Title label position" value={undefined} onChange={vi.fn()} />);
    for (const pos of ["top", "left", "inside", "right", "bottom"]) {
      expect(screen.getByRole("button", { name: `Title label position: ${pos}` })).toBeInTheDocument();
    }
  });

  it("calls onChange with the clicked position", () => {
    const onChange = vi.fn();
    render(<LabelPositionPicker label="Date label position" value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Date label position: top" }));
    expect(onChange).toHaveBeenCalledWith("top");
  });

  it("highlights resolvedValue (defaulting to value when omitted)", () => {
    render(<LabelPositionPicker label="Title label position" value="left" onChange={vi.fn()} />);
    const leftButton = screen.getByRole("button", { name: "Title label position: left" });
    expect(leftButton.className).toContain("border-emerald-500");
  });
});
