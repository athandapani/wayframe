import { getDbClient } from "./client";
import { ensureSchema } from "./schema";
import { encryptToken, decryptToken } from "@/lib/auth/token-crypto";

// Per-identity Google OAuth token storage (wayframe#t30's resolution) — see
// schema.ts's google_oauth_tokens table doc for why this is keyed by
// identity rather than Portfolio/Program. Granted once via the incremental
// consent flow (request-slides-access.ts + auth.ts's `jwt` callback, which
// is this module's only other caller), reused for every future export.
const SLIDES_SCOPE = "https://www.googleapis.com/auth/presentations";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** A comfortable safety margin before treating a cached access token as expired, so a token that's about to expire mid-request doesn't get used right up to the wire. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

export interface GoogleTokens {
  refreshToken: string;
  scope: string;
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
}

export interface SaveGoogleTokensParams {
  refreshToken: string;
  scope: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
}

/** Upserts the stored refresh token (encrypted) + granted scope for `identity`, along with whatever access token the same OAuth response carried. Called from auth.ts's `jwt` callback whenever Google issues a fresh refresh token (first consent, or a later incremental re-consent with `prompt=consent`). */
export async function saveGoogleTokens(identity: string, params: SaveGoogleTokensParams): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  const encrypted = await encryptToken(params.refreshToken);
  await client.execute({
    sql: `INSERT INTO google_oauth_tokens (identity, encrypted_refresh_token, scope, access_token, access_token_expires_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(identity) DO UPDATE SET
            encrypted_refresh_token = excluded.encrypted_refresh_token,
            scope = excluded.scope,
            access_token = excluded.access_token,
            access_token_expires_at = excluded.access_token_expires_at,
            updated_at = excluded.updated_at`,
    args: [identity, encrypted, params.scope, params.accessToken ?? null, params.accessTokenExpiresAt ?? null, new Date().toISOString()],
  });
}

/** Updates just the cached access token, leaving the stored refresh token/scope alone. Used both by the `jwt` callback (an access-token-only refresh with no new refresh_token) and by refreshAccessToken below (after a live token-endpoint round trip). */
export async function updateAccessToken(identity: string, accessToken: string, expiresAt: number): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({
    sql: `UPDATE google_oauth_tokens SET access_token = ?, access_token_expires_at = ?, updated_at = ? WHERE identity = ?`,
    args: [accessToken, expiresAt, new Date().toISOString(), identity],
  });
}

/** Reads back `identity`'s stored tokens, with the refresh token decrypted. Null if no row exists — "never granted" and "revoked-then-cleared" (see clearGoogleTokens) look identical here, which is exactly the unified failure state t30's retry UX wants. */
export async function getGoogleTokens(identity: string): Promise<GoogleTokens | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT encrypted_refresh_token, scope, access_token, access_token_expires_at FROM google_oauth_tokens WHERE identity = ?",
    args: [identity],
  });
  const row = result.rows[0];
  if (!row) return null;
  const refreshToken = await decryptToken(String(row.encrypted_refresh_token));
  return {
    refreshToken,
    scope: String(row.scope),
    accessToken: row.access_token == null ? null : String(row.access_token),
    accessTokenExpiresAt: row.access_token_expires_at == null ? null : Number(row.access_token_expires_at),
  };
}

/** True iff `identity` has ever granted both scopes the Slides export flow needs. Checked by substring, not exact match — Google's returned `scope` string can include the base openid/email/profile scopes alongside these two, and may reorder them. */
export async function hasSlidesScope(identity: string): Promise<boolean> {
  const tokens = await getGoogleTokens(identity);
  if (!tokens) return false;
  return tokens.scope.includes(SLIDES_SCOPE) && tokens.scope.includes(DRIVE_FILE_SCOPE);
}

/** Deletes `identity`'s stored tokens outright — called when a refresh attempt reveals the refresh token itself was revoked/expired, so the next status check reports "no valid token" (triggering re-consent) instead of repeatedly failing against a token that will never work again. */
export async function clearGoogleTokens(identity: string): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({ sql: "DELETE FROM google_oauth_tokens WHERE identity = ?", args: [identity] });
}

/** Remembers the Drive folder `identity` last picked as an export destination, reused silently by default per the gist (a "Change destination" affordance is the one-off opt-out, handled by the export UI, not here). */
export async function saveDriveFolder(identity: string, folderId: string, folderName: string): Promise<void> {
  const client = getDbClient();
  await ensureSchema(client);
  await client.execute({
    sql: "UPDATE google_oauth_tokens SET drive_folder_id = ?, drive_folder_name = ?, updated_at = ? WHERE identity = ?",
    args: [folderId, folderName, new Date().toISOString(), identity],
  });
}

export async function getDriveFolder(identity: string): Promise<{ folderId: string; folderName: string } | null> {
  const client = getDbClient();
  await ensureSchema(client);
  const result = await client.execute({
    sql: "SELECT drive_folder_id, drive_folder_name FROM google_oauth_tokens WHERE identity = ?",
    args: [identity],
  });
  const row = result.rows[0];
  if (!row || row.drive_folder_id == null) return null;
  return { folderId: String(row.drive_folder_id), folderName: String(row.drive_folder_name ?? "") };
}

interface GoogleTokenEndpointResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

/**
 * Returns a currently-valid access token for `identity`, refreshing against
 * Google's token endpoint only when the cached one is missing or close to
 * expiry — most calls are a pure DB read, no network round trip. Returns
 * `null` when there's nothing to refresh (never granted) or the refresh
 * token itself has been revoked (clears the row so the caller's next check
 * lands on the same "no valid token" state, unifying the two failure modes
 * per the gist's retry UX).
 */
export async function refreshAccessToken(identity: string): Promise<string | null> {
  const tokens = await getGoogleTokens(identity);
  if (!tokens) return null;

  if (tokens.accessToken && tokens.accessTokenExpiresAt && tokens.accessTokenExpiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return tokens.accessToken;
  }

  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: process.env.AUTH_GOOGLE_ID ?? "",
        client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      }),
    });
  } catch {
    // A network-level failure (DNS, timeout, offline) says nothing about
    // whether the refresh token itself is still good — clearing it here
    // would force a needless re-consent for a purely transient blip. Report
    // "couldn't get a token right now" without touching the stored row, so
    // the next attempt (or export retry) can just try again.
    return null;
  }

  const body = (await response.json().catch(() => ({}))) as GoogleTokenEndpointResponse;

  // Only a genuine rejection from Google (4xx — invalid_grant for a
  // revoked/expired refresh token, chief among them) means this refresh
  // token will never work again. A 5xx is Google's own transient failure,
  // not a verdict on the token, so it's treated the same as the network-
  // exception case above: report failure, but leave the row alone.
  if (response.status >= 400 && response.status < 500) {
    await clearGoogleTokens(identity);
    return null;
  }
  if (!response.ok || !body.access_token) {
    return null;
  }

  const expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
  await updateAccessToken(identity, body.access_token, expiresAt);
  return body.access_token;
}
