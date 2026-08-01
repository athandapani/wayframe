// Configurable 2/3-tier date axis (Year always on top; Quarter and/or Month
// as an optional finer tier).

export type Tier = "quarter" | "month" | "none";

export interface AxisTierConfig {
  key: string;
  label: string;
  tier2: Tier;
  tier3: Tier;
}

export const AXIS_PRESETS: AxisTierConfig[] = [
  { key: "year", label: "Year only", tier2: "none", tier3: "none" },
  { key: "year-quarter", label: "Year / Quarter", tier2: "quarter", tier3: "none" },
  { key: "year-month", label: "Year / Month", tier2: "month", tier3: "none" },
  { key: "year-quarter-month", label: "Year / Quarter / Month", tier2: "quarter", tier3: "month" },
];

export interface Segment {
  start: number;
  end: number;
  label: string;
}

export function tierRowCount(config: AxisTierConfig): number {
  return 1 + (config.tier2 !== "none" ? 1 : 0) + (config.tier3 !== "none" ? 1 : 0);
}

export function yearSegments(domainMin: number, domainMax: number): Segment[] {
  const segments: Segment[] = [];
  const d = new Date(domainMin);
  let year = d.getUTCFullYear();
  while (true) {
    const start = Date.UTC(year, 0, 1);
    const end = Date.UTC(year + 1, 0, 1);
    if (start > domainMax) break;
    if (end >= domainMin) {
      segments.push({ start: Math.max(start, domainMin), end: Math.min(end, domainMax), label: String(year) });
    }
    year += 1;
  }
  return segments;
}

export function quarterSegments(domainMin: number, domainMax: number): Segment[] {
  const segments: Segment[] = [];
  const d = new Date(domainMin);
  let year = d.getUTCFullYear();
  let quarter = Math.floor(d.getUTCMonth() / 3);
  while (true) {
    const startMonth = quarter * 3;
    const start = Date.UTC(year, startMonth, 1);
    const end = Date.UTC(year, startMonth + 3, 1);
    if (start > domainMax) break;
    if (end >= domainMin) {
      segments.push({
        start: Math.max(start, domainMin),
        end: Math.min(end, domainMax),
        label: `Q${quarter + 1} '${String(year).slice(2)}`,
      });
    }
    quarter += 1;
    if (quarter > 3) {
      quarter = 0;
      year += 1;
    }
  }
  return segments;
}

export function monthSegments(domainMin: number, domainMax: number): Segment[] {
  const segments: Segment[] = [];
  const d = new Date(domainMin);
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();
  while (true) {
    const start = Date.UTC(year, month, 1);
    const end = Date.UTC(year, month + 1, 1);
    if (start > domainMax) break;
    if (end >= domainMin) {
      segments.push({
        start: Math.max(start, domainMin),
        end: Math.min(end, domainMax),
        label: new Date(start).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      });
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return segments;
}

export function segmentsForTier(tier: Tier, domainMin: number, domainMax: number): Segment[] {
  if (tier === "quarter") return quarterSegments(domainMin, domainMax);
  if (tier === "month") return monthSegments(domainMin, domainMax);
  return [];
}
