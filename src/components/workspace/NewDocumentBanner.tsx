"use client";

// One-time orientation nudge after starting a fresh roadmap (Archer delta
// v1.4.0) — a brand-new document (from the Midnight starter template or a
// blank entry point) has no other cue that it's already saving itself.
// Component-local dismiss state, not a persisted preference: this is a
// per-document "you're set up" note, not a recurring setting someone would
// want to keep off for every future document too.
import { useState } from "react";
import type { Theme } from "@/components/timeline/theme";

export function NewDocumentBanner({ theme }: { theme: Theme }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      style={{ background: "var(--wf-panel)", borderColor: theme.accent, color: "var(--wf-ink)" }}
      className="fixed top-16 left-1/2 z-50 flex w-[460px] -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-2.5 text-xs shadow-xl"
    >
      <span aria-hidden="true" className="mt-0.5 text-sm">
        ✦
      </span>
      <p className="flex-1">
        New roadmap started from a template — add lanes and milestones, or open a saved{" "}
        <code>.wayframe.json</code>. Every change autosaves in this browser as you go.
      </p>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="shrink-0 leading-none opacity-60 hover:opacity-100">
        ×
      </button>
    </div>
  );
}
