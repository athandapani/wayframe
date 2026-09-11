"use client";

import { signIn, type SignInAuthorizationParams } from "next-auth/react";
import { GOOGLE_SLIDES_EXPORT_SCOPES } from "./scopes";

/** Re-runs Google's consent screen for the Slides/Drive export scope, without disturbing whatever the user already granted at sign-in. Call from the export flow (t30), not sign-in — redirects the browser, so it must run from a Client Component. */
export function requestGoogleSlidesAccess(redirectTo?: string) {
  const authorizationParams: SignInAuthorizationParams = {
    scope: GOOGLE_SLIDES_EXPORT_SCOPES,
    access_type: "offline",
    prompt: "consent",
  };
  return signIn("google", { redirectTo }, authorizationParams);
}
