// Verify-only duplicate of src/lib/auth/room-token.ts's mint/verify pair
// (wayframe#t16) — this Worker only ever checks tokens the Next.js app
// minted, never mints its own, but the verify logic itself has to be
// byte-identical (same HMAC-SHA256-over-base64url scheme) since the two
// runtimes can't share a module across the package boundary (see
// party/src/db.ts's comment for the same constraint on the DB layer).
// `AUTH_SECRET` must be set to the exact same value in both places —
// `wrangler secret put AUTH_SECRET` here, `AUTH_SECRET` in the Next.js
// app's env — or every token verification fails closed.
const ALGORITHM = { name: "HMAC", hash: "SHA-256" };

export interface RoomTokenPayload {
  sub: string;
  exp: number;
}

// See src/lib/auth/room-token.ts's identical helper for why the return type
// is pinned to the `ArrayBuffer`-backed `Uint8Array` variant.
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), ALGORITHM, false, ["verify"]);
}

export async function verifyRoomToken(token: string, secret: string): Promise<RoomTokenPayload | null> {
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
