import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModeToggle } from "./ModeToggle";
import { initialsFor } from "@/components/auth/AuthControls";

describe("ModeToggle (wayframe#144 feedback)", () => {
  it("says 'Programs' when the Roadmap holds several — what you switch into is all of them", () => {
    render(<ModeToggle mode="program" onChange={vi.fn()} plural />);
    expect(screen.getByRole("button", { name: "Programs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Program" })).not.toBeInTheDocument();
  });

  it("says 'Program' for a single-Program Roadmap", () => {
    render(<ModeToggle mode="program" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Program" })).toBeInTheDocument();
  });

  it("carries the Programs picker inside its own border rather than beside it", () => {
    const { container } = render(<ModeToggle mode="program" onChange={vi.fn()} plural trailing={<select aria-label="Program" />} />);
    const pill = container.firstElementChild!;
    expect(within(pill as HTMLElement).getByLabelText("Program")).toBeInTheDocument();
  });

  it("reports which reading is active, and switches on click", () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="program" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Program" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Executive" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Executive" }));
    expect(onChange).toHaveBeenCalledWith("executive");
  });
});

describe("initialsFor (wayframe#144 feedback — an avatar instead of ~200px of address)", () => {
  it("takes two names' first letters", () => {
    expect(initialsFor("Arun Thandapani", "athandapani@gmail.com")).toBe("AT");
  });

  it("falls back to the email's local part when there is no full name", () => {
    expect(initialsFor(null, "athandapani@gmail.com")).toBe("AT");
  });

  it("never renders empty, even with nothing to work from", () => {
    expect(initialsFor(null, null)).toBe("?");
  });
});
