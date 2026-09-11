import { createClient, type Client } from "@libsql/client";
import { hasEnv, requireEnv } from "@/lib/server/env-guard";

// Server-only — Turso/libSQL per wayframe#t3's resolution: sub-20ms
// embedded-replica reads, ~1GB row limit (fits today's inline base64
// companyLogo.dataUrl / attachments[].url), free branching for Vercel PR
// previews. D1 was ruled out for its 2MB row cap.
let client: Client | undefined;

/** Local file DB when TURSO_DATABASE_URL isn't set, so dev/tests don't need a live Turso project. Fails closed in production instead of silently writing to a throwaway file. */
export function getDbClient(): Client {
  if (client) return client;

  if (!hasEnv("TURSO_DATABASE_URL")) {
    if (process.env.NODE_ENV === "production") requireEnv("TURSO_DATABASE_URL");
    client = createClient({ url: "file:.data/wayframe-dev.db" });
    return client;
  }

  client = createClient({
    url: requireEnv("TURSO_DATABASE_URL"),
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return client;
}
