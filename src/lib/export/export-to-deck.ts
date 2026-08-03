// html2canvas-pro, not html2canvas: Tailwind v4's oklch()/lab() colors throw
// "unsupported color function" in stock html2canvas — the pro fork parses them.
import html2canvas from "html2canvas-pro";
import pptxgenjs from "pptxgenjs";

export interface DeckSlideSource {
  label: string;
  element: HTMLElement;
}

const SLIDE_WIDTH_IN = 13.333;
const SLIDE_HEIGHT_IN = 7.5;

/**
 * RoadmapTimeline's root scrolls horizontally (its SVG is wider than the
 * viewport) — html2canvas otherwise captures only the clipped visible region.
 * Force overflow visible on any scrolling descendant for the capture, then restore.
 */
async function captureFullContent(element: HTMLElement): Promise<HTMLCanvasElement> {
  const restores: Array<() => void> = [];
  for (const el of [element, ...Array.from(element.querySelectorAll<HTMLElement>("*"))]) {
    const style = getComputedStyle(el);
    if (["auto", "scroll"].includes(style.overflowX) || ["auto", "scroll"].includes(style.overflowY)) {
      const prev = el.style.overflow;
      el.style.overflow = "visible";
      restores.push(() => (el.style.overflow = prev));
    }
  }
  try {
    // html2canvas's internal render window otherwise defaults to the current
    // browser viewport, re-clipping content wider than the viewport even with
    // overflow visible — force it to the element's true (unclipped) extent.
    return await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 2,
      width: element.scrollWidth,
      height: element.scrollHeight,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });
  } finally {
    restores.forEach((restore) => restore());
  }
}

/**
 * Renders each source element to a full-bleed image slide via html2canvas + pptxgenjs
 * (addImage only — no native-editable shapes/text; see wayframe#27).
 */
export async function exportToDeck(sources: DeckSlideSource[], fileName: string): Promise<void> {
  const pres = new pptxgenjs();
  pres.defineLayout({ name: "WAYFRAME_WIDE", width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pres.layout = "WAYFRAME_WIDE";

  for (const source of sources) {
    const canvas = await captureFullContent(source.element);
    const data = canvas.toDataURL("image/png");

    const aspect = canvas.width / canvas.height;
    let w = SLIDE_WIDTH_IN;
    let h = w / aspect;
    if (h > SLIDE_HEIGHT_IN) {
      h = SLIDE_HEIGHT_IN;
      w = h * aspect;
    }
    const x = (SLIDE_WIDTH_IN - w) / 2;
    const y = (SLIDE_HEIGHT_IN - h) / 2;

    const slide = pres.addSlide();
    slide.addImage({ data, x, y, w, h });
  }

  await pres.writeFile({ fileName });
}
