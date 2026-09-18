/**
 * Real Google Slides + Drive REST integration (wayframe t30) — turns
 * deck-ir.ts's `compileToSlidesRequests` output (deliberately SDK-free
 * per its own doc) into actual `batchUpdate` calls against a live
 * presentation. Plain `fetch` + a Bearer access token throughout, no
 * `googleapis` dependency — this repo's own convention (room-token.ts,
 * token-crypto.ts) is hand-rolled minimal REST/crypto over a heavy SDK.
 *
 * Every request shape below was checked against Google's current REST
 * reference (developers.google.com/workspace/slides/api/reference/rest/v1)
 * before being written, not assumed from training data — same "verify
 * external platform facts" discipline t4's realtime-CRDT ticket learned the
 * hard way. Three real surprises worth flagging for whoever next touches
 * this:
 *
 *  1. `pageSize` IS settable directly on `presentations.create` (a plain
 *     guess might assume a separate resize call is needed after create —
 *     it isn't).
 *  2. There is NO separate "rotation" field anywhere in the page-element
 *     transform. Rotation is expressed entirely through the affine
 *     transform's `scaleX/scaleY/shearX/shearY` matrix — see `transformFor`
 *     below for the derivation, including the center-pivot correction (the
 *     matrix's natural pivot is the shape's top-left corner, not its
 *     center, so a naive rotation matrix visibly drifts a marker off its
 *     intended point without that correction).
 *  3. The IR's default `shape.kind.toUpperCase()` ("RECT") is NOT a real
 *     `ShapeType` enum value — Slides' rectangle is `RECTANGLE`. Every other
 *     kind this app emits (`ELLIPSE`, `DIAMOND`, `STAR`, and the flag
 *     composition's own literal `WAVE`/`RECTANGLE`, already correct in
 *     deck-ir.ts since t6's capability probe verified them) matches
 *     verbatim, so only "RECT" needs remapping.
 *
 * NOT independently re-verified this session (no live Google OAuth app or
 * access token exists in this dev environment): the exact wire behavior of
 * every request below. Verification here is "request bodies match the
 * researched reference schema," exercised via mocked `fetch` in
 * slides-api.test.ts — the same bar this repo already accepts for
 * room-token.ts/google-tokens.ts's external-service code, not a live call.
 * The Drive `files.update` addParents/removeParents reparenting shape is
 * long-stable, well-documented Drive v3 behavior and wasn't re-fetched this
 * session (lower novelty risk than the Slides-specific facts above).
 */
import { compileToSlidesRequests, type CompiledOp, type Slide } from "@/lib/export/deck-ir";
import { SLIDE_HEIGHT_IN, SLIDE_WIDTH_IN } from "@/lib/export/export-to-deck";

export const EMU_PER_INCH = 914400;

export function inchesToEmu(inches: number): number {
  return Math.round(inches * EMU_PER_INCH);
}

interface Point {
  x: number;
  y: number;
}

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

