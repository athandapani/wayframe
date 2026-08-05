/**
 * Greedy word-wrap for SVG text.
 *
 * SVG has no automatic wrapping — a <text> element renders on one line
 * however long it is — so multi-line labels have to be split here and
 * emitted as <tspan> rows by the caller.
 *
 * Width is measured in characters rather than pixels. A real measurement
 * would need canvas metrics or a DOM round-trip per label, and at these
 * sizes the chart is laid out on a character budget anyway; a long word
 * that would overflow is broken rather than allowed to run past its column.
 */
export function wrapText(text: string, maxChars: number, maxLines = Infinity, options: { breakWords?: boolean } = {}): string[] {
  // Marker labels pass breakWords:false — splitting mid-word in a narrow
  // column produces "Auton / omy…", which is worse than a clean "Autonomy…".
  // The header column keeps breaking, since a long word there has nowhere
  // else to go.
  const { breakWords = true } = options;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  const push = () => {
    if (current) lines.push(current);
    current = "";
  };

  for (const word of words) {
    if (lines.length >= maxLines) break;
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      push();
      current = word;
    }
    // A single word longer than the column either hard-breaks (so it can't
    // render straight through whatever sits beside it) or gets clipped.
    if (!breakWords) {
      if (current.length > maxChars) current = current.slice(0, Math.max(1, maxChars - 1)) + "…";
    } else {
      while (current.length > maxChars) {
        if (lines.length >= maxLines) break;
        lines.push(current.slice(0, maxChars));
        current = current.slice(maxChars);
      }
    }
  }
  push();

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = last.length > maxChars - 1 ? last.slice(0, maxChars - 1) + "…" : last + "…";
    return kept;
  }
  return lines;
}
