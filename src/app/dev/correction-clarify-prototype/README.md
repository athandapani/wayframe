# PROTOTYPE — throwaway, do not build on

Follow-up to wayframe#38 item 1, raised live: the correction box should
"genuinely feel like agentic AI-assisted support," not "I don't do this,
I'm not sure." The scope-widening prototype (`prototype-scope-widening/`,
same branch) validated the *policy* — refuse an ambiguous match rather
than silently guess — but never touched the *experience* of being refused.
Production's real failure mode today (`use-correction-box.ts`) is a flat
`No milestones matched "X"` red banner with nothing to do next. That's the
actual gap this answers.

Three structurally different ways to present the same already-validated
ambiguous-match data (the resolver's `ambiguous.candidates`, unchanged),
mounted over the real demo chart so applying a correction visibly updates
it, switchable via `?variant=` on `/dev/correction-clarify-prototype`:

- **1 — Inline chips.** The ambiguous moment appears in the same slot the
  resolved-preview card would use — one compact row of candidate chips,
  no extra chrome, no explanatory sentence beyond a one-liner. Fastest to
  scan for 2-3 candidates; a long list or long titles get cramped (see
  below — this is exactly what happened testing it).
- **2 — Evolved preview card.** The smallest real change from what's
  shipped: production's `CorrectionBox.tsx` already renders a gray
  `skipped: X (reason)` dead-end line for this exact case. This variant is
  that same line turned into an actionable row — a "Use this →" button —
  inside the same card shape as today's resolved-preview.
- **3 — Conversational bubble.** Leans hardest into "assistant, not form":
  a chat-style message bubble with an avatar mark, first-person copy ("I
  found 3 milestones that could match…"), pill-shaped candidates as the
  reply options, and an explicit "None of these — let me rephrase" escape
  hatch. Most different in tone from what's shipped.

The resolved-preview state (once a candidate is picked, or the request
resolved unambiguously) reuses each variant's own card shape rather than
snapping back to one shared design — so picking a candidate feels like a
continuation of that variant's conversation, not a reset.

## Run it

```
npm run dev
```

Then visit `http://localhost:3000/dev/correction-clarify-prototype`. Try
`mark the pilot milestone complete` in every variant — it's a genuine
5-way tie across 3 lanes in the real demo data (not staged), the same
false-positive shape #9 originally found. Also try an unambiguous request
like `push Pilot Site 3 Go-Live by two weeks` to see the normal resolved
path, and something unparseable like `asdf` to see the fallback.

## Answer

**Variant 3's framing wins, scoped to the moments that actually need it.**
Drove all three live, including the genuine 6-way tie the real demo data
produces (one more than the trimmed logic-prototype fixture found — the
full dataset has an extra "Pilot Site Selection (3 warehouses)" milestone
sharing the word). All three resolve correctly end-to-end: pick a
candidate → normal preview → Apply → the real chart visibly updates
(watched a gray "not-started" diamond flip to green "complete" live).

- **1 (inline chips)** is fast but reads like a search-results widget —
  "6 matches — which one?" is accurate, not warm. Doesn't say anything a
  human troubleshooting search filters wouldn't say.
- **2 (evolved preview card)** is the safest ship — smallest diff from
  what's live today, and its "could set complete" per-row preview is
  genuinely more informative than 1's bare chips. Still reads as a
  diff/form, third person throughout.
- **3 (conversational bubble)** is the one that actually answers what was
  asked. "I found 6 milestones that could match X. Which one did you
  mean?" is a real question, in first person, with an explicit "None of
  these — let me rephrase" exit — the ambiguity becomes a shared
  problem-solving moment instead of a wall. This is the literal shape of
  "capable assistant" vs. "I don't do this."

**But not everywhere.** This prototype applied variant 3's bubble to
*every* pending state, including clean unambiguous resolutions ("Here's
what I'll change:") — driving it that way surfaced that the bubble treatment
earns its keep specifically where the AI needs something *from* the human
(a clarifying answer, or the unresolved-request case), not on every
successful match. A clean single-candidate resolution isn't a moment of
uncertainty — dressing it up as a conversational turn every time would
read as performative, not more capable, and cost real vertical space for
no reason. **Recommendation: keep today's efficient "Proposed correction"
card for clean resolutions (matches Variant 1/2's unchanged behavior
here); use Variant 3's first-person, question-asking bubble specifically
for the ambiguous-match and unparseable-request states** — the two moments
that are actually the "I don't do this, I'm not sure" experience being
fixed.

**Graduates to a Build ticket**, alongside wayframe#38 item 1's widened
tool-schema/prompt work (same subsystem, same PR): add the `ambiguous`
shape to the real `CorrectionResponseSchema`/`/api/correct` (the resolver
already computes it — `resolve.mts`'s `AmbiguousChoice`, proven against a
real 6-way tie), and build the conversational clarify component for
`CorrectionBox.tsx`/`CorrectionSidebar.tsx`, gated to the ambiguous/
unresolved states only.
