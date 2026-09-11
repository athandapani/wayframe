# wayframe-party

The realtime CRDT backend, per [wayframe#t4](../.wayfinder/tickets-meta.json)'s
resolution: Yjs + PartyServer (the current library form of PartyKit, since
Cloudflare's April 2024 acquisition open-sourced it), running as a Cloudflare
Worker + Durable Object. This is a **separate deployable from the Next.js app**
— the app stays on Vercel (Vercel serverless functions can't hold a long-lived
WebSocket); this is the piece that can.

One room per Portfolio (room name = portfolio id). Program and Scenario both
attach as direct subdocuments of the room's top-level `Y.Doc` — not nested
inside each other — since Yjs doesn't reliably recognize a subdocument nested
inside another subdocument. `onLoad`/`onSave` are stubbed pending t12's
per-Program storage design; wire them to Turso (t3) once that lands.

## Local dev

```bash
npm install
npm run dev   # wrangler dev — local Durable Object, no Cloudflare account needed
```

## Deploying (cloud-prem — your own Cloudflare account, $0 platform fee)

```bash
CLOUDFLARE_ACCOUNT_ID=<your account id> CLOUDFLARE_API_TOKEN=<token with the "Edit Cloudflare Workers" template> \
  npm run deploy
```

Requires only a free Cloudflare account. Cloudflare made Durable Objects
available on the **Workers Free plan** (~3M requests/month, no billing
commitment) in April 2025, so hosting this at wayframe's showcase scale costs
nothing — no separate PartyKit account or paid plan is involved.

## `wrangler` version pin

`wrangler` is pinned to an exact `4.100.0` (not a caret range) because
`y-partyserver@2.2.0`'s `@cloudflare/workers-types` peer range
(`^4.20260424.1`) hasn't caught up to the `@cloudflare/workers-types` v5 split
that current `wrangler` releases (`4.110.0`+) require — installing the latest
`wrangler` alongside `y-partyserver` produces an unresolvable peer conflict.
Safe to bump once `y-partyserver` widens its peer range; check
`npm view y-partyserver peerDependencies` before touching this.

## Client side

The Next.js app connects via `y-partyserver/provider` (or its React hook,
`y-partyserver/react`) pointed at this Worker's URL, room = portfolio id. See
`src/lib/realtime/provider.ts` in the main app.
