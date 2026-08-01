// PROTOTYPE — shared status color lookup, small enough to not defeat the point
// of keeping variants structurally independent (see prototype skill anti-patterns).
import type { Status } from "./demo-data";

export const STATUS_COLOR: Record<Status, string> = {
  "not-started": "#9ca3af",
  "on-track": "#3b82f6",
  "at-risk": "#f59e0b",
  delayed: "#ef4444",
  complete: "#22c55e",
};

export const CRITICAL_PATH_COLOR = "#dc2626";

export function parseDate(d: string): number {
  return new Date(d + "T00:00:00Z").getTime();
}

export function formatMonth(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}
