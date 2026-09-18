// At-rest encryption for the Google OAuth refresh token wayframe#t30 stores
// (see ../db/google-tokens.ts) — Web Crypto (`crypto.subtle`), matching
// room-token.ts's precedent for this repo's crypto needs, though this one
// only ever runs on the Next.js server (no Cloudflare Worker counterpart),
// so there's no second-runtime constraint forcing the choice here — kept
// consistent anyway rather than pulling in a Node-only crypto API for one
// module.
//
// The env var is hashed into a key (not used raw) so any string length
// works — a literal dev-only fallback string is far shorter than AES-256's
// 32-byte key requirement, and SHA-256 gives a fixed-size key regardless of
// input length without needing a KDF for what's already a high-entropy
// secret in production.
//
// `toBase64Url`/`fromBase64Url` are copied from room-token.ts rather than
// imported — same "small crypto helper duplicated by hand across modules
// that each have their own reason to stay import-light" precedent that
// file's own doc comment already establishes for its relationship to
// party/src/room-token.ts.
import { requireEnv } from "@/lib/server/env-guard";

if (process.env.NODE_ENV === "production") {
  requireEnv("TOKEN_ENCRYPTION_KEY");
}

const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? "wayframe-dev-only-insecure-token-key";

const ALGORITHM = "AES-GCM";
const IV_BYTES = 12;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(TOKEN_ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", digest, ALGORITHM, false, ["encrypt", "decrypt"]);
}

/** Encrypts `plain` (the refresh token) into a self-contained `base64url(iv).base64url(ciphertext)` string, safe to store in a TEXT column. */
export async function encryptToken(plain: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, new TextEncoder().encode(plain));
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Reverses `encryptToken`. Rejects (never returns garbage) on a malformed or tampered value — AES-GCM's auth tag makes a corrupted ciphertext fail decryption outright rather than silently producing wrong plaintext. */
export async function decryptToken(encoded: string): Promise<string> {
  const [ivPart, ciphertextPart] = encoded.split(".");
  if (!ivPart || !ciphertextPart) throw new Error("Malformed encrypted token — expected `iv.ciphertext`.");
  const key = await importKey();
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv: fromBase64Url(ivPart) }, key, fromBase64Url(ciphertextPart));
  return new TextDecoder().decode(plaintext);
}
