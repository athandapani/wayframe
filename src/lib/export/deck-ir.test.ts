import { describe, expect, it } from "vitest";
import { IRValidationError, type Shape, compileToPptxOps, compileToSlidesRequests, validateShape } from "./deck-ir";

const rect: Shape = { id: "s1", kind: "rect", x: 1, y: 1, w: 2, h: 1, fill: "#2f6f8c" };
const diamond: Shape = { id: "s2", kind: "diamond", x: 6.5, y: 1, w: 1, h: 1, fill: "#b5651f", rotationDeg: 45 };
const flag: Shape = { id: "s3", kind: "flag", x: 10.5, y: 1, w: 1.2, h: 1.2, fill: "#c2255c" };
const richText: Shape = {
  id: "s4",
  kind: "text",
  x: 1,
  y: 3,
  w: 6,
  h: 1,
  runs: [{ text: "Platform GA " }, { text: "at risk", bold: true, color: "#b3261e" }, { text: " — see comment.", italic: true }],
};
function connector(style: "straight" | "elbow" | "curved"): Shape {
  return { id: "c1", kind: "connector", from: { x: 1, y: 5 }, to: { x: 5, y: 4.2 }, style, color: "#5b6472" };
}

describe("validateShape", () => {
  it("accepts every native shape kind", () => {
    for (const shape of [rect, diamond, flag]) expect(validateShape(shape)).toBe(shape);
  });

  it("rejects an unknown shape kind", () => {
    expect(() => validateShape({ id: "x", kind: "hexagon", x: 1, y: 1, w: 1, h: 1 })).toThrow(IRValidationError);
    expect(() => validateShape({ id: "x", kind: "hexagon", x: 1, y: 1, w: 1, h: 1 })).toThrow(/unknown shape kind/);
  });

  it("rejects a shape with no id", () => {
    expect(() => validateShape({ kind: "rect", x: 1, y: 1, w: 1, h: 1 })).toThrow(/non-empty string id/);
  });

  it("rejects a connector missing from/to", () => {
    expect(() => validateShape({ id: "c", kind: "connector", style: "straight" })).toThrow(/`from: {x,y}`/);
    expect(() => validateShape({ id: "c", kind: "connector", from: { x: 0, y: 0 }, style: "straight" })).toThrow(/`to: {x,y}`/);
  });

  it("rejects a connector with an invalid style", () => {
    expect(() => validateShape({ id: "c", kind: "connector", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style: "wiggly" })).toThrow(
      /must be straight, elbow, or curved/,
    );
  });

  it("rejects a text shape with no runs", () => {
    expect(() => validateShape({ id: "t", kind: "text", x: 0, y: 0, w: 1, h: 1, runs: [] })).toThrow(/non-empty `runs` array/);
  });

  it("rejects a geometric shape missing a numeric dimension", () => {
    expect(() => validateShape({ id: "r", kind: "rect", x: 0, y: 0, w: 1 })).toThrow(/numeric `h`/);
  });
});

describe("scenario 1 — happy path (rect, diamond, straight connector)", () => {
  const slide: Shape[] = [rect, diamond, connector("straight")];

  it("pptx: nothing degrades, rotation passes through", () => {
    const ops = compileToPptxOps(slide);
    expect(ops.every((o) => !o.degraded)).toBe(true);
    const diamondOp = ops.find((o) => o.args[0] === "diamond");
    expect(diamondOp?.args[1]).toMatchObject({ rotate: 45 });
    const connOp = ops.find((o) => o.call === "addShape" && o.args[0] === "line");
    expect(connOp?.degraded).toBeFalsy();
  });

  it("slides: nothing degrades, rotation passes through", () => {
    const reqs = compileToSlidesRequests(slide);
    expect(reqs.every((r) => !r.degraded)).toBe(true);
    const diamondReq = reqs.find((r) => r.args[0] === "DIAMOND");
    expect(diamondReq?.args[1]).toMatchObject({ rotation: 45 });
  });
});

