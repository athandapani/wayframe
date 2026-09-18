"use client";

/**
 * wayframe#t30's inline re-consent popup — the gist's "clicking Send-to-Slides
 * with no valid token triggers an inline re-consent popup and automatically
 * resumes the pending export on grant, no extra click."
 *
 * Popup-blocker constraint this module is built around: `window.open` is
 * only reliably un-blocked when called SYNCHRONOUSLY inside a click handler,
 * before any `await`. The caller (ExportDialog) doesn't know whether a
 * popup is even needed until an async token-status check resolves, so the
 * pattern is: open a blank placeholder popup synchronously in the click
 * handler via `openPlaceholderPopup`, THEN — once the async check says
 * re-consent is needed — hand that already-open window to
 * `runConsentInPopup`, which navigates it to the real consent page. If the
 * token turns out to already be valid, the caller just closes the unused
 * placeholder instead.
 */
export const SLIDES_CONSENT_COMPLETE_MESSAGE = { type: "wayframe:slides-consent-complete" } as const;

/** Opens a blank placeholder popup — call this synchronously inside the triggering click handler, before any `await`, or most browsers will block it. Returns `null` if the browser blocked it anyway (some extensions block even a synchronous `window.open`); callers must handle that by failing gracefully rather than assuming a popup exists. */
export function openPlaceholderPopup(): Window | null {
  return window.open("about:blank", "wayframe-slides-consent", "width=520,height=680");
}

/**
 * Navigates an already-open popup (from `openPlaceholderPopup`) to the real
 * consent flow and waits for it to finish. Resolves `true` once
 * `/slides-consent/complete` posts the completion message back; resolves
 * `false` if the user closes the popup themselves without completing
 * consent (detected by polling `popup.closed`, since a closed popup never
 * posts anything). Always cleans up its listener/interval either way, so
 * repeated calls (e.g. the automatic retry after a `no_valid_token` export
 * response) don't leak them.
 */
export function runConsentInPopup(popup: Window): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    function cleanup() {
      window.removeEventListener("message", onMessage);
      clearInterval(pollId);
    }

    function finish(result: boolean) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string } | null;
      if (data?.type !== SLIDES_CONSENT_COMPLETE_MESSAGE.type) return;
      finish(true);
    }

    window.addEventListener("message", onMessage);
    const pollId = setInterval(() => {
      if (popup.closed) finish(false);
    }, 500);

    popup.location.href = "/slides-consent";
  });
}
