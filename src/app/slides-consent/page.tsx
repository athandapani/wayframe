"use client";

import { useEffect } from "react";
import { requestGoogleSlidesAccess } from "@/lib/auth/request-slides-access";

/**
 * wayframe#t30's re-consent popup content — this page only ever runs inside
 * the small popup window `slides-consent-popup.ts` opens, never as a normal
 * navigation. It immediately kicks off the same incremental-scope Google
 * consent redirect `requestGoogleSlidesAccess` already implements, landing
 * back on `/slides-consent/complete` once granted.
 */
export default function SlidesConsentPage() {
  useEffect(() => {
    requestGoogleSlidesAccess("/slides-consent/complete");
  }, []);

  return (
    <div className="flex h-screen items-center justify-center p-6 text-center text-sm text-gray-600">
      Connecting to Google…
    </div>
  );
}
