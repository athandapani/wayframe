import { routePartykitRequest } from "partyserver";
import { YServer } from "y-partyserver";
import type { Connection } from "partyserver";
import * as Y from "yjs";
import { appendProgramUpdate, loadProgramSnapshotsForPortfolio, type PartyEnv } from "./db";

// Yjs + PartyServer per wayframe#t4's resolution — deployed cloud-prem
// (`npx wrangler deploy`, or `npm run deploy` here) to your own Cloudflare
// account: PartyKit's platform fee is $0 for cloud-prem, and Cloudflare
// made Durable Objects free on the Workers Free plan (~3M requests/month)
// in April 2025, so hosting this at showcase scale costs nothing. See
// wrangler.jsonc for the Durable Object binding.
//
// One room per Portfolio (room name = portfolio id, i.e. `this.name`) —
// Program attaches as a direct Y.Doc subdocument of this room's top-level
// Y.Doc, per t14's gist ("Program is the subdocument/clock-space boundary,
// matches #86's one-row-per-Program"); Scenario nests inside its own
// Program's subdoc rather than the room doc directly (t14 corrected #87's
// original "Scenario subdocument" phrasing, since Yjs doesn't reliably
// recognize a subdoc nested inside another subdoc — only Program gets that
// top-level slot). #t14 still owns Scenario's exact nested-Y.Map shape;
// this file only establishes the room-level Program attachment convention
// it'll build on: each Program subdoc is stored under a shared
// `programs: Y.Map<string, Y.Doc>` on the room's top-level doc, keyed by
// program id, with each subdoc's own `guid` also set to that program id
// (so a "subdocs" event can identify which program a loaded/added subdoc
// is without a separate lookup).
const PROGRAMS_MAP_KEY = "programs";

// Subdocs whose `update` listener is already wired — a Yjs "subdocs" event
// can report the same doc as `loaded` more than once (e.g. once when this
// room creates it from a stored snapshot, once if a client's own "subdocs"
// round-trip re-surfaces it), and double-wiring would append every update
// to program_updates twice.
const wiredSubdocs = new WeakSet<Y.Doc>();

export class PortfolioRoom extends YServer<PartyEnv> {
  // t12's read/write topology (wayframe#t12's resolution): "one row per
  // Program... a separate append-only program_updates log is the realtime
  // write target". This class is exactly that write target — on room
  // start it loads each of this Portfolio's Program rows as a subdoc
  // (loadProgramSnapshotsForPortfolio), and every subsequent live edit to
  // any Program subdoc gets appended to program_updates as a raw Yjs
  // update, never touching the `programs` snapshot row itself. Periodic
  // compaction (folding program_updates back into `programs.snapshot`) is
  // src/lib/db/program-storage.ts's compactProgram, called from the
  // Next.js app side, not from here — this Worker only ever appends.
  //
  // Deliberately NOT implemented via the framework's own onLoad/onSave
  // hooks (the y-partyserver mixin calls onLoad once for the *room's*
  // top-level doc and debounces onSave off that same top-level doc's own
  // "update" event) — a Program subdoc's internal edits don't fire the
  // parent doc's "update" event at all in Yjs (subdocs have their own
  // independent update stream), so persistence has to be wired per-subdoc
  // here in onStart instead. onLoad/onSave stay as harmless no-ops (the
  // room's top-level doc only ever holds the `programs` Y.Map of subdoc
  // references, which is fully reconstructible from Turso on every room
  // start via the load step below, so there's nothing else for the
  // top-level doc's own onLoad/onSave to persist).
  async onStart() {
    await super.onStart();

    const portfolioId = this.name;
    const programsMap = this.document.getMap<Y.Doc>(PROGRAMS_MAP_KEY);

    // Persistence being unreachable (Turso misconfigured/down) shouldn't
    // take the whole room down with it — live sync between connected
    // clients has nothing to do with whether their edits can currently be
    // durably saved. Loading starts from an empty `programs` map instead;
    // it'll pick up real snapshots on the next room start once Turso's
    // reachable again. wireSubdocPersistence below has the matching
    // per-update guard for the same reason.
    try {
      const rows = await loadProgramSnapshotsForPortfolio(this.env, portfolioId);
      for (const row of rows) {
        if (programsMap.has(row.id)) continue;
        const subdoc = new Y.Doc({ guid: row.id });
        Y.applyUpdate(subdoc, row.snapshot);
        programsMap.set(row.id, subdoc);
      }
    } catch (err) {
      console.error(`[wayframe-party] failed to load Program snapshots for portfolio ${portfolioId}:`, err);
    }

    const wireSubdoc = (subdoc: Y.Doc) => {
      if (wiredSubdocs.has(subdoc)) return;
      wiredSubdocs.add(subdoc);
      subdoc.on("update", (update: Uint8Array) => {
        appendProgramUpdate(this.env, subdoc.guid, update).catch((err) => {
          console.error(`[wayframe-party] failed to persist update for program ${subdoc.guid}:`, err);
        });
      });
    };

    for (const subdoc of this.document.getSubdocs()) wireSubdoc(subdoc);
    this.document.on("subdocs", ({ loaded }) => {
      for (const subdoc of loaded) wireSubdoc(subdoc);
    });
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
