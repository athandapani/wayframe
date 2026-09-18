import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shape, Slide } from "@/lib/export/deck-ir";
import { addSlides, createPresentation, EMU_PER_INCH, exportSlideDeckToGoogleSlides, inchesToEmu, moveFileToFolder, requestsForSlide } from "./slides-api";
import { compileToSlidesRequests } from "@/lib/export/deck-ir";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("inchesToEmu", () => {
  it("converts inches to EMU at 914400 per inch", () => {
    expect(inchesToEmu(1)).toBe(EMU_PER_INCH);
    expect(inchesToEmu(13.333)).toBe(Math.round(13.333 * 914400));
  });
});

describe("createPresentation", () => {
  it("POSTs to presentations with a pageSize sized to the app's fixed slide canvas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ presentationId: "pres-1", slides: [{ objectId: "page-1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPresentation("token-123", "My Deck");

    expect(result).toEqual({ presentationId: "pres-1", firstPageObjectId: "page-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slides.googleapis.com/v1/presentations");
    expect(init.headers.Authorization).toBe("Bearer token-123");
    const body = JSON.parse(init.body);
    expect(body.title).toBe("My Deck");
    expect(body.pageSize.width.unit).toBe("EMU");
    expect(body.pageSize.width.magnitude).toBe(inchesToEmu(13.333));
    expect(body.pageSize.height.magnitude).toBe(inchesToEmu(7.5));
  });

  it("throws when the response has no initial slide", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ presentationId: "pres-1", slides: [] })));
    await expect(createPresentation("t", "x")).rejects.toThrow();
  });

  it("throws with the status and body on a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, false, 400)));
    await expect(createPresentation("t", "x")).rejects.toThrow(/400/);
  });
});

describe("addSlides", () => {
  it("returns [] without calling fetch when count is 0", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await addSlides("t", "pres-1", 0)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one createSlide request per extra page and reads back their objectIds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ replies: [{ createSlide: { objectId: "page-2" } }, { createSlide: { objectId: "page-3" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ids = await addSlides("t", "pres-1", 2);

    expect(ids).toEqual(["page-2", "page-3"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slides.googleapis.com/v1/presentations/pres-1:batchUpdate");
    const body = JSON.parse(init.body);
    expect(body.requests).toEqual([{ createSlide: { insertionIndex: 1 } }, { createSlide: { insertionIndex: 2 } }]);
  });
});

const rect: Shape = { id: "r1", kind: "rect", x: 1, y: 2, w: 3, h: 1, fill: "#112233" };
const diamond: Shape = { id: "d1", kind: "diamond", x: 0, y: 0, w: 0.2, h: 0.2, fill: "#ff0000", rotationDeg: 45 };
const connector: Shape = { id: "c1", kind: "connector", from: { x: 1, y: 1 }, to: { x: 3, y: 1 }, style: "straight", color: "#5b6472" };
const verticalConnector: Shape = { id: "c2", kind: "connector", from: { x: 2, y: 1 }, to: { x: 2, y: 4 }, style: "straight", color: "#5b6472" };
const text: Shape = { id: "t1", kind: "text", x: 0.5, y: 0.5, w: 2, h: 0.3, runs: [{ text: "Bold red ", bold: true, color: "#ff0000" }, { text: "plain" }] };

describe("requestsForSlide", () => {
  it("createShape: emits createShape + updateShapeProperties, remapping RECT to RECTANGLE", () => {
    const slide: Slide = [rect];
    const requests = requestsForSlide("page-1", compileToSlidesRequests(slide));

    expect(requests).toHaveLength(2);
    const create = requests[0] as { createShape: { objectId: string; elementProperties: { pageObjectId: string; size: unknown; transform: { scaleX: number; translateX: number; translateY: number } }; shapeType: string } };
    expect(create.createShape.shapeType).toBe("RECTANGLE");
    expect(create.createShape.elementProperties.pageObjectId).toBe("page-1");
    expect(create.createShape.elementProperties.transform).toMatchObject({ scaleX: 1, scaleY: 1, translateX: inchesToEmu(1), translateY: inchesToEmu(2) });

    const update = requests[1] as { updateShapeProperties: { objectId: string; shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: { red: number; green: number; blue: number } } } } }; fields: string } };
    expect(update.updateShapeProperties.objectId).toBe(create.createShape.objectId);
    expect(update.updateShapeProperties.fields).toBe("shapeBackgroundFill.solidFill.color");
    expect(update.updateShapeProperties.shapeProperties.shapeBackgroundFill.solidFill.color.rgbColor).toEqual({ red: 0x11 / 255, green: 0x22 / 255, blue: 0x33 / 255 });
  });

  it("does not remap ellipse/diamond/star kinds — they already match real ShapeType values", () => {
    const requests = requestsForSlide("page-1", compileToSlidesRequests([diamond]));
    const create = requests[0] as { createShape: { shapeType: string } };
    expect(create.createShape.shapeType).toBe("DIAMOND");
  });

  it("rotation is expressed via the transform matrix, not a separate field, and keeps the shape centered", () => {
    const requests = requestsForSlide("page-1", compileToSlidesRequests([diamond]));
    const create = requests[0] as { createShape: { elementProperties: { transform: Record<string, number> } } };
    const t = create.createShape.elementProperties.transform;
    expect(t.rotation).toBeUndefined();
    expect(t.scaleX).toBeCloseTo(Math.cos(Math.PI / 4));
    expect(t.shearY).toBeCloseTo(Math.sin(Math.PI / 4));
    // Center-pivot correction: the shape's center (x + w/2, y + h/2) = (0.1, 0.1)
    // must still land there after the corner-pivoted rotation matrix is
    // applied. `t.scaleX/shearX/shearY/scaleY` are unitless; only
    // `translateX/Y` are in EMU, so those need converting to inches before
    // adding them to the (already-inches) w/h terms.
    const cx = diamond.x + diamond.w / 2;
    const cy = diamond.y + diamond.h / 2;
    const rotatedCx = t.scaleX * (diamond.w / 2) + t.shearX * (diamond.h / 2) + t.translateX / EMU_PER_INCH;
    const rotatedCy = t.shearY * (diamond.w / 2) + t.scaleY * (diamond.h / 2) + t.translateY / EMU_PER_INCH;
    expect(rotatedCx).toBeCloseTo(cx, 3);
    expect(rotatedCy).toBeCloseTo(cy, 3);
  });

  it("createLine: encodes the line as a 1x1 EMU unit square stretched by scaleX/scaleY, plus stroke color", () => {
    const requests = requestsForSlide("page-1", compileToSlidesRequests([connector]));
    expect(requests).toHaveLength(2);
    const create = requests[0] as { createLine: { elementProperties: { size: { width: { magnitude: number } }; transform: { scaleX: number; scaleY: number; translateX: number; translateY: number } }; category: string } };
    expect(create.createLine.category).toBe("STRAIGHT");
    expect(create.createLine.elementProperties.size.width.magnitude).toBe(1);
    expect(create.createLine.elementProperties.transform.scaleX).toBe(inchesToEmu(2));
    expect(create.createLine.elementProperties.transform.translateX).toBe(inchesToEmu(1));

    const update = requests[1] as { updateLineProperties: { lineProperties: { lineFill: { solidFill: { color: { rgbColor: unknown } } } } } };
    expect(update.updateLineProperties.lineProperties.lineFill.solidFill.color.rgbColor).toBeDefined();
  });

  it("createLine: floors a degenerate zero-width/height delta to a tiny non-zero scale instead of 0", () => {
    const requests = requestsForSlide("page-1", compileToSlidesRequests([verticalConnector]));
    const create = requests[0] as { createLine: { elementProperties: { transform: { scaleX: number; scaleY: number } } } };
    expect(create.createLine.elementProperties.transform.scaleX).not.toBe(0);
    expect(create.createLine.elementProperties.transform.scaleY).toBe(inchesToEmu(3));
  });

  it("insertText: expands into createShape + insertText + one updateTextStyle per styled run, with correct index ranges", () => {
    const requests = requestsForSlide("page-1", compileToSlidesRequests([text]));
    expect(requests.map((r) => Object.keys(r)[0])).toEqual(["createShape", "insertText", "updateTextStyle"]);

    const create = requests[0] as { createShape: { objectId: string; shapeType: string } };
    expect(create.createShape.shapeType).toBe("TEXT_BOX");

    const insert = requests[1] as { insertText: { objectId: string; insertionIndex: number; text: string } };
    expect(insert.insertText.objectId).toBe(create.createShape.objectId);
    expect(insert.insertText.text).toBe("Bold red plain");
    expect(insert.insertText.insertionIndex).toBe(0);

    // Only the first run ("Bold red " — 9 chars) carries any style (bold+color); the
    // plain second run gets no updateTextStyle request at all.
    const style = requests[2] as { updateTextStyle: { objectId: string; textRange: { startIndex: number; endIndex: number }; style: { bold: boolean; foregroundColor: { opaqueColor: { rgbColor: unknown } } }; fields: string } };
    expect(style.updateTextStyle.textRange).toEqual({ type: "FIXED_RANGE", startIndex: 0, endIndex: 9 });
    expect(style.updateTextStyle.style.bold).toBe(true);
    expect(style.updateTextStyle.fields).toBe("bold,foregroundColor");
  });
});

