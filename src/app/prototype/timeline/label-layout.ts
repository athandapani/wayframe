// PROTOTYPE — shared label-collision-avoidance for milestone markers.
// Two independent label rows per lane: the short-form label above the
// marker, the date below. Each escalates through: tier 0 (closest) -> tier
// 1 (staggered further) -> tier 2 (pulled out further still, connected back
// to its marker with a thin leader line). Dates additionally shrink to a
// compact "8/4" format before resorting to tier 2. Answers wayframe issue
// #7 feedback: "always check if all info is legible."

export const PRIMARY_TIER_DY = [-15, -26, -38] as const; // above marker center
export const DATE_TIER_DY = [20, 32, 44] as const; // below marker center

const PRIMARY_CHAR_W = 6.5;
const DATE_CHAR_W = 5;
const MIN_GAP = 4;

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateCompact(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export interface TierPlacement {
  text: string;
  tier: 0 | 1 | 2;
}

export function layoutPrimaryLabels(items: { id: string; x: number; text: string }[]): Map<string, TierPlacement> {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const lastRight = [-Infinity, -Infinity];
  const result = new Map<string, TierPlacement>();
  for (const it of sorted) {
    const w = it.text.length * PRIMARY_CHAR_W + 6;
    let placed = false;
    for (const t of [0, 1] as const) {
      const left = it.x - w / 2;
      if (left > lastRight[t] + MIN_GAP) {
        lastRight[t] = it.x + w / 2;
        result.set(it.id, { text: it.text, tier: t });
        placed = true;
        break;
      }
    }
    if (!placed) result.set(it.id, { text: it.text, tier: 2 });
  }
  return result;
}

export function layoutDateLabels(items: { id: string; x: number; full: string; compact: string }[]): Map<string, TierPlacement> {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const lastRight = [-Infinity, -Infinity];
  const result = new Map<string, TierPlacement>();
  for (const it of sorted) {
    let placed = false;
    for (const mode of ["full", "compact"] as const) {
      const text = mode === "full" ? it.full : it.compact;
      const w = text.length * DATE_CHAR_W + 6;
      for (const t of [0, 1] as const) {
        const left = it.x - w / 2;
        if (left > lastRight[t] + MIN_GAP) {
          lastRight[t] = it.x + w / 2;
          result.set(it.id, { text, tier: t });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) result.set(it.id, { text: it.compact, tier: 2 });
  }
  return result;
}
