// PROTOTYPE — throwaway. wayframe#23: entry-page input UX design. Shared
// sample data / helpers used by all three variants so they answer the same
// question — "what should the real `/` input surface look like" — on top of
// identical plumbing (real /api/extract call, same sample content).
//
// Atlas Mobile Robot Platform theme, matching src/data/demo-roadmap.ts's
// conventions: fictional program, invented people, no real-company
// references.

import type { ExtractionError } from "@/lib/extraction/extract";

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

export const SAMPLE_NOTES_LABEL = "Atlas program sync — sample notes";

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

export const SAMPLE_PHOTO_LABEL = "Atlas whiteboard photo (sample)";

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

export interface ExtractSuccess {
  programName: string;
  milestoneCount: number;
  topLevelItemCount: number;
}

/** Stand-in success readout — the real entry page hands this off to DemoRoadmapView's component tree (wayframe#20's destination); out of scope for this input-UX prototype. */
export async function callExtract(
  text: string,
  imageDataUrl: string | null,
): Promise<{ ok: true; result: ExtractSuccess } | { ok: false; error: ExtractionError }> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text || undefined, imageDataUrl: imageDataUrl || undefined }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, error: body?.error ?? { kind: "api_error", message: "Extraction failed." } };
  }
  const doc = body.document;
  return {
    ok: true,
    result: {
      programName: doc.programName,
      milestoneCount: doc.milestones?.length ?? 0,
      topLevelItemCount: doc.topLevelItems?.length ?? 0,
    },
  };
}
