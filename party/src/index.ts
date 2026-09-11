import { routePartykitRequest } from "partyserver";
import { YServer } from "y-partyserver";
import type { Connection } from "partyserver";

// Yjs + PartyServer per wayframe#t4's resolution — deployed cloud-prem
// (`npx wrangler deploy`, or `npm run deploy` here) to your own Cloudflare
// account: PartyKit's platform fee is $0 for cloud-prem, and Cloudflare
// made Durable Objects free on the Workers Free plan (~3M requests/month)
// in April 2025, so hosting this at showcase scale costs nothing. See
// wrangler.jsonc for the Durable Object binding.
//
// One room per Portfolio (room name = portfolio id) — Program and Scenario
// both attach as direct subdocuments of this room's top-level Y.Doc rather
// than nesting Scenario inside Program's subdoc, since Yjs doesn't
// reliably recognize a subdocument nested inside another subdocument.
// #t14 owns the exact Y.Map/subdoc shape; this class is just the
// connection/persistence boundary t4 was scoped to establish.
export class PortfolioRoom extends YServer {
  // t12 hasn't landed the per-Program read/write path yet — these are
  // stubs so t12 has a clear, single place to wire the real Turso calls
  // (getDbClient() from src/lib/db/client.ts can't be imported directly
  // here since this Worker is a separate deployable from the Next.js app;
  // it would call Turso's HTTP driver the same way, just duplicated).
  async onLoad() {
    // await loadPortfolioSnapshot(this.name) -> Y.applyUpdate(this.document, snapshot)
  }

  async onSave() {
    // await savePortfolioSnapshot(this.name, Y.encodeStateAsUpdate(this.document))
  }

  onConnect(connection: Connection) {
    console.log(`[wayframe-party] ${connection.id} joined room ${this.name}`);
  }
}

const worker = {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
};

export default worker;
