// Incremental OAuth per wayframe#t5's resolution — Slides/Drive scopes are
// requested only when the user starts a Google Slides export (t30), never
// at sign-in, so a public portfolio showcase visitor isn't greeted with
// Google's unverified-app warning just to identify themselves. Kept
// server-safe (no next-auth/react import) so both server and client code
// can reference the same scope string; see request-slides-access.ts for
// the client-side signIn() call that actually uses it.
export const GOOGLE_SLIDES_EXPORT_SCOPES =
  "openid email profile https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.file";
