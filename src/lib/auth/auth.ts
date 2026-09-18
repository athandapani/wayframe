import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { requireEnv } from "@/lib/server/env-guard";
import { getGoogleTokens, saveGoogleTokens, updateAccessToken } from "@/lib/db/google-tokens";

// Server-only — Auth.js v5 per wayframe#t5's resolution: JWT sessions (no
// session table needed), Google sign-in requests only the default
// openid/email/profile scope. Slides/Drive access is requested later,
// incrementally, via requestGoogleSlidesAccess() (see scopes.ts) so a
// public-showcase visitor isn't shown Google's unverified-app warning just
// to sign in — hand-rolling this flow was ruled out in favor of Auth.js's
// built-in provider/session handling.
if (process.env.NODE_ENV === "production") {
  requireEnv("AUTH_GOOGLE_ID");
  requireEnv("AUTH_GOOGLE_SECRET");
  requireEnv("AUTH_SECRET");
}

// Auth.js requires a secret unconditionally (no dev auto-generation in this
// version) — fall back to a fixed, clearly-labeled dev-only value so
// `npm run dev`/tests work without a manual step; requireEnv above already
// blocks this path in production.
//
// wayframe#t16's room-token.ts signs with this exact same env var/fallback
// (duplicated there rather than imported — importing this module pulls in
// NextAuth's full bootstrap, which breaks under vitest's module resolution)
// so a room-access token verifies against the same secret Auth.js itself
// uses, without configuring a second one.
export const authSecret = process.env.AUTH_SECRET ?? "wayframe-dev-only-insecure-secret";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
    // wayframe#t30: Auth.js only passes a non-null `account` on the request
    // that just produced this token — both the original sign-in AND a later
    // incremental Slides/Drive re-consent (request-slides-access.ts's
    // requestGoogleSlidesAccess, which sets access_type=offline+prompt=
    // consent) flow through here, so this is the one place to persist
    // whatever Google just granted. Google only issues a `refresh_token` on
    // first consent or when prompt=consent is set — a plain re-sign-in
    // years later reuses the existing grant and won't repeat one, which is
    // why the access-token-only branch exists below.
    async jwt({ token, account }) {
      if (account?.provider === "google" && token.sub) {
        if (account.refresh_token) {
          await saveGoogleTokens(token.sub, {
            refreshToken: account.refresh_token,
            scope: account.scope ?? "",
            accessToken: account.access_token,
            accessTokenExpiresAt: account.expires_at ? account.expires_at * 1000 : undefined,
          });
        } else if (account.access_token) {
          const existing = await getGoogleTokens(token.sub);
          if (existing) {
            await updateAccessToken(token.sub, account.access_token, account.expires_at ? account.expires_at * 1000 : Date.now());
          }
        }
      }
      return token;
    },
  },
});