describe("scenario 2 — the flag shape", () => {
  it("both compilers compose the identical wave+rectangle-staff shape", () => {
    const pptxOps = compileToPptxOps([flag]);
    const slidesReqs = compileToSlidesRequests([flag]);

    expect(pptxOps).toHaveLength(2);
    expect(pptxOps[0]).toMatchObject({ call: "addShape", args: ["wave", expect.objectContaining({ h: 1.2 * 0.7 })] });
    expect(pptxOps[0].note).toMatch(/no native flag\/pennant/);
    expect(pptxOps[1]).toMatchObject({ call: "addShape", args: ["rect", expect.any(Object)] });
    expect(pptxOps[1].note).toMatch(/staff/);

    expect(slidesReqs).toHaveLength(2);
    expect(slidesReqs[0]).toMatchObject({ call: "createShape", args: ["WAVE", expect.any(Object)] });
    expect(slidesReqs[0].note).toMatch(/no native flag\/pennant/);
    expect(slidesReqs[1]).toMatchObject({ call: "createShape", args: ["RECTANGLE", expect.any(Object)] });

    // Neither compiler's flag composition is degraded — floor and ceiling coincide.
    expect(pptxOps.every((o) => !o.degraded)).toBe(true);
    expect(slidesReqs.every((r) => !r.degraded)).toBe(true);
  });
});

describe("scenario 3 — the curved/elbow connector", () => {
  it("pptx rewrites elbow down to straight and reports the degradation", () => {
    const ops = compileToPptxOps([connector("elbow")]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ call: "addShape", args: ["line", expect.objectContaining({ style: "straight" })], degraded: true });
    expect(ops[0].note).toMatch(/rewritten to straight/);
  });

  it("pptx rewrites curved down to straight and reports the degradation", () => {
    const ops = compileToPptxOps([connector("curved")]);
    expect(ops[0]).toMatchObject({ degraded: true });
    expect(ops[0].note).toMatch(/requested "curved"/);
  });

  it("pptx does not degrade a straight request", () => {
    const ops = compileToPptxOps([connector("straight")]);
    expect(ops[0].degraded).toBeFalsy();
    expect(ops[0].note).toBeUndefined();
  });

  it("slides honors elbow and curved as requested, never degraded", () => {
    const elbowReq = compileToSlidesRequests([connector("elbow")])[0];
    expect(elbowReq).toMatchObject({ call: "createLine", degraded: false });
    expect(elbowReq.args[0]).toMatchObject({ category: "BENT" });

    const curvedReq = compileToSlidesRequests([connector("curved")])[0];
    expect(curvedReq.args[0]).toMatchObject({ category: "CURVED" });
    expect(curvedReq.degraded).toBe(false);
  });
});

describe("scenario 4 — rich BLUF text (3 styled runs)", () => {
  it("both compilers preserve all 3 runs distinctly, never flattened to one blob", () => {
    const pptxOp = compileToPptxOps([richText])[0];
    const pptxRuns = pptxOp.args[0] as Array<{ text: string; options: { bold: boolean; italic: boolean; color?: string } }>;
    expect(pptxRuns).toHaveLength(3);
    expect(pptxRuns[1]).toMatchObject({ text: "at risk", options: expect.objectContaining({ bold: true, color: "#b3261e" }) });
    expect(pptxRuns[2].options.italic).toBe(true);

    const slidesReq = compileToSlidesRequests([richText])[0];
    const slidesRuns = slidesReq.args[0] as Array<{ text: string; style: { bold: boolean; foregroundColor?: string } }>;
    expect(slidesRuns).toHaveLength(3);
    expect(slidesRuns[1]).toMatchObject({ text: "at risk", style: expect.objectContaining({ bold: true, foregroundColor: "#b3261e" }) });
  });
});

describe("scenario 5 — an illegal shape", () => {
  it("is rejected before either compiler runs, with a named reason", () => {
    const bad = { id: "x", kind: "hexagon", x: 1, y: 1, w: 1, h: 1 } as unknown as Shape;
    expect(() => compileToPptxOps([bad])).toThrow(IRValidationError);
    expect(() => compileToSlidesRequests([bad])).toThrow(IRValidationError);
  });
});

describe("compiler op ordering", () => {
  it("mirrors input shape order op-for-op, easy to diff by eye", () => {
    const slide = [rect, connector("straight"), richText];
    const pptxOps = compileToPptxOps(slide);
    const slidesReqs = compileToSlidesRequests(slide);
    expect(pptxOps.map((o) => o.call)).toEqual(["addShape", "addShape", "addText"]);
    expect(slidesReqs.map((r) => r.call)).toEqual(["createShape", "createLine", "insertText"]);
  });

  it("produces no ops for an empty slide", () => {
    expect(compileToPptxOps([])).toEqual([]);
    expect(compileToSlidesRequests([])).toEqual([]);
  });
});
