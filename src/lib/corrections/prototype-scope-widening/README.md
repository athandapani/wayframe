# PROTOTYPE — throwaway, do not build on

Answers one question for wayframe#38 item 1: **how far should the free-text
correction box be widened beyond date/status, and what does the resolver's
ambiguity-handling need to look like once it is?**

Concretely:

1. Should a mis-resolved `title`/`owner`/`comment` op be handled differently
   than a mis-resolved `date`/`status` op, given it's harder to eyeball as
   wrong?
2. #9's original prototype found a real false positive ("pilot" matching 3
   unrelated milestones on a shared word) with only date/status in scope.
   Does the existing preview-before-commit + skipped-with-reason pattern
   cover that risk once the field set is wider, or does ambiguity need a
   harder stop?
3. What does an "add a milestone" op need to require (lane, date) vs. infer,
   and what happens when the request can't place one anywhere sane?

`resolve.mts` is a naive, deliberately-imperfect stand-in for what a real
Claude tool-call would resolve — same trick #9's original prototype used
(hand-rolled keyword matching) specifically because a naive matcher
reproduces false positives on demand, which is the thing being stress-tested.
It is **not** a proposal for the real resolution algorithm; the real one
still calls Claude. What's under test is the *op shape* and the
*ambiguity-handling policy* around it, both of which are format/logic
concerns independent of who does the matching.

Fixture data (`fixture.mts`) is a trimmed, real subset of
`src/data/demo-roadmap.ts` — including the six milestones that genuinely
share the word "pilot" across three different lanes (`mech-5`, `mfg-3`,
`pilot-2..5`), plus one milestone titled "New milestone" to reproduce the
exact request that started this ("rename new milestone to Manufacturing
plan release" — the real bug report).

## Run it

```
node src/lib/corrections/prototype-scope-widening/tui.mts
```

(Node 24 strips TypeScript types natively — no build step, no new
dependency.)

## Try these

- `rename new milestone to Manufacturing plan release` — the exact request
  that failed for real. Should resolve cleanly now.
- `set the owner of Pilot Site 2 Go-Live to K. Simmons` — a wider-field op
  (owner), unambiguous target.
- `add a comment to Third-Party Safety Lab Testing: lab slot confirmed for October` — comment op.
- `mark the pilot milestone complete` — deliberately vague, hits all six
  "pilot" milestones equally. Toggle `/mode` to compare the two ambiguity
  policies on the exact same input.
- `add a manufacturing plan release milestone to the Manufacturing lane in Q1 '27` — add-op, lane + date both resolve.
- `add a launch-readiness milestone` — add-op with no lane mentioned at all;
  should refuse to place it rather than guess.

## Answer

**1. How far to widen the field set:** all the way — every `PatchOpSchema`
variant that already exists for the manual editor (title, owner, comment,
percentComplete, shortLabel, isCriticalPathOverride), not a curated subset.
Running real requests through it, the field being edited never turned out to
be the risky part — a `title`/`owner`/`comment` op resolved exactly as
cleanly as a `date`/`status` op whenever the *subject* was unambiguous
("set the owner of Pilot Site 2 Go-Live to K. Simmons" → one clean high-
confidence match, with the near-miss candidates listed as skipped-with-
reason). The risk lives entirely in reference resolution, not in which field
gets written — so it doesn't scale with the field count.

**2. Ambiguity policy: refuse, don't flag-and-emit.** Both policies were
built and run against the same deliberately ambiguous input ("mark the pilot
milestone complete", which ties across 5 milestones spanning 3 lanes — a
real collision already latent in the shipped demo data, not a contrived
one). `flag-low-confidence` emitted 5 low-confidence ops into the preview,
technically reviewable but pure toil — a human has to individually reject 4
of 5 rows to avoid marking unrelated milestones complete. `refuse-ambiguous`
emits nothing and lists all 5 as skipped with the tie explained, pushing the
user to re-phrase ("mark Pilot Site 3 complete") instead of auditing a
five-row diff. **`refuse-ambiguous` wins** — and it's not even a new
safeguard: `prompt.ts`'s system prompt already says "if you cannot
confidently resolve the request... return empty ops rather than guessing."
That instruction was written for a 2-field system and never actually
stress-tested against a wide field set; the answer is it still holds, just
needs to actually be enforced at the widened scope rather than assumed to
generalize.

**3. Add-milestone op shape: lane is required, date is optional.** A lane
that can't be resolved from the request refuses outright — there's no sane
default lane to guess. A date that can't be resolved does **not** refuse:
it emits a low-confidence add with `date: null`, which the real
implementation should route through the *existing* `addMilestone` reducer
action's own behavior (create empty, immediately open the editor modal) —
this isn't new state-machine behavior, it's the manual "+" path's own
fallback, reused. Confirmed live: "add a manufacturing plan release
milestone to the Manufacturing lane in Q1 '27" resolved both lane and date
cleanly (high confidence); "add a launch-readiness milestone" (no lane
mentioned) correctly refused rather than inventing a lane.

**One caught bug, worth noting because it says something about the real
Claude-backed version too:** the first pass filtered out single-character
tokens as noise, which silently dropped disambiguating digits — "Pilot Site
2 Go-Live" tied 3-way against Site 1 and Site 3 until that was fixed. A
naive local matcher can lose a distinguishing token this way; there's no
reason to assume Claude would (it reads the whole list with full context,
not a bag-of-words diff), but it's a concrete argument for keeping the real
system prompt's per-candidate reasoning ("id, title, and swimlane name
together") rather than ever downgrading to a cheaper local pre-filter later.

**Graduates to a Build ticket:** widen `tool-schema.ts`'s `field` enum to
the full `PatchOpSchema` set, add a new `add_milestone` tool op (required
`laneId`/lane-name, optional `date`), and tighten `prompt.ts`'s existing
"return empty ops" instruction to explicitly cover the wider field set
rather than relying on it generalizing unstated.
