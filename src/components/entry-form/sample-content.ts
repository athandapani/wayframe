// Sample content for the real entry page's "Use sample notes" / "Use sample
// photo" affordances (wayframe#23, Variant B). Ported from the
// prototype/entry-input-ux spike — Atlas Mobile Robot Platform theme,
// matching src/data/demo-roadmap.ts's conventions: fictional program,
// invented people, no real-company references.

export const SAMPLE_NOTES_TEXT = `Program sync — Atlas Mobile Robot Platform

Design Freeze landed 3/1, on schedule. Core autonomy stack complete.

Two things I'm watching for the board review:
- UL 3100 cert lab slot slipped to Q4 (T. Boyer chasing an earlier slot)
- Pilot Site 2 go-live is at risk — landlord hasn't given us a network
  infrastructure timeline yet (K. Simmons following up)

Manufacturing: production tooling on track for end of September.
Phase 2 ramp starts December, depends on tooling being done first.

Commercial side is ahead of us — pricing's locked, channel agreements
signing this month. They're basically waiting on certification + a clean
pilot before they can push the launch button.

GA target is still February.`;

/**
 * Renders a fake "photo of a whiteboard" client-side via canvas so the
 * sample affordance can exercise the real imageDataUrl path without a
 * checked-in binary asset. Deliberately messy/handwritten-ish framing —
 * real whiteboard photos aren't clean typed text.
 */
export function generateSampleWhiteboardPhoto(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 600;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#f5f5f0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#d4d4d4";
  ctx.lineWidth = 1;
  for (let y = 40; y < canvas.height; y += 38) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(canvas.width - 20, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#1f2933";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("Atlas — Safety Cert", 40, 70);

  ctx.font = "24px sans-serif";
  const lines = [
    "UL 3100 pre-sub review  ->  Sept 5",
    "Lab test slot            ->  Nov 10 (AT RISK)",
    "Cert report sign-off     ->  Dec 1",
    "",
    "Motor ctrl dual-source   ->  Sept 20",
    "  (blocks lab test slot!)",
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, 40, 130 + i * 38);
  });

  ctx.strokeStyle = "#c0392b";
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 100, 640, 80);

  return canvas.toDataURL("image/png");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB — client-side guardrail; /api/extract enforces its own limits server-side.

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "That doesn't look like an image. Try a PNG, JPEG, WebP, or GIF.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "That image is too large (max 10MB) — try a smaller photo or a screenshot.";
  }
  return null;
}
