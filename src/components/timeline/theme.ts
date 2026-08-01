// Visual constants for the timeline, kept separate from layout logic. A
// single fixed theme for now — the design prototype (wayframe issue #7)
// explored runtime theme/color switching as comparison tooling, but no
// product requirement calls for end-user theme customization yet. Kept as
// a typed object (not inlined) so adding a real theme system later is a
// small lift, not a rewrite.
import type { Status } from "./types";

export interface Theme {
  font: string;
  statusColor: Record<Status, string>;
  criticalPathColor: string;
  laneTint: string[];
  axisBg: string;
  separatorBg: string;
}

export const defaultTheme: Theme = {
  font: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  statusColor: {
    "not-started": "#9ca3af",
    "on-track": "#3b82f6",
    "at-risk": "#f59e0b",
    delayed: "#ef4444",
    complete: "#22c55e",
  },
  criticalPathColor: "#dc2626",
  laneTint: ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#f43f5e"],
  axisBg: "#52525b",
  separatorBg: "#64748b",
};
