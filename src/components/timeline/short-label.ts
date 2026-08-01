// Derives a compact abbreviation for a milestone marker's always-visible
// label (full title shows on hover — see RoadmapTimeline). The schema has
// no dedicated short-label field (see types.ts's header comment), so this
// is computed from the title: initials of its significant words. It won't
// always match what a human would hand-pick (e.g. "UL 3100 certification"
// -> "U3C", not "CERT") — a per-milestone override field is a reasonable
// follow-up if that gap matters in practice.

const STOPWORDS = new Set(["a", "an", "the", "of", "to", "for", "and", "or", "in", "on", "at", "with", "vs", "v"]);

export function deriveShortLabel(title: string, maxLen = 4): string {
  const words = title
    .replace(/[—–-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w.toLowerCase()));
  const initials = words.map((w) => w[0]!.toUpperCase()).join("");
  return initials.slice(0, maxLen) || title.slice(0, maxLen).toUpperCase();
}
