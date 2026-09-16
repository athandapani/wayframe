"use client";

// Debounced offline-status badge (wayframe t38, fork 3) — a pure render of
// `useProgramRoom`'s already-debounced `showOfflineBadge` boolean (see that
// hook's own doc comment: true only once a drop has been continuously
// disconnected for ~2.5s, cleared instantly the moment it reconnects). No
// timing logic belongs here — see this ticket's gist: "reconnect is silent —
// the badge just clears, no toast," so this component renders nothing (not
// even a brief flash) the instant `show` flips false. No close button either
// (same "silent" requirement — a dismiss control would fight the
// auto-clear-on-reconnect behavior). Amber/warning-toned to match this
// route's other small fixed-position notice — the old (now-removed)
// "You're viewing a snapshot..." banner in src/app/p/[portfolioId]/page.tsx's
// git history used the same border-amber-300/bg-amber-50/text-amber-800
// treatment. Positioned bottom-right, a corner nothing else in
// RoadmapWorkspace.tsx claims (the correction bar owns bottom-center, every
// other fixed notice lives in the top half) so it never collides with the
// (differently-toned, differently-positioned) ConflictBanner.
export function ConnectionStatusBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-40 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-800 shadow"
    >
      Offline — changes will sync when you&apos;re back online.
    </div>
  );
}
