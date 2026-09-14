import { routePartykitRequest } from "partyserver";
import { YServer } from "y-partyserver";
import type { Connection, ConnectionContext, Lobby } from "partyserver";
import * as Y from "yjs";
import { appendProgramUpdate, loadProgramSnapshot, type PartyEnv } from "./db";
import { resolveProgramRole, resolveShareLinkRole, type Role } from "./membership";
import { verifyRoomToken } from "./room-token";

// Same dev-only fallback literal as src/lib/auth/auth.ts's `authSecret` —
// keeps `wrangler dev` usable without a `.dev.vars` file, matching how
// TURSO_DATABASE_URL/TURSO_AUTH_TOKEN already work here (see db.ts).
// Production deploys must set a real `AUTH_SECRET` via `wrangler secret
// put`, matching the Next.js app's exactly, or every token fails to verify.
const DEV_SECRET = "wayframe-dev-only-insecure-secret";

interface ConnectionState {
  role: Role;
}

/**
 * wayframe#t16's "enforced server-side at the Partykit room, not
 * client-side" clause — runs in the Worker, before the Durable Object is
 * even reached, so an unauthorized WebSocket upgrade never gets that far.
 * Two ways in:
 *  - `?token=` — a short-lived identity token minted by the Next.js app's
 *    `/api/rooms/[programId]/token` route (room-token.ts). The token only
 *    proves *identity*; the role is looked up fresh here, never trusted
 *    from the token, so a still-valid-but-stale token can't outlive a
 *    since-revoked membership.
 *  - `?shareToken=` — a public share-link token (src/lib/db/portfolios.ts's
 *    createShareLink), resolved straight against the DB with no signing
 *    step, since a share link's whole point is that holding it *is* the
 *    proof. Grants a fresh per-connection guest identity — never written
 *    to `portfolio_members`, since a public link isn't a fourth role.
 * Anything else (no param, bad signature, expired, unknown program/token)
 * is rejected with 403 before the Durable Object ever sees the request —
 * this is also how an uninvited, unsigned-in visitor never gets a hosted
 * room at all, per the ticket's "never a hosted row" clause.
 */
// `routePartykitRequest` invokes this with exactly `(req, lobby)` — no
// `env` parameter — so `env` has to come in via closure from `worker.fetch`
// below rather than as a third argument here.
function makeOnBeforeConnect(env: PartyEnv) {
  return async function onBeforeConnect(req: Request, lobby: Lobby<PartyEnv>): Promise<Request | Response> {
    const url = new URL(req.url);
    const programId = lobby.name;
    const secret = env.AUTH_SECRET ?? DEV_SECRET;

    const token = url.searchParams.get("token");
    if (token) {
      const payload = await verifyRoomToken(token, secret);
      if (!payload) return new Response("Forbidden", { status: 403 });
      const role = await resolveProgramRole(env, programId, payload.sub);
      if (!role) return new Response("Forbidden", { status: 403 });
      return withIdentityHeaders(req, payload.sub, role);
    }

    const shareToken = url.searchParams.get("shareToken");
    if (shareToken) {
      const role = await resolveShareLinkRole(env, programId, shareToken);
      if (!role) return new Response("Forbidden", { status: 403 });
      return withIdentityHeaders(req, `guest:${crypto.randomUUID()}`, role);
    }

    return new Response("Forbidden", { status: 403 });
  };
}

function withIdentityHeaders(req: Request, identity: string, role: Role): Request {
  const headers = new Headers(req.headers);
  headers.set("x-wf-identity", identity);
  headers.set("x-wf-role", role);
  return new Request(req, { headers });
}