describe("exportSlideDeckToGoogleSlides", () => {
  it("creates the presentation, adds one page per extra slide, then batches every page's requests together", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ presentationId: "pres-1", slides: [{ objectId: "page-1" }] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ replies: [{ createSlide: { objectId: "page-2" } }] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ replies: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const slides: Slide[] = [[rect], [diamond]];
    const result = await exportSlideDeckToGoogleSlides("token", slides, "My Deck");

    expect(result).toEqual({ presentationId: "pres-1", presentationUrl: "https://docs.google.com/presentation/d/pres-1/edit" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const finalBatch = JSON.parse(fetchMock.mock.calls[2][1].body);
    // 2 requests for the rect (createShape + updateShapeProperties) + 2 for the diamond.
    expect(finalBatch.requests).toHaveLength(4);
  });

  it("skips the final batchUpdate call entirely when there is nothing to draw", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ presentationId: "pres-1", slides: [{ objectId: "page-1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await exportSlideDeckToGoogleSlides("token", [[]], "Empty Deck");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("moveFileToFolder", () => {
  it("reads the file's current parents, then addParents/removeParents to reparent it", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ parents: ["old-folder"] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "file-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await moveFileToFolder("token", "file-1", "new-folder");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [getUrl] = fetchMock.mock.calls[0];
    expect(getUrl).toContain("drive/v3/files/file-1?fields=parents");
    const [patchUrl, patchInit] = fetchMock.mock.calls[1];
    expect(patchInit.method).toBe("PATCH");
    expect(patchUrl).toContain("addParents=new-folder");
    expect(patchUrl).toContain("removeParents=old-folder");
  });

  it("omits removeParents when the file currently has no parents", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "file-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await moveFileToFolder("token", "file-1", "new-folder");

    const [patchUrl] = fetchMock.mock.calls[1];
    expect(patchUrl).not.toContain("removeParents");
  });

  it("throws when the Drive update call fails", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ parents: [] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "nope" }, false, 403));
    vi.stubGlobal("fetch", fetchMock);

    await expect(moveFileToFolder("token", "file-1", "new-folder")).rejects.toThrow(/403/);
  });
});
