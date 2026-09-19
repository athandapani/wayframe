/**
 * RenderableProgram -> Deck IR translator (wayframe t30) — the piece
 * deck-ir.ts's own header comment flagged as missing ("this module has no
 * consumers yet ... t30 owns wiring this in"). Turns one rendered slide
 * descriptor's roadmap data into a `Slide` (Shape[]) that `compileToPptxOps`/
 * `compileToSlidesRequests` can compile, so both export destinations
 * (Download .pptx, Send to Google Slides) share exactly one translation of
 * "what a roadmap looks like as native shapes."
 *
 * SCOPE BOUNDARY (deliberate, matching t19's own precedent for declaring a
 * simplification rather than reimplementing fragile on-screen machinery):
 * this is a genuinely scoped v1 native-shape layout, NOT a pixel port of
 * RoadmapTimeline.tsx's on-screen SVG renderer. In scope: real dates->x via
 * the caller-supplied domain (the same domain `computeDomain`/zoom produce),
 * real per-lane duration-pill sub-row stacking via lane-rows.ts's
 * `computeLaneRowModel` (reused for its real job: bucketing + greedy
 * interval stacking), and the full t19 style-resolution ladder for marker
 * shape/scale/color/hidden and phase shape/size. Out of scope, on purpose:
 * ghost badges, ai-risk projections, tiered label collision-avoidance,
 * elbow/curved connector routing (connectors always compile as "straight"
 * intent here — the on-screen elbow router in connector-router.ts is
 * interactive-layout-specific, not a concern this translator owns),
 * SwimlaneGroup nesting/bands (visible lanes render as one flat ordered
 * list), and critical-path glow rendering. A native-shape deck is meant to
 * read well as a deck, not reproduce every on-screen affordance.
 *
 * UNITS: inches throughout, matching pptxgenjs's own coordinate system and
 * export-to-deck.ts's existing SLIDE_WIDTH_IN/SLIDE_HEIGHT_IN (13.333x7.5).
 * lane-rows.ts's `computeLaneRowModel`/`PILL_PHASE_HEIGHT`/`ROW_GAP` are
 * themselves unit-agnostic (they only add/compare numbers), so this module
 * feeds them its OWN slide-scaled pixel vocabulary (`SLIDE_PX_PER_IN=96`,
 * `ROW1_FLOOR_PX`/`BASE_SLOT_PX`) rather than RoadmapTimeline.tsx's real
 * on-screen constants (`LANE_ROW1_FLOOR`, `PILL_ROW_HEIGHT`) — those bake in
 * assumptions from the on-screen tiered-label system this translator
 * deliberately doesn't replicate, and are tuned for a tall scrolling canvas,
 * not a fixed-height slide. Because a slide has a hard vertical boundary
 * (unlike the on-screen chart, which can just scroll), the whole lane stack
 * is uniformly SHRUNK (never stretched) to fit the available slide height
 * when its natural height would overflow — the inverse of
 * `computeFitToScreenRatio`'s expand-only posture, needed here because
 * "just make the slide taller" isn't an option.
 */
import type { LegendCategory, Program, RenderableProgram, Swimlane } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import { parseDate } from "@/components/timeline/date-utils";
import { resolveHidden, resolveMarkerColor, resolveMarkerScale, resolveMarkerShape, resolvePhaseSize } from "@/components/timeline/style-resolution";
import { PILL_PHASE_HEIGHT } from "@/components/timeline/RoadmapTimeline";
import { laneColorAt } from "@/components/timeline/lane-colors";
import { computeLaneRowModel, ROW_GAP, type RowItem } from "@/lib/layout/lane-rows";
import { SLIDE_HEIGHT_IN, SLIDE_WIDTH_IN } from "./export-to-deck";
import { validateShape, type ConnectorShape, type GeometricShape, type Shape, type Slide, type TextShape } from "./deck-ir";
import type { ExecutiveTimelineSummary } from "@/components/executive-view/timeline-summary";

const MARGIN_LEFT_IN = 1.6;
const MARGIN_RIGHT_IN = 0.3;
const HEADER_HEIGHT_IN = 0.55;
const PROGRAM_BAND_HEIGHT_IN = 0.45;
const BOTTOM_MARGIN_IN = 0.15;

