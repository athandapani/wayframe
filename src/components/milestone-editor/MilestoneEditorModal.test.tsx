import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MilestoneEditorModal } from "./MilestoneEditorModal";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";
import { defaultTheme } from "@/components/timeline/theme";
import type { RenderableMilestone } from "@/components/timeline/types";

const milestone: RenderableMilestone = sampleRoadmap.milestones[0];
const pillMilestone: RenderableMilestone = { ...milestone, endDate: "2026-02-01" };

function noop() {}

function renderModal(overrides: Partial<Parameters<typeof MilestoneEditorModal>[0]> = {}) {
  return render(
    <MilestoneEditorModal
      data={sampleRoadmap}
      theme={defaultTheme}
      milestone={milestone}
      legendCategoryFillEnabled={false}
      onSave={noop}
      onClose={noop}
      onDelete={noop}
      onToggleDependency={noop}
      onEditAttachments={noop}
      onAcceptBaseline={noop}
      onTrace={noop}
      onSetCategory={noop}
      onSetStyleOverride={vi.fn()}
      onClearStyleOverride={vi.fn()}
      onSetLaneRow={vi.fn()}
      {...overrides}
    />,
  );
}

describe("MilestoneEditorModal (t34 redesign)", () => {
  it("always shows the Content section's fields, with no collapse needed", () => {
    renderModal();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Comment")).toBeInTheDocument();
  });

  it("starts Appearance and Relationships collapsed, and expands each on click", () => {
    renderModal();
    expect(screen.queryByText("Marker shape")).not.toBeInTheDocument();
    expect(screen.queryByText(/Must finish before this milestone/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    expect(screen.getByText("Marker shape")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Relationships/ }));
    expect(screen.getByText(/Must finish before this milestone/)).toBeInTheDocument();
  });

  it("calls onSetStyleOverride with the right args when a marker-shape swatch is clicked", () => {
    const onSetStyleOverride = vi.fn();
    renderModal({ onSetStyleOverride });
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    fireEvent.click(screen.getByRole("button", { name: "Marker shape: star" }));
    expect(onSetStyleOverride).toHaveBeenCalledWith(milestone.id, { markerShape: "star" });
  });

  it("shows only the fields the real chart actually reads for each kind: point gets marker controls (no phase shape/size), a duration pill gets only phase shape/size + hidden (wayframe UX-2026-09-18 §2 — no more render-plus-warn)", () => {
    // Two fully separate mounts (not a rerender of the same instance) — the
    // modal's draft state is seeded once from `milestone` at mount time, so
    // "does this milestone have an end date" needs a fresh ModalForm per
    // milestone, exactly like opening the editor on a different item would.
    const first = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    expect(screen.getByText("Marker shape")).toBeInTheDocument();
    expect(screen.queryByText("Phase shape")).not.toBeInTheDocument();
    first.unmount();

    renderModal({ milestone: pillMilestone });
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    expect(screen.queryByText("Marker shape")).not.toBeInTheDocument();
    expect(screen.getByText("Phase shape")).toBeInTheDocument();
    expect(screen.getByText("Hide from chart (soft-hide, not deleted)")).toBeInTheDocument();
  });

  it("shows the Lane row field only for a duration-pill milestone (endDate set)", () => {
    renderModal();
    expect(screen.queryByText("Lane row")).not.toBeInTheDocument();

    renderModal({ milestone: pillMilestone });
    expect(screen.getByText("Lane row")).toBeInTheDocument();
  });
});
