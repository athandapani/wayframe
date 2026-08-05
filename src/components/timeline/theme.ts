// Visual themes for the timeline (prototype/theme-system).
//
// Replaces the single hard-coded theme. Three complete, switchable themes,
// each designed as a whole rather than as a palette swap — grounds, ink,
// lane treatment and status ramp are tuned together per theme.
//
// Two structural changes from the original theme, both from the design
// review (WF-03 / WF-04):
//
//  1. Lanes are DEMOTED. The old theme painted each lane header a fully
//     saturated tint, making the loudest thing on the chart the one that
//     carries the least information (lane order). Lane identity now reads
//     as a neutral header slab plus a thin colour rail, so the visual
//     budget goes to status instead.
//  2. Status is encoded by SHAPE first, colour second. This was measured,
//     not assumed. Three palettes were tried:
//       - the original (all Tailwind -500): at-risk vs complete 1.06:1,
//         i.e. identical in greyscale and under red-green colour blindness;
//       - a "make everything clear 3:1 against the ground" fix: *worse*,
//         1.00:1 — forcing uniform contrast against the background forces
//         uniform lightness against each other;
//       - a solver maximising pairwise separation: reached 1.50:1 but
//         produced dark-brown "at-risk" and a pale mint "complete" that
//         was the loudest thing on a dark chart. Semantically wrong.
//     With five hues that must still *read* as their meaning, colour tops
//     out around 1.1–1.5:1 pairwise. So colour can't be the encoding —
//     STATUS_SHAPE in RoadmapTimeline carries it, and colour reinforces.
//     What the palettes below still guarantee is that the semantically
//     opposite pair (at-risk vs complete) is never confusable, and that
//     severity is visually louder than calm: "complete" is deliberately
//     de-emphasised, because finished work should recede.
//
// Critical path is drawn as an ink spine rather than a red ring, so it can
// never be confused with the red that means "delayed".
import type { Status } from "./types";

export interface Theme {
  id: ThemeId;
  name: string;
  tagline: string;
  mode: "light" | "dark";
  font: string;

  /** Chart background. */
  ground: string;
  /** Primary text drawn on the chart body. */
  ink: string;
  /** Secondary text — dates, de-emphasised labels. */
  inkMuted: string;

  axisBg: string;
  axisText: string;
  separatorBg: string;
  separatorText: string;

  /** Neutral slab behind the lane name — deliberately not the lane colour. */
  laneHeaderBg: string;
  laneHeaderText: string;
  /** Opacity of the lane-colour wash across the plot area. Keep it faint. */
  laneWashOpacity: number;
  /** Per-lane accent, used for the rail and the wash. Cycles by lane index. */
  laneTint: string[];

  statusColor: Record<Status, string>;
  /** Ink spine for the critical path — never a status hue. */
  criticalPathColor: string;
  /** Dependency connector lines. */
  connector: string;
  /** Halo stroke that lifts a marker off the lane wash. */
  markerHalo: string;

  /** Page background behind the chart — chrome follows the theme, not the OS. */
  pageBg: string;
  /** Floating panel surface (BLUF callout, menus). */
  panelBg: string;
  panelBorder: string;
  /** Panel text. */
  panelInk: string;
  /** Single accent for chrome emphasis. */
  accent: string;
}

export type ThemeId = "blueprint" | "graphite" | "press";

const SYSTEM_SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * Cool, technical, drafting-table. Hairlines and restraint; the palette is
 * derived from engineering drawings rather than from software fashion.
 */
