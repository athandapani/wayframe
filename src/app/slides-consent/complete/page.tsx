"use client";

import { useEffect, useState } from "react";
import { SLIDES_CONSENT_COMPLETE_MESSAGE } from "@/lib/auth/slides-consent-popup";

/**
 * wayframe#t30 — Google's OAuth callback lands here after auth.ts's `jwt`
 * callback has already persisted the fresh token server-side. This page's
 * only job is telling the opener (the main tab, via slides-consent-popup.ts's
 * `runConsentInPopup`) that consent finished, then closing itself. The
 * visible text is a fallback for the rare case `window.close()` is refused
 * (some browsers block a script from closing a window it didn't itself
 * `window.open`, though this one always was) or `window.opener` is null.
 */
export default function SlidesConsentCompletePage() {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    window.opener?.postMessage(SLIDES_CONSENT_COMPLETE_MESSAGE, window.location.origin);
    window.close();
    // If we're still here a tick later, window.close() was refused.
    const timeout = setTimeout(() => setClosed(true), 300);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="flex h-screen items-center justify-center p-6 text-center text-sm text-gray-600">
      {closed ? "Connected — you can close this window." : "Finishing up…"}
    </div>
  );
}
