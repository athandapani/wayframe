import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { requireEnv } from "@/lib/server/env-guard";

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
const secret = process.env.AUTH_SECRET ?? "wayframe-dev-only-insecure-secret";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret,
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
  },
});
