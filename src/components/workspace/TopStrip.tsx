"use client";

// The window's single top strip (wayframe#149).
//
// UX-2026-09-18 §3/§4/§5 replaced five independently hand-offset `fixed`
// islands with one flex row — but only on the RIGHT. The logo, the
// Executive/Program toggle and the account chip each stayed their own
// `fixed` island with a hand-picked offset, and independent islands at the
// same z-index don't reflow, they overlap: a centred `left-1/2` toggle sits
// wherever the viewport's midpoint is no matter how far left the right
// cluster has grown, and the account chip's `top-2 right-2` is inside the
// right cluster's own rectangle. With a long zoom range label
// (`Nov '25→Sep '27`) and the sync indicator (#121) both present, the
// "Program" label disappeared under the zoom thumb and "Syncing…" ran
// straight through the account chip.
//
// So this is the whole strip, not another island in it: one flex row across
// the window with three slots. Anything that grows pushes its neighbours
// instead of painting over them, and once the row is genuinely out of room
// it wraps. Slots are content-agnostic on purpose — #144 adds a Programs
// dropdown to the centre slot, which needs no change here.
//
// Two variants, because the two surfaces that host it differ in one real
// way. "fixed" floats over the chart (the single-Program workspace, whose
// chart scrolls under it) and is therefore pointer-transparent except for
// the slots themselves, since most of the row is empty space the chart still
// needs to receive clicks through. "flow" is an ordinary block at the top of
// a column layout (the combined editor, whose rail and dock are full-height
// siblings BELOW the strip) — nothing is underneath it to click through to,
// and taking it out of flow there would mean every one of those siblings
// needing a matching top inset.
export function TopStrip({
  left,
  center,
  right,
  variant = "fixed",
}: {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  variant?: "fixed" | "flow";
}) {
  return (
    <div
      className={
        (variant === "fixed"
          ? "pointer-events-none fixed inset-x-0 top-0 z-50"
          : "relative z-30 shrink-0 border-b border-zinc-200 dark:border-zinc-800") + " flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3"
      }
      style={variant === "flow" ? { background: "var(--wf-panel)" } : undefined}
      data-testid="top-strip"
    >
      <div className="pointer-events-auto flex shrink-0 items-center gap-2">{left}</div>
      {/* Centred between its neighbours rather than on the viewport's
          midpoint — which is what keeps it clear of a wide right cluster
          instead of underneath it. */}
      <div className="pointer-events-auto flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2">{center}</div>
      <div className="pointer-events-auto flex min-w-0 flex-wrap items-center justify-end gap-2">{right}</div>
    </div>
  );
}
