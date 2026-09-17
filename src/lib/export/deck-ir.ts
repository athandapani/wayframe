/**
 * Deck IR — a shared shape/text model that both a PowerPoint compiler
 * (`compileToPptxOps`, feeding pptxgenjs) and a Google Slides compiler
 * (`compileToSlidesRequests`, feeding a Slides `batchUpdate`) read.
 *
 * A Shape stores full-fidelity INTENT — the richest thing either renderer
 * could possibly do with it — never pre-flattened to whatever the weaker
 * renderer supports. Each compiler independently decides how much of that
 * intent it can honor. The "fidelity floor" wayframe#105/t28 asks about
 * isn't one shared degraded shape set; it's the guarantee that every Shape
 * kind compiles to SOMETHING acceptable on both targets, even when the two
 * outputs end up different.
 *
 * Shape kinds and the degradation each compiler applies, from #t6 (Slides)
 * and #t7 (pptxgenjs)'s capability probes:
 *  - rect / ellipse / diamond / star: native on both, no degradation.
 *    `rotationDeg` (used by the on-time cushion-diamond marker, tilted 45°)
 *    is honored natively by both — neither probe flagged rotation as
 *    unsupported.
 *  - flag: NEITHER renderer has a native flag/pennant shape (#t6, #t7 both
 *    hit this independently) — both compilers compose it as a `wave` path
 *    plus a rectangle staff. Not a degradation of one renderer relative to
 *    the other; it's the one shape kind where the floor and the ceiling
 *    coincide.
 *  - text: always an array of styled runs, never raw HTML — generalizes
 *    #t7's BLUF finding ("needs pre-splitting into runs") into the IR
 *    itself, so there's no HTML-to-runs step to forget on either side.
 *  - connector: `style` is REQUESTED intent (straight/elbow/curved — the
 *    orthogonal-elbow style RoadmapTimeline actually draws on-screen, see
 *    #103/t25's connector-router). Slides honors it as-is (#t6: native
 *    elbow/curved). pptxgenjs has no bent/curved connector support at all
 *    (#t7) — its compiler rewrites every non-straight request down to
 *    "straight" and reports the rewrite via a `degraded` op, rather than
 *    silently drawing something misleading. This is the one place the two
 *    compiled decks visibly diverge for the same source deck.
 *
 * Shapes carry already-resolved concrete fill/line colors, not theme
 * tokens or override references — #t18/#t19's full precedence ladder
 * (per-item override > category > Program default > Theme) resolves
 * BEFORE a shape enters the IR, so this module needs no knowledge of
 * Theme or the override ladder. Likewise, label/annotation shape positions
 * are expected to come from #t24's `createZone` occupancy output captured
 * at export time, not a separate export-time layout pass — that's the
 * caller's job, not this module's.
 *
 * Both compilers are pure "describe the calls, don't make them" functions
 * — no pptxgenjs/Slides SDK invocation — so they're safe to unit-test
 * without either SDK and are liftable straight into a real export call
 * site once one exists (t30 owns wiring this in, replacing
 * `export-to-deck.ts`'s current html2canvas-screenshot-per-slide approach;
 * this module has no consumers yet).
 *
 * This is a faithful, typed port of the design validated in a throwaway
 * prototype (`prototype/deck-ir-105` branch, `prototypes/deck-ir-105.html`)
 * — not a redesign.
 */

export const SHAPE_KINDS = ["rect", "ellipse", "diamond", "star", "flag", "text", "connector"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export type ConnectorStyle = "straight" | "elbow" | "curved";

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  sizePt?: number;
}

interface ShapeBase {
  id: string;
}

/** rect / ellipse / diamond / star / flag — native geometry on both renderers, except `flag` which both compose. */
export interface GeometricShape extends ShapeBase {
  kind: "rect" | "ellipse" | "diamond" | "star" | "flag";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  /** Honored natively by both compilers — used by the on-time cushion-diamond marker (45°). */
  rotationDeg?: number;
  /** Only meaningful for kind "star". */
  points?: number;
}

/** Always an array of styled runs — never raw HTML (generalizes #t7's BLUF finding). */
export interface TextShape extends ShapeBase {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  runs: TextRun[];
}

/** `style` is requested intent; pptxgenjs degrades non-"straight" to "straight" (#t7), Slides honors it as-is (#t6). */
export interface ConnectorShape extends ShapeBase {
  kind: "connector";
  from: { x: number; y: number };
  to: { x: number; y: number };
  style: ConnectorStyle;
  color?: string;
}

export type Shape = GeometricShape | TextShape | ConnectorShape;

export type Slide = Shape[];

export class IRValidationError extends Error {}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new IRValidationError(msg);
}

