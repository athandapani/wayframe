"use client";

// PROTOTYPE — Variant 2: evolved preview card.
// The smallest structural change from what's already shipped: production's
// CorrectionBox.tsx already renders a gray "skipped: X (reason)" dead-end
// line for exactly this case — this variant is that same line turned into
// an actionable row, in the same card. Familiar shape, one new affordance.
import type { Theme } from "@/components/timeline/theme";
import { CorrectionInputBar, type Box } from "../shared";

export function EvolvedPreviewCard({ box, theme }: { box: Box; theme: Theme }) {
  const p = box.pending;
  const surface = { background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk };
  const hasContent = p && (p.edits.length > 0 || p.ambiguous || p.unresolved.length > 0);

  return (
    <>
      {hasContent && (
        <div style={{ ...surface, borderWidth: 1 }} className="fixed bottom-24 left-1/2 z-40 w-[560px] -translate-x-1/2 rounded-xl border p-4 shadow-2xl">
          <p className="mb-2 text-xs font-semibold tracking-wide uppercase opacity-60">Proposed correction</p>
          <ul className="mb-3 space-y-1.5 text-sm">
            {p!.edits.map((e) => (
              <li key={e.targetId}>
                <span className="font-medium">{e.targetTitle}</span>: {e.field} → <span className="font-semibold" style={{ color: theme.accent }}>{e.newValue}</span>
              </li>
            ))}
            {p!.ambiguous?.candidates.map((c) => (
              <li key={c.milestone.id} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 -mx-1.5" style={{ background: `${theme.accent}0d` }}>
                <span className="opacity-80">
                  <span className="font-medium opacity-100">{c.milestone.title}</span>
                  <span className="opacity-60"> ({c.milestone.laneName})</span> — could set {c.newValue}
                </span>
                <button
                  onClick={() => box.resolveAmbiguous(c.milestone.id)}
                  style={{ borderColor: theme.accent, color: theme.accent }}
                  className="shrink-0 rounded border px-2 py-0.5 text-xs font-medium hover:text-white hover:[background:var(--hover-bg)]"
                >
                  Use this →
                </button>
              </li>
            ))}
          </ul>
          {p!.ambiguous && <p className="mb-3 text-xs opacity-50">{p!.ambiguous.candidates.length} milestones matched equally — pick one, or discard and rephrase.</p>}
          {p!.unresolved.map((u) => (
            <p key={u} className="mb-3 text-xs opacity-60">
              {u}
            </p>
          ))}
          <div className="flex gap-2">
            {p!.edits.length > 0 && (
              <button onClick={box.apply} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: theme.accent }}>
                Apply
              </button>
            )}
            <button onClick={box.discard} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: theme.panelBorder }}>
              Discard
            </button>
          </div>
        </div>
      )}

      <CorrectionInputBar box={box} theme={theme} />
    </>
  );
}
