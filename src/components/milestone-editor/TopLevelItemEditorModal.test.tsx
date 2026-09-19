import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopLevelItemEditorModal } from "./TopLevelItemEditorModal";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";
import { defaultTheme } from "@/components/timeline/theme";
import type { EditableTopLevelItem } from "./TopLevelItemEditorModal";

const phase = sampleRoadmap.topLevelItems.find((t) => t.id === "top-1") as EditableTopLevelItem;
const milestone = sampleRoadmap.topLevelItems.find((t) => t.id === "top-2") as EditableTopLevelItem;
const annotation = sampleRoadmap.topLevelItems.find((t) => t.id === "top-3") as EditableTopLevelItem;

function noop() {}

function renderModal(overrides: Partial<Parameters<typeof TopLevelItemEditorModal>[0]> = {}) {
  return render(
    <TopLevelItemEditorModal
      item={phase}
      data={sampleRoadmap}
      theme={defaultTheme}
      legendCategoryFillEnabled={false}
      onSave={noop}
      onClose={noop}
      onDelete={noop}
      onSetStyleOverride={vi.fn()}
      onClearStyleOverride={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TopLevelItemEditorModal Appearance section (wayframe UX-2026-09-18 §2 — Program-band items previously had no Appearance UI at all)", () => {
  it("a phase shows phase shape/size controls but no marker-shape picker", () => {
    renderModal({ item: phase });
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    expect(screen.getByText("Phase shape")).toBeInTheDocument();
    expect(screen.getByText("Phase size")).toBeInTheDocument();
    expect(screen.queryByText("Marker shape")).not.toBeInTheDocument();
  });

  it("a milestone shows the marker-shape picker but no phase shape/size controls", () => {
    renderModal({ item: milestone });
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    expect(screen.getByText("Marker shape")).toBeInTheDocument();
    expect(screen.queryByText("Phase shape")).not.toBeInTheDocument();
  });

  it("an annotation has no Appearance section at all — it has no styleOverride field", () => {
    renderModal({ item: annotation });
    expect(screen.queryByRole("button", { name: /Appearance/ })).not.toBeInTheDocument();
  });

  it("clicking a marker-shape swatch calls onSetStyleOverride with the milestone's id", () => {
    const onSetStyleOverride = vi.fn();
    renderModal({ item: milestone, onSetStyleOverride });
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    fireEvent.click(screen.getByRole("button", { name: "Marker shape: star" }));
    expect(onSetStyleOverride).toHaveBeenCalledWith(milestone.id, { markerShape: "star" });
  });

  it("picking a phase shape calls onSetStyleOverride with the phase's id", () => {
    const onSetStyleOverride = vi.fn();
    renderModal({ item: phase, onSetStyleOverride });
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    fireEvent.change(screen.getByLabelText(/Phase shape/), { target: { value: "rectangle" } });
    expect(onSetStyleOverride).toHaveBeenCalledWith(phase.id, { phaseShape: "rectangle" });
  });
});
