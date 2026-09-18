/**
 * Real pptxgenjs executor for deck-ir.ts's `compileToPptxOps` output
 * (wayframe t30) — the "liftable straight into a real export call site"
 * consumer t28's own module comment anticipated. `compileToPptxOps` only
 * describes the calls it WOULD make (deliberately SDK-free, per its own
 * doc), so this module owns the actual adaptation to pptxgenjs@4's real
 * API, which differs from the op shapes in a few small, real ways:
 *
 *  - `fill`/line `color` are plain hex strings in the IR/ops, but
 *    pptxgenjs's real `ShapeFillProps`/text `color` want a bare hex (no
 *    leading `#`) — `stripHash` normalizes this everywhere a color crosses
 *    into a real pptxgenjs call.
 *  - The IR's "star" shape kind has no `star` entry in pptxgenjs's real
 *    `ShapeType` — only `star5` — so `shapeNameFor` remaps it; every other
 *    kind (`rect`/`ellipse`/`diamond`/`wave`/`line`) matches pptxgenjs's
 *    real `SHAPE_NAME` string union directly.
 *  - The "line" op carries `{startPos, endPos}` (arbitrary two points), but
 *    real pptxgenjs draws a line shape across its bounding box's diagonal,
 *    picking which diagonal via `flipV` — `lineBoxFromPoints` converts.
 *  - The line op's `color` (deck-ir.ts's `compileToPptxOps` now threads
 *    `ConnectorShape.color` through) falls back to `DEFAULT_CONNECTOR_COLOR`
 *    only for a shape built before that field existed (none in practice —
 *    every connector renderable-to-slide.ts emits sets `color`).
 */
import PptxGenJS from "pptxgenjs";
import type { Theme } from "@/components/timeline/theme";
import type { ExportSlideDescriptor } from "./build-export-slides";
import { compileToPptxOps, type CompiledOp, type Slide } from "./deck-ir";
import { buildExecutiveSlideIR, buildSlideIR } from "./renderable-to-slide";
import { SLIDE_HEIGHT_IN, SLIDE_WIDTH_IN } from "./export-to-deck";

const DEFAULT_CONNECTOR_COLOR = "888888";

