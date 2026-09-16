# Presence manual multi-browser protocol (t42)

Per t42's gist: presence (t36's avatar/selection UI, wired live in t38) is
ephemeral state with no convergent "correct final state" to assert against
the way Program content does — there's nothing for a headless multi-client
`Y.Doc` harness (`src/lib/realtime/multi-client-harness.ts`) to compare.
Instead, presence gets a written manual checklist, run by hand against a
real `wrangler dev` room before any collaborative feature ships. This is
**not** a substitute for automated coverage of the *data* layer underneath
presence (awareness state itself rides the same Yjs provider whose
convergence/offline-reconnect logic the harness and
`use-program-room.test.ts` already cover) — it exists only for the parts
that are irreducibly about real timing over a real WebSocket: how fast an
avatar appears, how it disappears, and whether the 5s disconnect grace
period actually feels right.

## Setup

1. `cd party && npm run dev` — boots the `ProgramRoom` Durable Object
   locally via `wrangler dev` (t4/t14's own verification pattern).
2. `npm run dev` in the app root, pointed at the local party dev URL.
3. Open the same `/p/[portfolioId]` URL in **two separate browser
   profiles** (not two tabs of the same profile — same-profile tabs can
   share a session/localStorage in ways that mask real cross-client
   behavior). Two different browsers (e.g. Chrome + Firefox), or two Chrome
   profiles, both work.
4. Sign in as two different identities (or one signed-in owner + one
   guest via the share link — `GuestNamePrompt.tsx`) so
   `use-program-room.ts`'s `colorFor(identity.identityKey)` assigns each
   client a visibly distinct avatar color.

## Checklist

Run this checklist top to bottom before shipping any change that touches
`use-program-room.ts`, `provider.ts`, `PresenceAvatars.tsx`,
`ConnectionStatusBadge.tsx`, or `party/src/index.ts`. Check off each line
against the real behavior observed, not the intended behavior — the point
of a manual protocol is to catch a mismatch between the two.

- [ ] **Avatar appears on join.** Client B opens the room after client A is
      already connected. Client A's `PresenceAvatars` row shows client B's
      avatar within a couple seconds of B's page finishing load — no manual
      refresh needed.
- [ ] **Avatar color is stable across a reload.** Client B reloads the
      page. Client A sees B's avatar disappear and reappear with the exact
      same color (derived from `identityKey`, not a random per-connection
      value).
- [ ] **Selection ring follows a click.** Client B clicks a milestone.
      Client A sees a colored selection ring (matching B's avatar color)
      appear around that exact milestone on A's own screen, live.
- [ ] **Selection ring clears.** Client B clicks empty canvas (deselects).
      Client A sees B's ring disappear.
- [ ] **Clean tab close removes the avatar promptly.** Client B closes its
      tab (not just backgrounds it). Client A's avatar list drops B —
      confirm this happens close to immediately, not after the full grace
      period below (a clean disconnect should be faster than a network
      drop).
- [ ] **The 5s disconnect grace period (`PEER_REMOVAL_GRACE_MS`,
      `use-program-room.ts`) actually holds for ~5s, not instantly and not
      much longer.** Simulate a network drop for client B (DevTools →
      Network → Offline, or kill Wi-Fi briefly) rather than closing the
      tab. Client A's avatar for B should **persist** for approximately 5
      seconds after the drop, then disappear if B hasn't returned.
- [ ] **A peer that reconnects within the grace window never flickers.**
      Repeat the drop above, but restore B's connection within ~2–3
      seconds. Client A's avatar for B should never have disappeared at
      all during that window (the reappearance-before-purge cancellation
      path in `use-program-room.ts`).
- [ ] **`ConnectionStatusBadge` shows for the disconnected client itself,
      debounced (~2.5s), not instantly.** With client B offline (per the
      drop above), confirm B's OWN screen shows the offline badge only
      after a brief delay, not flickering on for a sub-second network
      blip.
- [ ] **The offline badge clears the instant reconnection succeeds** (no
      debounce on the way back up) once B's connection is restored.
- [ ] **`ConflictBanner` appears for a real orphaned edit.** While B is
      offline, have A delete the milestone B is concurrently editing on
      B's own (offline) screen. Reconnect B. B's `ConflictBanner` should
      show a dismiss-only orphaned-edit notice; dismissing it should clear
      it without B's other edits being lost.
- [ ] **Badge and banner never visually collide.** With both an offline
      badge and a conflict banner showing at once (achievable by dropping
      B's connection right after triggering the orphan case above),
      confirm they render in their documented opposite screen corners
      (`RoadmapWorkspace.tsx`) and remain independently legible.

## When this needs re-running

Re-run this full checklist (not just the lines that look related) whenever
a change touches the awareness wiring, the room-connection hook's
timers/refs, or either presence-facing component — timing bugs in this
area are exactly the kind that a code review or an automated test won't
catch, only a real two-browser session will.