/** This module's own slide-scaled pixel vocabulary for feeding lane-rows.ts's allocator — see header doc for why this isn't RoadmapTimeline.tsx's real on-screen constants. */
const SLIDE_PX_PER_IN = 96;
const ROW1_FLOOR_PX = 48;
const BASE_SLOT_PX = 18;

const MARKER_BASE_RADIUS_IN = 0.11;
const LABEL_HEIGHT_IN = 0.16;
const LABEL_WIDTH_IN = 1.1;

let shapeCounter = 0;
function nextId(prefix: string): string {
  shapeCounter += 1;
  return `${prefix}-${shapeCounter}`;
}

/** Strips HTML tags + decodes the handful of entities BLUF's sanitized rich text realistically contains, into one plain-text run. A DOM-free regex pass, not a real HTML-to-runs parser (t7's research already flagged that as unbuilt infrastructure — not this ticket's job to build). */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Blends `fg` over `bg` at `alpha` (0-1) into one opaque hex — used for the lane wash, since deck-ir.ts's Shape.fill is a single plain color string with no separate opacity field. */
function mixHex(fg: string, bg: string, alpha: number): string {
  const parse = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [fr, fgc, fb] = parse(fg);
  const [br, bgc, bb] = parse(bg);
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return `#${[mix(fr, br), mix(fgc, bgc), mix(fb, bb)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function textShape(id: string, x: number, y: number, w: number, h: number, text: string, opts?: { color?: string; sizePt?: number; bold?: boolean; italic?: boolean }): TextShape {
  return { id, kind: "text", x, y, w, h, runs: [{ text, color: opts?.color, sizePt: opts?.sizePt, bold: opts?.bold, italic: opts?.italic }] };
}

/** Maps t19's six-shape MarkerShape vocabulary onto the IR's narrower kind set — "circle" has no IR primitive of its own (closest is "ellipse"), "square"/"rectangle" both collapse to IR "rect" (the IR has no distinct rounded-corner concept). */
function markerIrKind(shape: ReturnType<typeof resolveMarkerShape>): GeometricShape["kind"] {
  switch (shape) {
    case "circle":
      return "ellipse";
    case "square":
    case "rectangle":
      return "rect";
    case "star":
      return "star";
    case "flag":
      return "flag";
    case "diamond":
    default:
      return "diamond";
  }
}

interface Placed {
  x: number;
  y: number;
}

function markerShapeFor(id: string, x: number, y: number, kind: GeometricShape["kind"], radiusIn: number, fill: string): GeometricShape {
  const w = kind === "rect" ? radiusIn * 2.4 : radiusIn * 2;
  const h = kind === "rect" ? radiusIn * 1.6 : radiusIn * 2;
  return {
    id,
    kind,
    x: x - w / 2,
    y: y - h / 2,
    w,
    h,
    fill,
    // Matches CushionMarker's own on-screen 45deg rotation for "diamond" only (RoadmapTimeline.tsx) — every other shape renders unrotated.
    rotationDeg: kind === "diamond" ? 45 : undefined,
  };
}

interface LaneLayout {
  lane: Swimlane;
  topIn: number;
  heightIn: number;
  /** Row-1 vertical center (inches) — where a point milestone always sits, regardless of how many duration-pill sub-rows Row 1 itself needs. */
  row1CenterIn: number;
  /** Per-milestone-id sub-row center (inches), for duration-pill milestones only. */
  pillCenterById: Map<string, { yIn: number; heightIn: number }>;
}

function layoutLanes(renderable: RenderableProgram, program: Program, theme: Theme, plotTopIn: number, plotBottomIn: number): LaneLayout[] {
  const visibleLanes = renderable.swimlanes.filter((sl) => sl.type === "lane" && !sl.hidden).sort((a, b) => a.order - b.order);

  const perLaneModel = visibleLanes.map((lane) => {
    const pills = renderable.milestones.filter((m) => m.laneId === lane.id && m.endDate && !resolveHidden(m, program));
    const items: RowItem[] = pills.map((m) => ({
      id: m.id,
      start: parseDate(m.date),
      end: parseDate(m.endDate!),
      laneRow: m.laneRow,
      sizeFloor: PILL_PHASE_HEIGHT[resolvePhaseSize(m, program, theme)],
    }));
    return { lane, model: computeLaneRowModel(items, { baseSlotHeight: BASE_SLOT_PX, row1Floor: ROW1_FLOOR_PX }) };
  });

  const totalNaturalPx = perLaneModel.reduce((sum, l) => sum + l.model.naturalHeight, 0) + Math.max(0, perLaneModel.length - 1) * ROW_GAP;
  const totalNaturalIn = totalNaturalPx / SLIDE_PX_PER_IN;
  const availableIn = Math.max(0, plotBottomIn - plotTopIn);
  // Shrink-only: a slide can't grow to fit like the on-screen scrollable chart can, so oversized content is compressed uniformly rather than allowed to overflow. Never stretches sparse content past 1x — a nearly-empty Program shouldn't get artificially tall lanes.
  const scale = totalNaturalIn > 0 && totalNaturalIn > availableIn ? availableIn / totalNaturalIn : 1;
  const pxToIn = (px: number) => (px / SLIDE_PX_PER_IN) * scale;

  const layouts: LaneLayout[] = [];
  let cursorIn = plotTopIn;
  for (const { lane, model } of perLaneModel) {
    const laneHeightIn = pxToIn(model.naturalHeight);
    const row1 = model.rows.find((r) => r.row === 1);
    const row1HeightIn = row1 ? pxToIn(row1.height) : laneHeightIn;
    const pillCenterById = new Map<string, { yIn: number; heightIn: number }>();
    let rowTopIn = cursorIn;
    for (const row of model.rows) {
      const rowHeightIn = pxToIn(row.height);
      let subRowTopIn = rowTopIn;
      for (let subRow = 0; subRow < row.subRowCount; subRow++) {
        const slotHeightIn = pxToIn(row.slotHeights[subRow]);
        const center = subRowTopIn + slotHeightIn / 2;
        for (const item of row.items) {
          if (row.subRowById.get(item.id) === subRow) pillCenterById.set(item.id, { yIn: center, heightIn: slotHeightIn });
        }
        subRowTopIn += slotHeightIn;
      }
      rowTopIn += rowHeightIn + pxToIn(ROW_GAP);
    }
    layouts.push({ lane, topIn: cursorIn, heightIn: laneHeightIn, row1CenterIn: cursorIn + row1HeightIn / 2, pillCenterById });
    cursorIn += laneHeightIn + pxToIn(ROW_GAP);
  }
  return layouts;
}

export interface BuildSlideIRInput {
  renderable: RenderableProgram;
  theme: Theme;
  domain: { domainMin: number; domainMax: number };
  legendCategoryFillEnabled: boolean;
  title?: string;
}

/** Builds one `mode: "program"` descriptor's Slide. See module header for the scope boundary. */
export function buildSlideIR(input: BuildSlideIRInput): Slide {
  const { renderable, theme, domain, legendCategoryFillEnabled } = input;
  const program = renderable as unknown as Program;
  const shapes: Shape[] = [];

  const plotLeftIn = MARGIN_LEFT_IN;
  const plotRightIn = SLIDE_WIDTH_IN - MARGIN_RIGHT_IN;
  const xOf = (dateStr: string): number => {
    const { domainMin, domainMax } = domain;
    const t = domainMax > domainMin ? (parseDate(dateStr) - domainMin) / (domainMax - domainMin) : 0.5;
    return plotLeftIn + Math.max(0, Math.min(1, t)) * (plotRightIn - plotLeftIn);
  };

  shapes.push(textShape(nextId("title"), 0.3, 0.1, SLIDE_WIDTH_IN - 0.6, HEADER_HEIGHT_IN - 0.15, input.title ?? renderable.programName, { sizePt: 20, bold: true, color: theme.ink }));

  const bandTopIn = HEADER_HEIGHT_IN;
  const bandBottomIn = bandTopIn + PROGRAM_BAND_HEIGHT_IN;
  const bandCenterIn = (bandTopIn + bandBottomIn) / 2;

  const categoryById = new Map((renderable.legendCategories ?? []).map((c) => [c.id, c] as [string, LegendCategory]));

  function emitPointMarker(id: string, dateStr: string, shapeKind: GeometricShape["kind"], scale: number, fill: string, stroke: string, yIn: number, label: string): void {
    const radiusIn = MARKER_BASE_RADIUS_IN * scale;
    shapes.push(markerShapeFor(id, xOf(dateStr), yIn, shapeKind, radiusIn, fill));
    shapes.push(textShape(nextId("label"), xOf(dateStr) - LABEL_WIDTH_IN / 2, yIn + radiusIn + 0.02, LABEL_WIDTH_IN, LABEL_HEIGHT_IN, label, { sizePt: 8, color: theme.ink }));
    void stroke; // IR GeometricShape carries fill only, not a separate stroke — the on-screen halo ring has no IR equivalent (documented degradation).
  }

  // PROGRAM band: phase / milestone / annotation TopLevelItems. `hidden`
  // and `color` now flow through the same ladder for a TopLevelItem
  // phase/milestone as they do for a lane milestone above (wayframe
  // UX-2026-09-18 §2) — RoadmapTimeline.tsx's own Program-band render was
  // the same gap, now closed there too, so the export stays in sync with
  // the real chart. (annotation has no styleOverride field at all — see
  // TopLevelItem's own union in types.ts — so it's untouched here.)
  for (const item of renderable.topLevelItems) {
    if (item.type !== "annotation" && resolveHidden(item, program)) continue;
    if (item.type === "phase") {
      const size = resolvePhaseSize(item, program, theme);
      const heightIn = (PILL_PHASE_HEIGHT[size] / SLIDE_PX_PER_IN) * 2.2;
      const x1 = xOf(item.startDate);
      const x2 = xOf(item.endDate);
      shapes.push({
        id: nextId("phase"),
        kind: "rect", // IR has no rounded-pill primitive — a plain rect is the accepted degradation, matching resolvePhaseShape's "pill" case too (see module header).
        x: Math.min(x1, x2),
        y: bandCenterIn - heightIn / 2,
        w: Math.max(0.05, Math.abs(x2 - x1)),
        h: heightIn,
        fill: item.styleOverride?.color ?? theme.statusColor[item.status], // styleOverride.color wins outright, same rung resolveMarkerColor's rung 1 uses — mirrors RoadmapTimeline.tsx's Program-band phase fill.
      });
      shapes.push(textShape(nextId("phase-label"), Math.min(x1, x2), bandCenterIn - heightIn / 2 - LABEL_HEIGHT_IN - 0.02, Math.max(0.6, Math.abs(x2 - x1)), LABEL_HEIGHT_IN, item.title, { sizePt: 8, color: theme.ink }));
    } else if (item.type === "milestone") {
      const shapeKind = markerIrKind(resolveMarkerShape(item, program, theme));
      const scale = resolveMarkerScale(item, program, theme);
      // Full color ladder (no category rung — a TopLevelItem has no categoryId), mirroring RoadmapTimeline.tsx's Program-band milestone fill.
      const { fill } = resolveMarkerColor(item, theme, program);
      emitPointMarker(nextId("top-milestone"), item.date, shapeKind, scale, fill, theme.markerHalo, bandCenterIn, item.title);
    } else {
      shapes.push(textShape(nextId("annotation"), xOf(item.date) - LABEL_WIDTH_IN / 2, bandTopIn, LABEL_WIDTH_IN, LABEL_HEIGHT_IN, item.title, { sizePt: 8, italic: true, color: theme.inkMuted }));
    }
  }

  const plotTopIn = bandBottomIn + 0.05;
  const plotBottomIn = SLIDE_HEIGHT_IN - BOTTOM_MARGIN_IN;
  const laneLayouts = layoutLanes(renderable, program, theme, plotTopIn, plotBottomIn);

  laneLayouts.forEach(({ lane, topIn, heightIn, row1CenterIn, pillCenterById }, index) => {
    const laneColor = lane.color ?? laneColorAt(theme.laneRamp, index, Math.max(1, laneLayouts.length));
    shapes.push({
      id: nextId("lane-bg"),
      kind: "rect",
      x: plotLeftIn,
      y: topIn,
      w: plotRightIn - plotLeftIn,
      h: heightIn,
      fill: mixHex(laneColor, theme.ground, theme.laneWashOpacity),
    });
    shapes.push(textShape(nextId("lane-name"), 0.1, topIn + heightIn / 2 - LABEL_HEIGHT_IN / 2, MARGIN_LEFT_IN - 0.2, LABEL_HEIGHT_IN, lane.name, { sizePt: 9, bold: true, color: theme.ink }));

    const laneMilestones = renderable.milestones.filter((m) => m.laneId === lane.id && !resolveHidden(m, program));
    for (const m of laneMilestones) {
      const category = legendCategoryFillEnabled && m.categoryId ? categoryById.get(m.categoryId) : undefined;
      const { fill, stroke } = resolveMarkerColor(m, theme, program, category);
      if (m.endDate) {
        const cell = pillCenterById.get(m.id);
        const yIn = cell?.yIn ?? row1CenterIn;
        const hIn = cell?.heightIn ?? 0.18;
        const x1 = xOf(m.date);
        const x2 = xOf(m.endDate);
        shapes.push({
          id: nextId("pill"),
          kind: "rect", // IR has no rounded-pill primitive — accepted degradation, see module header.
          x: Math.min(x1, x2),
          y: yIn - hIn / 2,
          w: Math.max(0.05, Math.abs(x2 - x1)),
          h: hIn,
          fill,
        });
        shapes.push(textShape(nextId("pill-label"), Math.min(x1, x2), yIn - hIn / 2 - LABEL_HEIGHT_IN - 0.01, Math.max(0.6, Math.abs(x2 - x1)), LABEL_HEIGHT_IN, m.shortLabel ?? m.title, { sizePt: 7, color: theme.ink }));
      } else {
        const shapeKind = markerIrKind(resolveMarkerShape(m, program, theme));
        const scale = resolveMarkerScale(m, program, theme);
        emitPointMarker(nextId("milestone"), m.date, shapeKind, scale, fill, stroke, row1CenterIn, m.shortLabel ?? m.title);
      }
    }
  });

  // Connectors — straight-only intent (see module header); predecessor and dependent must both be visible, non-hidden point milestones with showConnector:true.
  const pointCenters = new Map<string, Placed>();
  for (const { lane, row1CenterIn } of laneLayouts) {
    for (const m of renderable.milestones.filter((mm) => mm.laneId === lane.id && !mm.endDate && !resolveHidden(mm, program))) {
      pointCenters.set(m.id, { x: xOf(m.date), y: row1CenterIn });
    }
  }
  for (const m of renderable.milestones) {
    if (m.endDate || resolveHidden(m, program)) continue;
    const to = pointCenters.get(m.id);
    if (!to) continue;
    for (const edge of m.dependsOn) {
      if (!edge.showConnector) continue;
      const from = pointCenters.get(edge.id);
      if (!from) continue;
      const connector: ConnectorShape = { id: nextId("connector"), kind: "connector", from, to, style: "straight", color: theme.connector };
      shapes.push(connector);
    }
  }

  if (renderable.bluf?.statement) {
    const text = stripHtml(renderable.bluf.statement);
    if (text) {
      shapes.push(textShape(nextId("bluf"), SLIDE_WIDTH_IN - 3.6, 0.05, 3.3, 1.0, text, { sizePt: 9, color: theme.ink }));
    }
  }

  return shapes.map((s) => validateShape(s));
}

export interface BuildExecutiveSlideIRInput {
  renderable: RenderableProgram;
  theme: Theme;
  summary: ExecutiveTimelineSummary | null;
  title?: string;
}

/** Builds one `mode: "executive"` descriptor's Slide — a real but deliberately sparse translation of executive-view/timeline-summary.ts, not a port of ExecutiveView's own on-screen layout. */
export function buildExecutiveSlideIR(input: BuildExecutiveSlideIRInput): Slide {
  const { renderable, theme, summary } = input;
  const shapes: Shape[] = [];
  shapes.push(textShape(nextId("exec-title"), 0.3, 0.1, SLIDE_WIDTH_IN - 0.6, 0.4, input.title ?? renderable.programName, { sizePt: 20, bold: true, color: theme.ink }));

  if (summary?.narrative) {
    shapes.push(textShape(nextId("exec-narrative"), 0.3, 0.6, SLIDE_WIDTH_IN - 0.6, 1.2, summary.narrative, { sizePt: 12, color: theme.ink }));
  }

  const keyDates = summary?.keyDates ?? [];
  const chipW = Math.min(1.8, (SLIDE_WIDTH_IN - 0.6) / Math.max(1, keyDates.length));
  keyDates.forEach((kd, i) => {
    const x = 0.3 + i * chipW;
    const y = 2.1;
    shapes.push({ id: nextId("chip"), kind: "rect", x, y, w: chipW - 0.1, h: 0.4, fill: theme.ragColor[kd.rag] });
    shapes.push(textShape(nextId("chip-label"), x, y + 0.45, chipW - 0.1, 0.3, `${kd.label} · ${kd.date}`, { sizePt: 8, color: theme.ink }));
  });

  return shapes.map((s) => validateShape(s));
}