// Yjs + PartyServer per wayframe#t4's resolution — deployed cloud-prem
// (`npx wrangler deploy`, or `npm run deploy` here) to your own Cloudflare
// account: PartyKit's platform fee is $0 for cloud-prem, and Cloudflare
// made Durable Objects free on the Workers Free plan (~3M requests/month)
// in April 2025, so hosting this at showcase scale costs nothing. See
// wrangler.jsonc for the Durable Object binding.
//
// One room per PROGRAM (room name = program id, i.e. `this.name`) — t14
// corrected the original one-room-per-Portfolio-with-Program-subdocs design
// after a live two-client `wrangler dev` test (done during t12) found that a
// Y.Doc subdoc's *content* never reliably syncs to a second client under
// y-partyserver, even after an explicit `.load()` — only the subdoc
// *reference* syncs. Rather than build around that gap, Program itself is
// now the room boundary: this room's own top-level `this.document` IS the
// Program's Yjs document, no subdoc indirection at all. This also lines up
// better with t12's own one-row-per-Program storage granularity than the
// old per-Portfolio room ever did.
//
// Scenario (t13/#87's sparse delta-list: milestoneOverrides/
// topLevelItemOverrides/milestoneAdditions/topLevelItemAdditions, each keyed
// by id) nests as a `scenarios: Y.Map<string, Y.Map>` directly on this same
// top-level doc, keyed by scenario id — not as a subdoc of anything, and not
// nested inside a Program subdoc either, since there's no Program subdoc
// left to nest inside. This is a documentation-only convention for now:
// nothing in the codebase yet constructs a Program's internal Y.Map layout
// (lanes/milestones/topLevelItems/scenarios) from its JSON shape — that
// client<->Yjs bridge doesn't exist yet. Whichever future ticket wires up
// real live editing through Yjs owns building that bridge and is free to
// use this `scenarios` key name; this file only reserves the convention,
// same "scaffolded but unconsumed" caveat t4/t13/t36 already carry.
export class ProgramRoom extends YServer<PartyEnv> {
  // t12's read/write topology (wayframe#t12's resolution): "one row per
  // Program... a separate append-only program_updates log is the realtime
  // write target". This class is exactly that write target — on room start
  // it loads this Program's row (loadProgramSnapshot, keyed by `this.name`,
  // the program id) into the room's own top-level doc, and every subsequent
  // live edit gets appended to program_updates as a raw Yjs update, never
  // touching the `programs` snapshot row itself. Periodic compaction
  // (folding program_updates back into `programs.snapshot`) is
  // src/lib/db/program-storage.ts's compactProgram, called from the Next.js
  // app side, not from here — this Worker only ever appends.
  //
  // Deliberately NOT implemented via the framework's own onLoad/onSave hooks
  // (the y-partyserver mixin debounces onSave off the doc's own "update"
  // event and expects it to return/persist a full snapshot) — t12's
  // topology wants every update appended individually to the log, not a
  // debounced whole-doc snapshot write, so persistence is wired by hand
  // below instead. onLoad/onSave stay as harmless no-ops.
  //
  // `onStart` runs once per Durable Object instance (a fresh instance is
  // created per room, and PartyServer only calls this once during that
  // instance's setup), so no de-dupe guard is needed around wiring the
  // "update" listener the way the old per-subdoc version needed one for
  // subdocs that could resurface via multiple "subdocs" events.
  async onStart() {
    await super.onStart();

    const programId = this.name;

    // Persistence being unreachable (Turso misconfigured/down) shouldn't
    // take the whole room down with it — live sync between connected
    // clients has nothing to do with whether their edits can currently be
    // durably saved. Starting from an empty doc instead; it'll pick up the
    // real snapshot on the next room start once Turso's reachable again.
    try {
      const snapshot = await loadProgramSnapshot(this.env, programId);
      if (snapshot) Y.applyUpdate(this.document, snapshot);
    } catch (err) {
      console.error(`[wayframe-party] failed to load Program snapshot for ${programId}:`, err);
    }

    this.document.on("update", (update: Uint8Array) => {
      appendProgramUpdate(this.env, programId, update).catch((err) => {
        console.error(`[wayframe-party] failed to persist update for program ${programId}:`, err);
      });
    });
  }

  // Was previously declared as `onConnect(connection: Connection)` — a
  // single-arg override that fully replaces YServer's own `onConnect`
  // (the sync-step1 + awareness-state handshake every newly connecting
  // client needs) rather than extending it, since JS method overriding
  // doesn't call the parent implementation implicitly. That meant a
  // second client connecting to an already-running room never received
  // the room's current document state — only its own local edits synced
  // out via broadcast, not the state that predated its connection. Fixed
  // in passing while adding wayframe#t16's role capture, since both need
  // this same method: `super.onConnect` now runs the handshake, and the
  // role onBeforeConnect resolved (carried via the `x-wf-role` header
  // onBeforeConnect set on the request that reached this Durable Object)
  // gets stored in per-connection state for `isReadOnly` to check.
  onConnect(connection: Connection<ConnectionState>, ctx: ConnectionContext) {
    const role = (ctx.request.headers.get("x-wf-role") as Role | null) ?? "viewer";
    connection.setState({ role });
    console.log(`[wayframe-party] ${connection.id} joined room ${this.name} as ${role}`);
    super.onConnect(connection, ctx);
  }

  // y-partyserver's own write-gating hook (wired into its sync-protocol
  // handling in handleMessage) — a viewer's incoming updates are decoded
  // and acknowledged but never applied to `this.document`, while sync
  // reads and awareness (cursor/presence) messages still flow normally.
  // This is wayframe#t16's actual enforcement point: the role itself was
  // already resolved server-side in onBeforeConnect/onConnect above, never
  // read from anything the client controls.
  isReadOnly(connection: Connection<ConnectionState>): boolean {
    return connection.state?.role === "viewer";
  }
}

const worker = {
  async fetch(request: Request, env: PartyEnv): Promise<Response> {
    return (
      (await routePartykitRequest(request, env, { onBeforeConnect: makeOnBeforeConnect(env) })) ??
      new Response("Not found", { status: 404 })
    );
  },
};

export default worker;
