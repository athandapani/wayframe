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
      ghostMode="badge"
      atRiskMode="off"
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
    renderLegend({ showCriticalPath: false, ghostMode: "off", hasDurations: false, tracing: false });
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
});
