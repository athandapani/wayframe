"use client";

// PROTOTYPE — Variant 1: inline chips.
// The ambiguous moment stays inline, right where the resolved preview
// would normally appear — a single compact row of candidate chips, no
// extra chrome. Fastest to scan, but a long candidate list or long titles
// get cramped fast (see README).
import type { Theme } from "@/components/timeline/theme";
import { CorrectionInputBar, type Box } from "../shared";

export function InlineChipsBar({ box, theme }: { box: Box; theme: Theme }) {
  const p = box.pending;
  const surface = { background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk };

  return (
    <>
      {p?.ambiguous && (
        <div style={{ ...surface, borderWidth: 1 }} className="fixed bottom-24 left-1/2 z-40 w-[560px] -translate-x-1/2 rounded-xl border p-3 shadow-2xl">
          <p className="mb-2 text-xs opacity-70">
            <span className="font-semibold">{p.ambiguous.candidates.length} matches</span> for &ldquo;{p.inputText}&rdquo; — which one?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {p.ambiguous.candidates.map((c) => (
              <button
                key={c.milestone.id}
                onClick={() => box.resolveAmbiguous(c.milestone.id)}
                style={{ borderColor: theme.panelBorder }}
                className="rounded-full border px-2.5 py-1 text-xs hover:border-current"
              >
                {c.milestone.title} <span className="opacity-50">· {c.milestone.laneName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {p && !p.ambiguous && p.edits.length > 0 && (
        <div style={{ ...surface, borderWidth: 1 }} className="fixed bottom-24 left-1/2 z-40 w-[560px] -translate-x-1/2 rounded-xl border p-4 shadow-2xl">
          <p className="mb-2 text-xs font-semibold tracking-wide uppercase opacity-60">Proposed correction</p>
          <ul className="mb-3 space-y-1 text-sm">
            {p.edits.map((e) => (
              <li key={e.targetId}>
                <span className="font-medium">{e.targetTitle}</span>: {e.field} → <span className="font-semibold" style={{ color: theme.accent }}>{e.newValue}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={box.apply} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: theme.accent }}>
              Apply
            </button>
            <button onClick={box.discard} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: theme.panelBorder }}>
              Discard
            </button>
          </div>
        </div>
      )}

      {p && p.edits.length === 0 && !p.ambiguous && p.unresolved.length > 0 && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white shadow-lg">{p.unresolved[0]}</div>
      )}

      <CorrectionInputBar box={box} theme={theme} />
    </>
  );
}
