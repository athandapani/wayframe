import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { refreshAccessToken } from "@/lib/db/google-tokens";
import { validateShape, type Slide } from "@/lib/export/deck-ir";
import { exportSlideDeckToGoogleSlides, moveFileToFolder } from "@/lib/google/slides-api";

/**
 * wayframe#t30's "Send to Google Slides" export route. The client builds the
 * `Slide[]` IR itself (renderable-to-slide.ts's `buildSlideIR`/
 * `buildExecutiveSlideIR`, both DOM-free) and posts the already-built shapes
 * here — this route's only job is turning validated IR into a real Slides
 * deck and, optionally, filing it into a picked Drive folder.
 *
 * `403 { error: "no_valid_token" }` is the exact shape the export UI checks
 * to decide "pop the re-consent flow, then retry this same export" — don't
 * change it without updating that caller too.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const accessToken = await refreshAccessToken(identity);
  if (!accessToken) return NextResponse.json({ error: "no_valid_token" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rawSlides = body?.slides;
  const fileName = typeof body?.fileName === "string" && body.fileName.trim() ? body.fileName : "Wayframe Export";
  const driveFolderId = typeof body?.driveFolderId === "string" ? body.driveFolderId : undefined;

  if (!Array.isArray(rawSlides) || rawSlides.length === 0) {
    return NextResponse.json({ error: "Request body must include a non-empty `slides` array." }, { status: 400 });
  }

  let slides: Slide[];
  try {
    slides = rawSlides.map((slide: unknown) => {
      if (!Array.isArray(slide)) throw new Error("each slide must be an array of shapes");
      return slide.map((shape) => validateShape(shape));
    });
  } catch (err) {
    return NextResponse.json({ error: `Invalid slide IR: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  try {
    const { presentationId, presentationUrl } = await exportSlideDeckToGoogleSlides(accessToken, slides, fileName);
    if (driveFolderId) await moveFileToFolder(accessToken, presentationId, driveFolderId);
    return NextResponse.json({ presentationUrl });
  } catch (err) {
    // Never a bare 500 with no body — the gist's "no dead-end error state"
    // posture applies here too, not just to the token/re-consent flow.
    return NextResponse.json({ error: "google_api_error", detail: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
