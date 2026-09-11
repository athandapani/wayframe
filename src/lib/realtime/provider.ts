"use client";

import * as Y from "yjs";
import YProvider from "y-partyserver/provider";

// Yjs + PartyServer per wayframe#t4's resolution — connects to the
// `party/` Cloudflare Worker (a separate deployable; Vercel serverless
// functions can't hold a long-lived WebSocket). One room per Portfolio:
// Program and Scenario attach as direct subdocuments of the room's
// top-level doc rather than nesting inside each other, since Yjs doesn't
// reliably recognize a subdocument nested inside another subdocument.
// #t12/#t14 own the exact document shape and connection lifecycle this
// scaffold will grow into; nothing in the app calls this yet.
const PARTY_HOST = process.env.NEXT_PUBLIC_PARTY_HOST ?? "localhost:8787";

export function connectPortfolioRoom(portfolioId: string, doc: Y.Doc): YProvider {
  return new YProvider(PARTY_HOST, portfolioId, doc, { party: "portfolio-room" });
}
