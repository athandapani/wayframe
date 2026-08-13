// PROTOTYPE (wayframe#70) — throwaway. Shared shapes/constants for the three
// axis-hierarchy control variants. Not wired into production code.

export type Tier2Unit = "none" | "quarter" | "month";
export type Tier3Unit = "none" | "month" | "week";

/** Level 3 must be finer-grained than whatever Level 2 is set to. */
export const TIER3_OPTIONS_FOR_TIER2: Record<Tier2Unit, Tier3Unit[]> = {
  none: ["none"],
  quarter: ["none", "month", "week"],
  month: ["none", "week"],
};

// A fixed preview domain (16 months) — long enough to show several year
// boundaries and quarters, dense enough at week-level to surface whether
// that tier is legible at a normal chart width.
export const DOMAIN_MIN = Date.UTC(2025, 9, 1);
export const DOMAIN_MAX = Date.UTC(2027, 1, 1);
