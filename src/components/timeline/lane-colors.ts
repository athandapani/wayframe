// Lane accent generation (prototype/theme-system).
//
// Lane colours used to be a fixed array of six hex values indexed with
// `% 6`, so a seventh swimlane silently reused the first lane's colour.
// They're generated instead, from the active theme's ramp spec, so any
// number of lanes gets a distinct accent.
//
// Hues are spread evenly across the wheel for however many lanes exist
// (360/count). A golden-angle sequence was tried first because it keeps
// each lane's colour stable when you add one, but measured at 9 lanes it
// folds back on itself — lanes 1 and 9 came out as two near-identical
// blues (RGB distance 34, against ~44 for even spacing). Distinctness wins:
// adding a lane re-spreads the hues, and any lane whose colour matters can
// be pinned with Swimlane.color, which overrides generation entirely.
//
// Measured closest-pair RGB distance by lane count: 4 -> 93, 6 -> 76,
// 8 -> 50, 9 -> 44, 12 -> 30. Twelve is where a categorical ramp starts to
// strain; pinning is the escape hatch past that.
//
// Lightness and chroma stay fixed per theme, which is what makes the set
// read as one family.
//
// Chroma is reduced per hue only as far as needed to stay inside sRGB; a
// single shared chroma would be dragged down to whichever hue clips first,
// desaturating everything.

export interface LaneRamp {
  /** OKLCH lightness — fixed across the ramp. */
  L: number;
  /** OKLCH chroma ceiling; reduced per hue if it would clip. */
  C: number;
  /** Hue of the first lane, in degrees. */
  startHue: number;
}

function oklchToRgb(L: number, C: number, hDeg: number): { r: number; g: number; b: number; clipped: boolean } {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const bb = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = L - 0.0894841775 * a - 1.291485548 * bb;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const clipped = [R, G, B].some((v) => v < -0.001 || v > 1.001);
  const enc = (v: number) => {
    const g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, g)) * 255);
  };
  return { r: enc(R), g: enc(G), b: enc(B), clipped };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** The accent for lane `index` of `count` total lanes. */
export function laneColorAt(ramp: LaneRamp, index: number, count: number): string {
  const hue = (ramp.startHue + (360 / Math.max(count, 1)) * index) % 360;
  let c = ramp.C;
  let rgb = oklchToRgb(ramp.L, c, hue);
  while (rgb.clipped && c > 0.02) {
    c -= 0.004;
    rgb = oklchToRgb(ramp.L, c, hue);
  }
  return toHex(rgb);
}

/** Convenience for previews and pickers. */
export function laneColors(ramp: LaneRamp, count: number): string[] {
  return Array.from({ length: count }, (_, i) => laneColorAt(ramp, i, count));
}
