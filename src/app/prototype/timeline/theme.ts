// PROTOTYPE — theme presets: swappable font, status colors, critical-path
// color, and per-lane tint palette. Answers "themes for font/color/timeline/
// milestone colors" feedback on wayframe issue #7.
import type { Status } from "./demo-data";

export interface Theme {
  key: string;
  label: string;
  font: string;
  statusColor: Record<Status, string>;
  criticalPathColor: string;
  laneTint: string[];
}

export const THEMES: Theme[] = [
  {
    key: "default",
    label: "Default",
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
  },
  {
    key: "warm",
    label: "Warm",
    font: "'Georgia', 'Iowan Old Style', serif",
    statusColor: {
      "not-started": "#a8a29e",
      "on-track": "#d97706",
      "at-risk": "#ea580c",
      delayed: "#b91c1c",
      complete: "#65a30d",
    },
    criticalPathColor: "#9f1239",
    laneTint: ["#d97706", "#b45309", "#ea580c", "#be123c", "#a16207", "#c2410c"],
  },
  {
    key: "slate",
    label: "Slate",
    font: "'JetBrains Mono', 'Courier New', monospace",
    statusColor: {
      "not-started": "#94a3b8",
      "on-track": "#0ea5e9",
      "at-risk": "#eab308",
      delayed: "#f43f5e",
      complete: "#14b8a6",
    },
    criticalPathColor: "#e11d48",
    laneTint: ["#0ea5e9", "#14b8a6", "#8b5cf6", "#64748b", "#0891b2", "#6366f1"],
  },
];
