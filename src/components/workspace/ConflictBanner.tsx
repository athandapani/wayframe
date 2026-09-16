"use client";

// Persistent, dismiss-only orphaned-edit conflict banner (wayframe t38, fork
// 3) — renders fork 1's `ProgramConflict[]` (already deduped/persistent
// state living in `box.conflicts`, populated by fork 2's room-connection
// hook via `detectOrphanedEdits`). Per this ticket's gist: "never silently
// dropped, never resurrected" — so there's no auto-hide timer here; a
// conflict only leaves the list when `onDismiss` is called for it (or a
// fresh page load/reconnect starts with whatever fork 1's reducer still has,
// nothing new to build for that here).
//
// Deliberately red/error-toned (matching the existing fileError notice a few
// lines up in RoadmapWorkspace.tsx — border-red-400/bg-red-50/text-red-800,
// same dark-mode pair) rather than the amber ConnectionStatusBadge uses: a
// conflict is a user-actionable notice about lost context, not ambient
// status, and the two are deliberately positioned on opposite sides of the
// screen so they never visually collide when both are showing at once.
import type { ProgramConflict } from "@/lib/realtime/program-conflict";

export function ConflictBanner({ conflicts, onDismiss }: { conflicts: ProgramConflict[]; onDismiss: (targetId: string) => void }) {
  if (conflicts.length === 0) return null;
  return (
    <div role="alert" className="fixed top-16 left-4 z-50 flex w-[320px] flex-col gap-1.5">
      {conflicts.map((conflict) => (
        <div
          key={conflict.targetId}
          className="flex items-start justify-between gap-2 rounded-lg border border-red-400 bg-red-50 p-2.5 text-xs text-red-800 shadow dark:bg-red-950 dark:text-red-200"
        >
          <p>{conflict.message}</p>
          <button
            onClick={() => onDismiss(conflict.targetId)}
            aria-label="Dismiss conflict"
            className="shrink-0 leading-none opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