/** Parses a `#rrggbb` (or bare `rrggbb`) hex string into Slides' 0-1 float RgbColor. Returns undefined for anything falsy, so callers can pass an optional color straight through. */
function hexToRgb(hex: string | undefined): RgbColor | undefined {
  if (!hex) return undefined;
  const clean = hex.replace(/^#/, "");
  return {
    red: parseInt(clean.substring(0, 2), 16) / 255,
    green: parseInt(clean.substring(2, 4), 16) / 255,
    blue: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

let idCounter = 0;
/** Slides object ids must start with a letter — a per-process counter plus a random suffix keeps every id unique within one export without needing a real UUID dependency. */
function newObjectId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${idCounter}${Math.random().toString(36).slice(2, 8)}`;
}

function sizeFor(wIn: number, hIn: number) {
  return {
    width: { magnitude: inchesToEmu(wIn), unit: "EMU" },
    height: { magnitude: inchesToEmu(hIn), unit: "EMU" },
  };
}

/**
 * The affine transform for a non-rotated or rotated page element. Google's
 * transform matrix pivots around the shape's own top-left corner, not its
 * center — for `rotateDeg`, this computes where that corner-pivoted rotation
 * would leave the shape's center, then adjusts `translateX/Y` so the
 * *center* lands exactly where the caller's `(xIn, yIn, wIn, hIn)` box
 * intended it, keeping a rotated marker visually centered on its date/lane
 * position rather than drifting.
 */
function transformFor(xIn: number, yIn: number, wIn: number, hIn: number, rotateDeg?: number) {
  if (!rotateDeg) {
    return { scaleX: 1, scaleY: 1, translateX: inchesToEmu(xIn), translateY: inchesToEmu(yIn), unit: "EMU" };
  }
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cxIn = xIn + wIn / 2;
  const cyIn = yIn + hIn / 2;
  const rotatedCenterXIn = cos * (wIn / 2) - sin * (hIn / 2);
  const rotatedCenterYIn = sin * (wIn / 2) + cos * (hIn / 2);
  return {
    scaleX: cos,
    shearX: -sin,
    shearY: sin,
    scaleY: cos,
    translateX: inchesToEmu(cxIn - rotatedCenterXIn),
    translateY: inchesToEmu(cyIn - rotatedCenterYIn),
    unit: "EMU",
  };
}

/**
 * A Slides line element is a 1x1-EMU unit square stretched/flipped by the
 * transform's scaleX/scaleY (the documented pattern for drawing an arbitrary
 * line via CreateLineRequest) — negative scale draws the opposite direction,
 * so no separate flip flag is needed the way pptxgenjs's line shape wants
 * one. A degenerate exactly-horizontal or exactly-vertical delta would zero
 * one scale factor, which Slides may reject as a zero-magnitude element, so
 * a tiny non-zero floor (`EPS_EMU`, ~0.001in) is substituted instead —
 * imperceptible on screen, avoids a hard API error.
 */
function lineTransform(from: Point, to: Point) {
  const EPS_EMU = 1000;
  const dxEmu = inchesToEmu(to.x - from.x);
  const dyEmu = inchesToEmu(to.y - from.y);
  return {
    scaleX: dxEmu === 0 ? EPS_EMU : dxEmu,
    scaleY: dyEmu === 0 ? EPS_EMU : dyEmu,
    translateX: inchesToEmu(from.x),
    translateY: inchesToEmu(from.y),
    unit: "EMU",
  };
}

/** Only the IR's default-case "RECT" needs remapping — every other shape-kind string this app emits already matches a real Slides `ShapeType` value verbatim (see module header). */
function shapeTypeFor(raw: string): string {
  return raw === "RECT" ? "RECTANGLE" : raw;
}

/**
 * Adapts one slide's `compileToSlidesRequests` ops into the real
 * `batchUpdate` request objects for `pageObjectId`. A single IR "insertText"
 * op expands into 2+N real requests (create the text box, insert the
 * concatenated text, then one `updateTextStyle` per run) since Slides has no
 * single call that creates a styled-multi-run text box in one step.
 */
export function requestsForSlide(pageObjectId: string, ops: CompiledOp[]): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];

  for (const op of ops) {
    if (op.call === "createShape") {
      const [rawType, opts] = op.args as [string, { x: number; y: number; w: number; h: number; fill?: string; rotation?: number }];
      const objectId = newObjectId("shp");
      requests.push({
        createShape: {
          objectId,
          elementProperties: {
            pageObjectId,
            size: sizeFor(opts.w, opts.h),
            transform: transformFor(opts.x, opts.y, opts.w, opts.h, opts.rotation),
          },
          shapeType: shapeTypeFor(rawType),
        },
      });
      const rgb = hexToRgb(opts.fill);
      if (rgb) {
        requests.push({
          updateShapeProperties: {
            objectId,
            shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: rgb } } } },
            fields: "shapeBackgroundFill.solidFill.color",
          },
        });
      }
    } else if (op.call === "createLine") {
      const [opts] = op.args as [{ startConnection: Point; endConnection: Point; category: string; color?: string }];
      const objectId = newObjectId("ln");
      requests.push({
        createLine: {
          objectId,
          elementProperties: {
            pageObjectId,
            size: { width: { magnitude: 1, unit: "EMU" }, height: { magnitude: 1, unit: "EMU" } },
            transform: lineTransform(opts.startConnection, opts.endConnection),
          },
          category: opts.category,
        },
      });
      const rgb = hexToRgb(opts.color);
      if (rgb) {
        requests.push({
          updateLineProperties: {
            objectId,
            lineProperties: { lineFill: { solidFill: { color: { rgbColor: rgb } } } },
            fields: "lineFill.solidFill.color",
          },
        });
      }
    } else if (op.call === "insertText") {
      const [runs, box] = op.args as [
        Array<{ text: string; style: { bold?: boolean; italic?: boolean; foregroundColor?: string; fontSize?: number } }>,
        { x: number; y: number; w: number; h: number },
      ];
      const objectId = newObjectId("txt");
      requests.push({
        createShape: {
          objectId,
          elementProperties: { pageObjectId, size: sizeFor(box.w, box.h), transform: transformFor(box.x, box.y, box.w, box.h) },
          shapeType: "TEXT_BOX",
        },
      });
      const fullText = runs.map((r) => r.text).join("");
      if (fullText.length > 0) {
        requests.push({ insertText: { objectId, insertionIndex: 0, text: fullText } });
        let cursor = 0;
        for (const run of runs) {
          const startIndex = cursor;
          const endIndex = cursor + run.text.length;
          cursor = endIndex;
          const style: Record<string, unknown> = {};
          const fields: string[] = [];
          if (run.style.bold) {
            style.bold = true;
            fields.push("bold");
          }
          if (run.style.italic) {
            style.italic = true;
            fields.push("italic");
          }
          if (run.style.fontSize) {
            style.fontSize = { magnitude: run.style.fontSize, unit: "PT" };
            fields.push("fontSize");
          }
          const rgb = hexToRgb(run.style.foregroundColor);
          if (rgb) {
            style.foregroundColor = { opaqueColor: { rgbColor: rgb } };
            fields.push("foregroundColor");
          }
          if (fields.length > 0) {
            requests.push({
              updateTextStyle: {
                objectId,
                style,
                textRange: { type: "FIXED_RANGE", startIndex, endIndex },
                fields: fields.join(","),
              },
            });
          }
        }
      }
    }
  }

  return requests;
}

async function slidesFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://slides.googleapis.com/v1/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slides API ${path} failed: ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

interface CreatePresentationResponse {
  presentationId: string;
  slides?: Array<{ objectId: string }>;
}

/** Creates a new presentation sized to match this app's fixed deck canvas (SLIDE_WIDTH_IN x SLIDE_HEIGHT_IN, the same dimensions the pptx path uses) — `pageSize` is settable directly on create, no follow-up resize call needed. */
export async function createPresentation(accessToken: string, title: string): Promise<{ presentationId: string; firstPageObjectId: string }> {
  const body = await slidesFetch<CreatePresentationResponse>(accessToken, "presentations", {
    method: "POST",
    body: JSON.stringify({
      title,
      pageSize: { width: { magnitude: inchesToEmu(SLIDE_WIDTH_IN), unit: "EMU" }, height: { magnitude: inchesToEmu(SLIDE_HEIGHT_IN), unit: "EMU" } },
    }),
  });
  const firstPageObjectId = body.slides?.[0]?.objectId;
  if (!firstPageObjectId) throw new Error("presentations.create response had no initial slide objectId");
  return { presentationId: body.presentationId, firstPageObjectId };
}

interface BatchUpdateResponse {
  replies?: Array<{ createSlide?: { objectId: string } }>;
}

/** Appends `count` more blank pages after the presentation's existing (default first) page, returning their new objectIds in order. */
export async function addSlides(accessToken: string, presentationId: string, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const requests = Array.from({ length: count }, (_, i) => ({ createSlide: { insertionIndex: i + 1 } }));
  const body = await slidesFetch<BatchUpdateResponse>(accessToken, `presentations/${presentationId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  return (body.replies ?? []).map((r) => {
    if (!r.createSlide?.objectId) throw new Error("batchUpdate createSlide reply had no objectId");
    return r.createSlide.objectId;
  });
}

/** Orchestrates a full deck: create the presentation, add one page per extra slide, then populate every page's shapes/lines/text in one combined batchUpdate. */
export async function exportSlideDeckToGoogleSlides(accessToken: string, slides: Slide[], title: string): Promise<{ presentationId: string; presentationUrl: string }> {
  const { presentationId, firstPageObjectId } = await createPresentation(accessToken, title);
  const restPageIds = await addSlides(accessToken, presentationId, slides.length - 1);
  const pageObjectIds = [firstPageObjectId, ...restPageIds];

  const allRequests = slides.flatMap((slide, i) => requestsForSlide(pageObjectIds[i], compileToSlidesRequests(slide)));
  if (allRequests.length > 0) {
    await slidesFetch(accessToken, `presentations/${presentationId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: allRequests }),
    });
  }

  return { presentationId, presentationUrl: `https://docs.google.com/presentation/d/${presentationId}/edit` };
}

interface DriveFileParents {
  parents?: string[];
}

/** Reparents a Drive file into `folderId`, replacing whatever parent(s) it currently has (Drive v3's addParents/removeParents convention needs the current parents named explicitly, not "remove from wherever it is"). */
export async function moveFileToFolder(accessToken: string, fileId: string, folderId: string): Promise<void> {
  const getRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!getRes.ok) throw new Error(`Drive files.get failed: ${getRes.status} ${await getRes.text().catch(() => "")}`);
  const { parents } = (await getRes.json()) as DriveFileParents;

  const params = new URLSearchParams({ addParents: folderId, fields: "id,parents" });
  if (parents && parents.length > 0) params.set("removeParents", parents.join(","));

  const patchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!patchRes.ok) throw new Error(`Drive files.update failed: ${patchRes.status} ${await patchRes.text().catch(() => "")}`);
}