/** Validates one shape against the IR contract. Throws IRValidationError, never returns false. */
export function validateShape(shape: unknown): Shape {
  assert(shape != null && typeof shape === "object", "a shape must be an object");
  const s = shape as Record<string, unknown>;
  assert(
    typeof s.kind === "string" && (SHAPE_KINDS as readonly string[]).includes(s.kind),
    `unknown shape kind "${String(s.kind)}" — must be one of ${SHAPE_KINDS.join(", ")}`,
  );
  assert(typeof s.id === "string" && s.id.length > 0, "a shape needs a non-empty string id");

  if (s.kind === "connector") {
    const from = s.from as { x?: unknown; y?: unknown } | undefined;
    const to = s.to as { x?: unknown; y?: unknown } | undefined;
    assert(!!from && typeof from.x === "number" && typeof from.y === "number", "a connector needs a `from: {x,y}` point");
    assert(!!to && typeof to.x === "number" && typeof to.y === "number", "a connector needs a `to: {x,y}` point");
    assert(
      s.style === "straight" || s.style === "elbow" || s.style === "curved",
      `connector style "${String(s.style)}" must be straight, elbow, or curved`,
    );
  } else if (s.kind === "text") {
    assert(Array.isArray(s.runs) && s.runs.length > 0, "a text shape needs a non-empty `runs` array — never raw HTML");
    for (const r of s.runs as unknown[]) {
      assert(!!r && typeof r === "object" && typeof (r as { text?: unknown }).text === "string", "every text run needs a string `text` field");
    }
  } else {
    for (const k of ["x", "y", "w", "h"] as const) {
      assert(typeof s[k] === "number", `a ${s.kind} shape needs a numeric \`${k}\``);
    }
  }
  return shape as Shape;
}

export interface CompiledOp {
  call: string;
  args: unknown[];
  /** True when this op honors less than the shape's requested intent. */
  degraded?: boolean;
  note?: string;
}

/**
 * Compiles a slide to the plain-object description of the pptxgenjs calls
 * that would be made — never calls pptxgenjs itself.
 */
export function compileToPptxOps(slide: Slide): CompiledOp[] {
  const ops: CompiledOp[] = [];
  for (const shape of slide) {
    validateShape(shape);
    switch (shape.kind) {
      case "flag":
        ops.push({
          call: "addShape",
          args: ["wave", { x: shape.x, y: shape.y, w: shape.w, h: shape.h * 0.7, fill: shape.fill }],
          note: "composed: no native flag/pennant on either renderer",
        });
        ops.push({
          call: "addShape",
          args: ["rect", { x: shape.x, y: shape.y, w: shape.w * 0.08, h: shape.h, fill: shape.fill }],
          note: "composed: staff",
        });
        break;
      case "connector": {
        const honored = shape.style === "straight";
        ops.push({
          call: "addShape",
          args: ["line", { startPos: shape.from, endPos: shape.to, style: "straight" }],
          degraded: !honored,
          note: honored ? undefined : `requested "${shape.style}" — pptxgenjs has no bent/curved connector support (#t7), rewritten to straight`,
        });
        break;
      }
      case "text":
        ops.push({
          call: "addText",
          args: [
            shape.runs.map((r) => ({ text: r.text, options: { bold: !!r.bold, italic: !!r.italic, color: r.color, fontSize: r.sizePt } })),
            { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
          ],
        });
        break;
      default:
        ops.push({
          call: "addShape",
          args: [shape.kind, { x: shape.x, y: shape.y, w: shape.w, h: shape.h, fill: shape.fill, rotate: shape.rotationDeg }],
        });
    }
  }
  return ops;
}

/**
 * Compiles a slide to the plain-object description of the Google Slides
 * `batchUpdate` requests that would be sent — deliberately mirrored
 * op-for-op with `compileToPptxOps` so the two outputs are easy to diff by
 * eye.
 */
export function compileToSlidesRequests(slide: Slide): CompiledOp[] {
  const reqs: CompiledOp[] = [];
  for (const shape of slide) {
    validateShape(shape);
    switch (shape.kind) {
      case "flag":
        reqs.push({
          call: "createShape",
          args: ["WAVE", { x: shape.x, y: shape.y, w: shape.w, h: shape.h * 0.7 }],
          note: "composed: no native flag/pennant on either renderer",
        });
        reqs.push({
          call: "createShape",
          args: ["RECTANGLE", { x: shape.x, y: shape.y, w: shape.w * 0.08, h: shape.h }],
          note: "composed: staff",
        });
        break;
      case "connector":
        reqs.push({
          call: "createLine",
          args: [{ startConnection: shape.from, endConnection: shape.to, category: shape.style === "straight" ? "STRAIGHT" : shape.style === "elbow" ? "BENT" : "CURVED" }],
          degraded: false,
        });
        break;
      case "text":
        reqs.push({
          call: "insertText",
          args: [
            shape.runs.map((r) => ({ text: r.text, style: { bold: !!r.bold, italic: !!r.italic, foregroundColor: r.color, fontSize: r.sizePt } })),
            { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
          ],
        });
        break;
      default:
        reqs.push({
          call: "createShape",
          args: [shape.kind.toUpperCase(), { x: shape.x, y: shape.y, w: shape.w, h: shape.h, fill: shape.fill, rotation: shape.rotationDeg }],
        });
    }
  }
  return reqs;
}
