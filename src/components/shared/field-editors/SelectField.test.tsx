import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectField } from "./SelectField";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("SelectField", () => {
  it("renders the label and every option", () => {
    render(<SelectField label="Pick one" value="a" onChange={vi.fn()} options={OPTIONS} />);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
  });

  it("calls onChange with the selected option's value", () => {
    const onChange = vi.fn();
    render(<SelectField label="Pick one" value="a" onChange={onChange} options={OPTIONS} ariaLabel="Pick one" />);
    fireEvent.change(screen.getByLabelText("Pick one"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("in placeholder mode, starts blank and never fires onChange for the placeholder itself", () => {
    const onChange = vi.fn();
    render(<SelectField value="" placeholder="Choose…" onChange={onChange} options={OPTIONS} ariaLabel="Choose" />);
    const select = screen.getByLabelText("Choose") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: "Choose…" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
