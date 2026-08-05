import { describe, expect, it } from "vitest";
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
});
