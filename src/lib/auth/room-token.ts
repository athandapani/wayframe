// Short-lived, server-signed proof of *identity* (never of role) handed to
// the client so it can open a Partykit room WebSocket (wayframe#t16). The
// Partykit room verifies the signature and then looks up the caller's
// current role itself (party/src/membership.ts, against the same Turso
// database) — the token never carries a role, so a stale/replayed token
// can't grant more access than the holder currently has server-side.
//
// Web Crypto (`crypto.subtle`), not a JWT library: this needs to verify
// identically in two different runtimes (Next.js server + the Cloudflare
// Worker in party/, which duplicates this file's verify half since it
// can't import across the package boundary — see party/src/room-token.ts).
// Web Crypto is the one signing API both runtimes support natively.
//
// Deliberately doesn't import `authSecret` from ./auth.ts — pulling in
// next-auth's full NextAuth() bootstrap (which imports `next/server`)
// breaks module resolution under vitest, and this file's own tests need to
// import it directly. Same literal fallback duplicated instead, same
// "two separate packages/runtimes, kept in sync by hand" tradeoff
// party/db.ts already makes for its env vars — must match auth.ts's
// fallback exactly, or dev-mode tokens minted here fail to verify there.
const DEV_SECRET = "wayframe-dev-only-insecure-secret";
const authSecret = process.env.AUTH_SECRET ?? DEV_SECRET;

const ALGORITHM = { name: "HMAC", hash: "SHA-256" };
const DEFAULT_TTL_SECONDS = 300;

export interface RoomTokenPayload {
  sub: string;
  exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Return type pinned to the `ArrayBuffer`-backed variant (not the wider
// `ArrayBufferLike`, which the DOM lib's `@types/node`-influenced global
// `Uint8Array` type defaults to) — `crypto.subtle`'s `BufferSource`
// parameter type requires it, and a `new Uint8Array(n)` allocation is
// always `ArrayBuffer`-backed in practice, never `SharedArrayBuffer`.
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), ALGORITHM, false, ["sign", "verify"]);
}

/** Mints a room-access token proving `sub`'s identity for `ttlSeconds` (default 5 minutes — reconnects mint a fresh one via YProvider's refreshable `params`, so a short TTL costs nothing but limits how long a leaked token stays useful). */
export async function mintRoomToken(sub: string, ttlSeconds = DEFAULT_TTL_SECONDS, secret = authSecret): Promise<string> {
  const payload: RoomTokenPayload = { sub, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(ALGORITHM, key, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Verifies a room-access token's signature and expiry, returning its payload or null if either check fails. Never throws on malformed input — a bad token is just "not authorized," not a server error. */
export async function verifyRoomToken(token: string, secret = authSecret): Promise<RoomTokenPayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(ALGORITHM, key, fromBase64Url(signature), new TextEncoder().encode(body));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as RoomTokenPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
