import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConflictBanner } from "./ConflictBanner";
import type { ProgramConflict } from "@/lib/realtime/program-conflict";

function conflict(overrides: Partial<ProgramConflict> = {}): ProgramConflict {
  return {
    type: "orphaned",
    itemKind: "milestone",
    targetId: "m1",
    message: "This milestone was deleted by another collaborator while you were offline.",
    ...overrides,
  };
}

describe("ConflictBanner", () => {
  it("renders nothing when conflicts is empty", () => {
    render(<ConflictBanner conflicts={[]} onDismiss={vi.fn()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a conflict's message and a dismiss control", () => {
    render(<ConflictBanner conflicts={[conflict()]} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(conflict().message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss conflict" })).toBeInTheDocument();
  });

  it("renders multiple conflicts each with their own dismiss control, calling onDismiss only with that conflict's targetId", () => {
    const onDismiss = vi.fn();
    const conflicts = [
      conflict({ targetId: "m1", message: "This milestone was deleted by another collaborator while you were offline." }),
      conflict({ targetId: "t1", itemKind: "topLevelItem", message: "This item was deleted by another collaborator while you were offline." }),
    ];
    render(<ConflictBanner conflicts={conflicts} onDismiss={onDismiss} />);

    expect(screen.getByText("This milestone was deleted by another collaborator while you were offline.")).toBeInTheDocument();
    expect(screen.getByText("This item was deleted by another collaborator while you were offline.")).toBeInTheDocument();

    const dismissButtons = screen.getAllByRole("button", { name: "Dismiss conflict" });
    expect(dismissButtons).toHaveLength(2);

    dismissButtons[1].click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith("t1");
  });
});
