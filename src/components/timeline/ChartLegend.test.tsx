import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChartLegend } from "./ChartLegend";
import { defaultTheme } from "./theme";

function renderLegend(overrides: Partial<React.ComponentProps<typeof ChartLegend>> = {}) {
  return render(
    <ChartLegend
      theme={defaultTheme}
      criticalPathStyle="thick"
      showCriticalPath
      deltaAnnotationsEnabled
      tracing={false}
      hasDurations
      {...overrides}
    />,
  );
}

describe("ChartLegend", () => {
  it("names every status", () => {
    renderLegend();
    for (const label of ["Not started", "On track", "At risk", "Delayed", "Complete"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("collapses and expands", () => {
    renderLegend();
    expect(screen.getByText("On track")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Legend/ }));
    expect(screen.queryByText("On track")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Legend/ }));
    expect(screen.getByText("On track")).toBeInTheDocument();
  });

  it("only explains what's actually on screen", () => {
    // A legend that documents switched-off features is noise.
    renderLegend({ showCriticalPath: false, deltaAnnotationsEnabled: false, hasDurations: false, tracing: false });
    expect(screen.queryByText(/Critical path/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Slipped from/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Runs over a period/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Highlighted path/)).not.toBeInTheDocument();
    // Today is always drawn, so it always appears.
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("adds the trace key only while a trace is running", () => {
    renderLegend({ tracing: true });
    expect(screen.getByText("Highlighted path")).toBeInTheDocument();
  });

  it("explains what the critical path means, not just its colour", () => {
    renderLegend();
    expect(screen.getByText(/sets the finish date/)).toBeInTheDocument();
  });

  describe("categories", () => {
    const categories = [
      { id: "cat-1", name: "Regulatory", color: "#ff0000" },
      { id: "cat-2", name: "Customer-facing", color: "#00ff00" },
    ];

    it("renders categories when present", () => {
      renderLegend({ categories });
      expect(screen.getByText("Regulatory")).toBeInTheDocument();
      expect(screen.getByText("Customer-facing")).toBeInTheDocument();
    });

    it("hides the category section when the document has none and no onAddCategory", () => {
      renderLegend({ categories: [] });
      expect(screen.queryByRole("button", { name: "Add a category" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Regulatory/ })).not.toBeInTheDocument();
    });

    it("still shows the add affordance on an empty document when onAddCategory is provided", () => {
      renderLegend({ categories: [], onAddCategory: () => {} });
      expect(screen.getByRole("button", { name: "Add a category" })).toBeInTheDocument();
    });

    it("clicking a swatch calls onToggleCategory with the category id", () => {
      const onToggleCategory = vi.fn();
      renderLegend({ categories, onToggleCategory });
      fireEvent.click(screen.getByRole("button", { name: "Regulatory" }));
      expect(onToggleCategory).toHaveBeenCalledWith("cat-1");
    });

    it("clicking add calls onAddCategory with the expected default name/color", () => {
      const onAddCategory = vi.fn();
      renderLegend({ categories, onAddCategory });
      fireEvent.click(screen.getByRole("button", { name: "Add a category" }));
      expect(onAddCategory).toHaveBeenCalledWith("New category", "#2563eb");
    });

    it("gives hidden categories the reduced-opacity treatment", () => {
      renderLegend({ categories, hiddenCategoryIds: new Set(["cat-1"]) });
      const hiddenSwatch = screen.getByRole("button", { name: "Regulatory (hidden)" });
      expect(hiddenSwatch).toHaveAttribute("aria-pressed", "false");
      expect(hiddenSwatch).toHaveStyle({ opacity: "0.4" });

      const visibleSwatch = screen.getByRole("button", { name: "Customer-facing" });
      expect(visibleSwatch).toHaveAttribute("aria-pressed", "true");
      expect(visibleSwatch).toHaveStyle({ opacity: "1" });
    });
  });

  describe("CategoryPopover fast-path edit (wayframe UX-2026-09-18 §9)", () => {
    const categories = [
      { id: "cat-1", name: "Regulatory", color: "#ff0000" },
      { id: "cat-2", name: "Customer-facing", color: "#00ff00" },
    ];

    it("shows no edit (pencil) affordance when onRenameCategory/onRecolorCategory are omitted — e.g. a read-only legend", () => {
      renderLegend({ categories });
      expect(screen.queryByRole("button", { name: "Edit Regulatory" })).not.toBeInTheDocument();
    });

    it("shows the edit affordance only once BOTH onRenameCategory and onRecolorCategory are provided", () => {
      renderLegend({ categories, onRenameCategory: vi.fn() });
      expect(screen.queryByRole("button", { name: "Edit Regulatory" })).not.toBeInTheDocument();

      renderLegend({ categories, onRenameCategory: vi.fn(), onRecolorCategory: vi.fn() });
      expect(screen.getByRole("button", { name: "Edit Regulatory" })).toBeInTheDocument();
    });

    it("clicking the pencil opens a popover for that category only, not its sibling, and the label click still just toggles visibility (never opens the popover)", () => {
      const onToggleCategory = vi.fn();
      renderLegend({ categories, onRenameCategory: vi.fn(), onRecolorCategory: vi.fn(), onToggleCategory });

      fireEvent.click(screen.getByRole("button", { name: "Edit Regulatory" }));
      expect(screen.getByRole("dialog", { name: "Edit Regulatory" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Edit Customer-facing" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Customer-facing" }));
      expect(onToggleCategory).toHaveBeenCalledWith("cat-2");
      expect(screen.queryByRole("dialog", { name: "Edit Customer-facing" })).not.toBeInTheDocument();
    });

    it("'Save' commits both the renamed name and recolored color in one shot; 'Cancel' commits neither", () => {
      const onRenameCategory = vi.fn();
      const onRecolorCategory = vi.fn();
      renderLegend({ categories, onRenameCategory, onRecolorCategory });

      fireEvent.click(screen.getByRole("button", { name: "Edit Regulatory" }));
      fireEvent.change(screen.getByLabelText("Name of Regulatory"), { target: { value: "Compliance" } });
      fireEvent.change(screen.getByLabelText("Colour for Regulatory"), { target: { value: "#123456" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(onRenameCategory).toHaveBeenCalledWith("cat-1", "Compliance");
      expect(onRecolorCategory).toHaveBeenCalledWith("cat-1", "#123456");
      expect(screen.queryByRole("dialog", { name: "Edit Regulatory" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Edit Regulatory" }));
      fireEvent.change(screen.getByLabelText("Name of Regulatory"), { target: { value: "Something else" } });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onRenameCategory).toHaveBeenCalledTimes(1); // not called again
    });

    it("neither onRenameCategory nor onRecolorCategory is called per keystroke/drag — only once, on Save (undo-history pollution guard)", () => {
      const onRenameCategory = vi.fn();
      const onRecolorCategory = vi.fn();
      renderLegend({ categories, onRenameCategory, onRecolorCategory });

      fireEvent.click(screen.getByRole("button", { name: "Edit Regulatory" }));
      const nameInput = screen.getByLabelText("Name of Regulatory");
      fireEvent.change(nameInput, { target: { value: "C" } });
      fireEvent.change(nameInput, { target: { value: "Co" } });
      fireEvent.change(nameInput, { target: { value: "Com" } });
      expect(onRenameCategory).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onRenameCategory).toHaveBeenCalledTimes(1);
      expect(onRenameCategory).toHaveBeenCalledWith("cat-1", "Com");
    });

    it("pressing Escape closes the popover and commits the draft, same as outside-click", () => {
      const onRenameCategory = vi.fn();
      const onRecolorCategory = vi.fn();
      renderLegend({ categories, onRenameCategory, onRecolorCategory });

      fireEvent.click(screen.getByRole("button", { name: "Edit Regulatory" }));
      fireEvent.change(screen.getByLabelText("Name of Regulatory"), { target: { value: "Compliance" } });
      fireEvent.keyDown(document, { key: "Escape" });

      expect(onRenameCategory).toHaveBeenCalledWith("cat-1", "Compliance");
      expect(screen.queryByRole("dialog", { name: "Edit Regulatory" })).not.toBeInTheDocument();
    });
  });
});
