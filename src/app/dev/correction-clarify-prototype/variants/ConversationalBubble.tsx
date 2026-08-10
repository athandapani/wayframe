"use client";

// PROTOTYPE — Variant 3: conversational bubble.
// Leans hardest into "this is an assistant, not a form": the ambiguous
// moment renders as a chat-style message from the AI ("I found N matches…"
// — first-person, a real follow-up question) with an avatar mark, pill
// candidates below it as the reply options. Most different in tone from
// what's shipped today; the resolved-preview state still uses the existing
// card shape underneath so the whole flow doesn't feel like two products.
import type { Theme } from "@/components/timeline/theme";
import { CorrectionInputBar, type Box } from "../shared";

function Avatar({ theme }: { theme: Theme }) {
  return (
    <span
      style={{ background: theme.accent, color: theme.panelBg }}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      aria-hidden="true"
    >
      AI
    </span>
  );
}

export function ConversationalBubble({ box, theme }: { box: Box; theme: Theme }) {
  const p = box.pending;
  const surface = { background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk };

  return (
    <>
      {p?.ambiguous && (
        <div className="fixed bottom-24 left-1/2 z-40 flex w-[560px] -translate-x-1/2 items-start gap-2">
          <Avatar theme={theme} />
          <div style={{ ...surface, borderWidth: 1 }} className="flex-1 rounded-2xl rounded-tl-sm border p-3 shadow-2xl">
            <p className="mb-2 text-sm">
              I found <strong>{p.ambiguous.candidates.length} milestones</strong> that could match &ldquo;{p.inputText}&rdquo;. Which one did you mean?
            </p>
            <div className="flex flex-col gap-1">
              {p.ambiguous.candidates.map((c) => (
                <button
                  key={c.milestone.id}
                  onClick={() => box.resolveAmbiguous(c.milestone.id)}
                  style={{ borderColor: theme.panelBorder }}
                  className="rounded-lg border px-2.5 py-1.5 text-left text-xs hover:border-current"
                >
                  <span className="font-medium">{c.milestone.title}</span>
                  <span className="opacity-50"> — {c.milestone.laneName}, set {c.newValue}</span>
                </button>
              ))}
            </div>
            <button onClick={box.discard} className="mt-2 text-[11px] opacity-50 hover:opacity-80">
              None of these — let me rephrase
            </button>
          </div>
        </div>
      )}

      {p && !p.ambiguous && p.edits.length > 0 && (
        <div className="fixed bottom-24 left-1/2 z-40 flex w-[560px] -translate-x-1/2 items-start gap-2">
          <Avatar theme={theme} />
          <div style={{ ...surface, borderWidth: 1 }} className="flex-1 rounded-2xl rounded-tl-sm border p-4 shadow-2xl">
            <p className="mb-2 text-sm">Here&apos;s what I&apos;ll change:</p>
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
        </div>
      )}

      {p && p.edits.length === 0 && !p.ambiguous && p.unresolved.length > 0 && (
        <div className="fixed bottom-24 left-1/2 z-40 flex w-[560px] -translate-x-1/2 items-start gap-2">
          <Avatar theme={theme} />
          <div style={{ ...surface, borderWidth: 1 }} className="flex-1 rounded-2xl rounded-tl-sm border p-3 text-sm shadow-2xl">
            I couldn&apos;t make sense of that as a request — try naming a milestone and what should change.
          </div>
        </div>
      )}

      <CorrectionInputBar box={box} theme={theme} />
    </>
  );
}