function stripHash(color: string | undefined): string | undefined {
  return color?.replace(/^#/, "");
}

/** Real pptxgenjs `ShapeType` has `star5`, not `star` — every other IR/op shape name matches its `SHAPE_NAME` union verbatim. */
function shapeNameFor(kind: string): string {
  return kind === "star" ? "star5" : kind;
}

interface Point {
  x: number;
  y: number;
}

/** pptxgenjs draws a "line" shape across its bounding box's diagonal, choosing which diagonal via `flipV` — this derives that box + flip from two arbitrary points. */
function lineBoxFromPoints(from: Point, to: Point): { x: number; y: number; w: number; h: number; flipV: boolean } {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const w = Math.max(0.01, Math.abs(to.x - from.x));
  const h = Math.max(0.01, Math.abs(to.y - from.y));
  // Unflipped draws top-left -> bottom-right. If x and y move in opposite
  // directions between the two points, the intended line is the other
  // diagonal (bottom-left -> top-right), so flip vertically.
  const flipV = (to.x - from.x) * (to.y - from.y) < 0;
  return { x, y, w, h, flipV };
}

/** Adapts one `compileToPptxOps` op to a real pptxgenjs call on an already-added slide. See module header for every adaptation this makes and why. */
function applyOp(pptxSlide: PptxGenJS.Slide, op: CompiledOp): void {
  if (op.call === "addShape") {
    const [rawName, opts] = op.args as [string, Record<string, unknown>];
    if (rawName === "line") {
      const { startPos, endPos, color } = opts as { startPos: Point; endPos: Point; color?: string };
      const box = lineBoxFromPoints(startPos, endPos);
      pptxSlide.addShape("line", { x: box.x, y: box.y, w: box.w, h: box.h, flipV: box.flipV, line: { color: stripHash(color) ?? DEFAULT_CONNECTOR_COLOR, width: 1.5 } });
      return;
    }
    const { x, y, w, h, fill, rotate } = opts as { x: number; y: number; w: number; h: number; fill?: string; rotate?: number };
    pptxSlide.addShape(shapeNameFor(rawName) as PptxGenJS.SHAPE_NAME, {
      x,
      y,
      w,
      h,
      fill: fill ? { color: stripHash(fill)! } : undefined,
      rotate,
    });
    return;
  }
  if (op.call === "addText") {
    const [runs, box] = op.args as [Array<{ text: string; options: { bold?: boolean; italic?: boolean; color?: string; fontSize?: number } }>, { x: number; y: number; w: number; h: number }];
    pptxSlide.addText(
      runs.map((r) => ({ text: r.text, options: { bold: r.options.bold, italic: r.options.italic, color: stripHash(r.options.color), fontSize: r.options.fontSize } })),
      box,
    );
    return;
  }
  throw new Error(`export-native-deck: unhandled op call "${op.call}" — deck-ir.ts's compileToPptxOps only emits "addShape"/"addText"`);
}

export function applyPptxOps(pptxSlide: PptxGenJS.Slide, ops: CompiledOp[]): void {
  for (const op of ops) applyOp(pptxSlide, op);
}

export interface NativeDeckDomain {
  domainMin: number;
  domainMax: number;
}

/** Builds a real, in-memory pptxgenjs Presentation of native shapes/text (not html2canvas screenshots) from t29's slide descriptors, via renderable-to-slide.ts's translator + deck-ir.ts's compiler. */
export async function buildNativePptx(descriptors: ExportSlideDescriptor[], theme: Theme, domain: NativeDeckDomain, legendCategoryFillEnabled: boolean): Promise<PptxGenJS> {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "WAYFRAME_WIDE", width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pres.layout = "WAYFRAME_WIDE";

  for (const descriptor of descriptors) {
    const slideIR =
      descriptor.mode === "executive"
        ? buildExecutiveSlideIR({ renderable: descriptor.data, theme, summary: descriptor.timelineSummary ?? null, title: descriptor.label })
        : buildSlideIR({ renderable: descriptor.data, theme, domain, legendCategoryFillEnabled, title: descriptor.label });
    const ops = compileToPptxOps(slideIR);
    const pptxSlide = pres.addSlide();
    applyPptxOps(pptxSlide, ops);
  }

  return pres;
}

/** Parallel to export-to-deck.ts's image-based `exportToDeck` — writes a native-shape .pptx to disk instead of a per-slide screenshot deck. Both paths coexist; the caller (ExportDialog) picks one per the destination toggle. */
export async function exportNativeDeckToPptx(descriptors: ExportSlideDescriptor[], theme: Theme, domain: NativeDeckDomain, legendCategoryFillEnabled: boolean, fileName: string): Promise<void> {
  const pres = await buildNativePptx(descriptors, theme, domain, legendCategoryFillEnabled);
  await pres.writeFile({ fileName });
}

/**
 * Same job as `buildNativePptx`, but from already-built `Slide` IR (one per
 * output slide) rather than `ExportSlideDescriptor`s — for a caller (t30's
 * ExportDialog) that needs per-slide domain control `buildNativePptx`'s
 * single shared `domain` param can't express, because it builds every
 * slide's IR from the SAME domain internally. A caller building its own
 * per-slide domain (e.g. each slide falling back to its own content's
 * `computeDomain` when no zoom window is active, matching what the
 * on-screen/off-screen renderer has always done per-slide) builds the
 * `Slide[]` itself and hands the result here instead.
 */
export async function buildNativePptxFromSlides(slides: Slide[]): Promise<PptxGenJS> {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "WAYFRAME_WIDE", width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pres.layout = "WAYFRAME_WIDE";
  for (const slide of slides) {
    const pptxSlide = pres.addSlide();
    applyPptxOps(pptxSlide, compileToPptxOps(slide));
  }
  return pres;
}

/** Writes the `buildNativePptxFromSlides` presentation straight to disk — the `Slide[]`-based sibling of `exportNativeDeckToPptx`. */
export async function exportNativeDeckFromSlides(slides: Slide[], fileName: string): Promise<void> {
  const pres = await buildNativePptxFromSlides(slides);
  await pres.writeFile({ fileName });
}
