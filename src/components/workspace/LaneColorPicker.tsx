"use client";

// Per-lane colour override (prototype/theme-system). Writes
// Swimlane.color through useCorrectionBox's reducer, so it's document
// content that travels with the roadmap and lands in the export — and it's
// undoable like any other edit.
//
// "Auto" clears the override and returns the lane to the active theme's
// palette, which is what makes theme switching still feel like a theme
// switch after someone has pinned one or two lanes.
import type { Swimlane } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import { laneColorAt } from "@/components/timeline/lane-colors";

export function LaneColorPicker({
  swimlanes,
  theme,
  onChange,
}: {
  swimlanes: Swimlane[];
  theme: Theme;
  onChange: (laneId: string, color: string | undefined) => void;
}) {
  const lanes = swimlanes.filter((l) => l.type === "lane").sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-2">
      {lanes.map((lane, i) => {
        const fallback = laneColorAt(theme.laneRamp, i, lanes.length);
        const pinned = lane.color !== undefined;
        return (
          <div key={lane.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs opacity-80" title={lane.name}>
              {lane.name}
            </span>
            <input
              type="color"
              aria-label={`Colour for ${lane.name}`}
              value={lane.color ?? fallback}
              onChange={(e) => onChange(lane.id, e.target.value)}
              style={{ borderColor: "var(--wf-border)" }}
              className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
            />
            <button
              onClick={() => onChange(lane.id, undefined)}
              disabled={!pinned}
              title={pinned ? "Reset to theme colour" : "Using the theme colour"}
              style={{ borderColor: "var(--wf-border)" }}
              className="rounded-full border px-2 py-0.5 text-[10px] opacity-70 disabled:opacity-30"
            >
              Auto
            </button>
          </div>
        );
      })}
    </div>
  );
}
