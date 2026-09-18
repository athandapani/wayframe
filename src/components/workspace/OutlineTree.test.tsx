import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OutlineTree } from "./OutlineTree";
import { sampleRoadmap } from "@/components/timeline/__fixtures__/sample-roadmap";
import { defaultTheme } from "@/components/timeline/theme";
import type { UseSelectionResult } from "@/components/timeline/use-selection";

function noop() {}

function baseSelection(): UseSelectionResult {
  return { selectedIds: new Set(), isSelected: () => false, toggle: vi.fn(), replace: vi.fn(), addAll: vi.fn(), clear: vi.fn() };
}

describe("OutlineTree", () => {
  // wayframe#t33 regression: fork 1 generalized onBulkEdit's signature from
  // (patchOps, laneReassignments, acceptBaselineOps) to
  // (bulkPatchOps, deleteIds, acceptBaselineOps) — the leaf reparent-onto-
  // lane drag/select interaction (moveToLane) must now build a one-item
  // `laneId` field-patch op instead of the old one-item laneReassignments
  // array, targeting the exact same id/lane, unchanged otherwise.
  it("wires the leaf lane-reparent control through a one-item laneId field-patch bulkEdit op", () => {
    const onBulkEdit = vi.fn();
    render(
      <OutlineTree
        data={sampleRoadmap}
        theme={defaultTheme}
        selection={baseSelection()}
        onMove={noop}
        onMoveGroup={noop}
        onAssignGroup={noop}
        onSetGroupParentId={noop}
        onHidden={noop}
        onToggleGroupCollapsed={noop}
        onBulkEdit={onBulkEdit}
        onClose={noop}
      />,
    );

    fireEvent.change(screen.getByLabelText("Move First milestone to a different lane…"), { target: { value: "lane-b" } });

    expect(onBulkEdit).toHaveBeenCalledTimes(1);
    expect(onBulkEdit).toHaveBeenCalledWith([{ op: { field: "laneId", value: "lane-b" }, ids: ["m1"] }], [], []);
  });
});