export const blueprintTheme: Theme = {
  id: "blueprint",
  name: "Blueprint",
  tagline: "Cool and technical — reads like an engineering drawing",
  mode: "light",
  font: SYSTEM_SANS,

  ground: "#eef2f7",
  ink: "#16202b",
  inkMuted: "#5b6b7c",

  axisBg: "#23384d",
  axisText: "#ffffff",
  separatorBg: "#33475c",
  separatorText: "#ffffff",

  laneHeaderBg: "#1d2b3a",
  laneHeaderText: "#ffffff",
  laneWashOpacity: 0.05,
  laneTint: ["#3f7fae", "#3f8f72", "#a8814a", "#7b6aa5", "#3f8b99", "#a85f5f"],

  statusColor: {
    "not-started": "#9aa4b2",
    complete: "#6fb894",
    "on-track": "#1a5f9e",
    "at-risk": "#c2740a",
    delayed: "#b81f31",
  },
  criticalPathColor: "#16202b",
  connector: "#9fb0c0",
  markerHalo: "#ffffff",

  pageBg: "#e7edf4",
  panelBg: "#ffffff",
  panelBorder: "#c8d5e2",
  panelInk: "#16202b",
  accent: "#1f4e79",
};

/**
 * Dark, low-chroma, cinematic. Built for a screen and for a README hero
 * shot — the ground recedes so the status ramp and the critical spine are
 * the only bright things in frame.
 */
export const graphiteTheme: Theme = {
  id: "graphite",
  name: "Graphite",
  tagline: "Dark and cinematic — built for a screenshot",
  mode: "dark",
  font: SYSTEM_SANS,

  ground: "#0d1117",
  ink: "#e6edf3",
  inkMuted: "#8b949e",

  axisBg: "#1b2430",
  axisText: "#cdd9e5",
  separatorBg: "#1f2933",
  separatorText: "#e6edf3",

  laneHeaderBg: "#161d26",
  laneHeaderText: "#e6edf3",
  laneWashOpacity: 0.055,
  laneTint: ["#58a6ff", "#3fb950", "#d29922", "#bc8cff", "#39c5cf", "#f778ba"],

  // On a dark ground severity reads as *brighter*, so "complete" is the
  // dimmest coloured state and delayed/at-risk carry the light.
  statusColor: {
    "not-started": "#4f5865",
    complete: "#2f7d55",
    "on-track": "#6cb0f0",
    "at-risk": "#f0a020",
    delayed: "#ff6b63",
  },
  criticalPathColor: "#e6edf3",
  connector: "#48535f",
  markerHalo: "#0d1117",

  pageBg: "#080b0f",
  panelBg: "#161d26",
  panelBorder: "#2b3542",
  panelInk: "#e6edf3",
  accent: "#6cb0f0",
};

/**
 * High-contrast editorial print. Black rules, white ground, saturated
 * rails — the theme to pick when the roadmap's destination is a deck or a
 * printed page rather than a screen.
 */
export const pressTheme: Theme = {
  id: "press",
  name: "Press",
  tagline: "High-contrast print — for decks and handouts",
  mode: "light",
  font: SYSTEM_SANS,

  ground: "#ffffff",
  ink: "#101010",
  inkMuted: "#6b6b6b",

  axisBg: "#101010",
  axisText: "#ffffff",
  separatorBg: "#2b2b2b",
  separatorText: "#ffffff",

  laneHeaderBg: "#101010",
  laneHeaderText: "#ffffff",
  laneWashOpacity: 0.045,
  laneTint: ["#0a72d0", "#0e8a5f", "#d1600a", "#8b3fc4", "#0d8a99", "#c02b3f"],

  statusColor: {
    "not-started": "#b0b0b0",
    complete: "#4aa87c",
    "on-track": "#1160b0",
    "at-risk": "#c96a05",
    delayed: "#a8122a",
  },
  criticalPathColor: "#101010",
  connector: "#b8b8b8",
  markerHalo: "#ffffff",

  pageBg: "#f4f4f4",
  panelBg: "#ffffff",
  panelBorder: "#d6d6d6",
  panelInk: "#101010",
  accent: "#101010",
};

export const THEMES: Record<ThemeId, Theme> = {
  blueprint: blueprintTheme,
  graphite: graphiteTheme,
  press: pressTheme,
};

export const THEME_LIST: Theme[] = [blueprintTheme, graphiteTheme, pressTheme];

export const defaultTheme = blueprintTheme;
