"use client";

import * as Y from "yjs";
import YProvider from "y-partyserver/provider";

// Yjs + PartyServer per wayframe#t4's resolution — connects to the
// `party/` Cloudflare Worker (a separate deployable; Vercel serverless
// functions can't hold a long-lived WebSocket). One room per PROGRAM (t14
// corrected the original one-room-per-Portfolio design after a live
// two-client test found Y.Doc subdocs don't reliably sync their content
// under y-partyserver): each Program's own PartyServer room IS its Yjs
// document directly, no subdoc indirection. `party: "program-room"` is the
// kebab-case of the `ProgramRoom` Durable Object binding (party/wrangler.jsonc)
// — partyserver's routing convention. #t14 owns the exact document shape
// (which top-level Y.Maps a Program's doc holds) and connection lifecycle
// this scaffold will grow into; nothing in the app calls this yet.
const PARTY_HOST = process.env.NEXT_PUBLIC_PARTY_HOST ?? "localhost:8787";

// wayframe#t16's two ways to open a room, mirroring party/src/index.ts's
// onBeforeConnect: a signed-in caller supplies `token`, a short-lived
// identity proof re-minted on every (re)connect — a function, not a plain
// string, since YProvider re-invokes it before each reconnect attempt
// (see y-partyserver/provider's `params` option), which is exactly what a
// token with a ~5-minute TTL needs. A public-link guest supplies
// `shareToken` instead, a long-lived token that never needs refreshing.
export type RoomAccess = { token: () => Promise<string> } | { shareToken: string };

export function connectProgramRoom(programId: string, doc: Y.Doc, access: RoomAccess): YProvider {
  const params = "token" in access ? async () => ({ token: await access.token() }) : { shareToken: access.shareToken };
  return new YProvider(PARTY_HOST, programId, doc, { party: "program-room", params });
}
