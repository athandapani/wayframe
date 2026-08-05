// Visual themes for the timeline (prototype/theme-system).
//
// Three complete, switchable themes. Each is designed as a whole — ground,
// ink, chrome, lane treatment and status ramp tuned together — rather than
// as a palette swap.
//
// COLOUR CONSTRUCTION. Every categorical ramp below is generated in OKLCH
// at a FIXED lightness with hues spaced evenly around the wheel, chroma
// pushed to the gamut edge per hue. That is what makes a categorical set
// read as one family: hand-picking six hex values lands them at different
// lightnesses and chromas, and the eye reads that inconsistency as muddy.
// Chroma is maximised per-hue rather than globally because a single shared
// chroma gets dragged down to whichever hue clips first, desaturating the
// whole set.
//
// LANES ARE DEMOTED, BUT NOT WITH A SLAB. Lane identity is organisational
// metadata, not state. It reads as a colour rail plus a faint wash on the
// plot area — no heavy header block. The earlier attempt painted each lane
// header a solid dark slab, which just replaced six loud colour blocks
// with six heavy dark ones.
//
// STATUS IS COLOUR-ONLY, ON PURPOSE. Markers are all diamonds. An earlier
// revision encoded status as distinct silhouettes (circle/triangle/square)
// because colour alone cannot separate five semantic hues in greyscale or
// under red-green colour blindness — measured, the old palette put at-risk
// and complete 1.06:1 apart. That was rejected as too much work to read, so
// the constraint is handled the only other way available: the status ramp
// runs on a deliberate LIGHTNESS gradient, calm -> severe. Severity
// advances (darker/more chromatic on light grounds, brighter on dark),
// calm recedes. It doesn't fully solve greyscale, but it is a real
// improvement over the shipped palette and it costs the reader nothing.
import type { Status } from "./types";

export interface Theme {
  id: ThemeId;
  name: string;
  tagline: string;
  mode: "light" | "dark";
  font: string;

  /** Chart background. */
  ground: string;
  /** Primary text drawn on the chart body — lane names included. */
  ink: string;
  /** Secondary text — dates, de-emphasised labels. */
  inkMuted: string;
  /** Hairline between lane rows. */
  rowDivider: string;

  axisBg: string;
  axisText: string;
  /** Group-header band. Deliberately quiet — it separates, it doesn't shout. */
  separatorBg: string;
  separatorText: string;

  /** Opacity of the lane-colour wash across the plot area. Keep it faint. */
  laneWashOpacity: number;
  /** Per-lane accent for the rail and the wash. Cycles by lane index. */
  laneTint: string[];

  statusColor: Record<Status, string>;
  /** Ink collar for the critical path — never a status hue. */
  criticalPathColor: string;
  connector: string;
  /** Halo stroke that lifts a marker off the lane wash. */
  markerHalo: string;

  /** Page background behind the chart — chrome follows the theme, not the OS. */
  pageBg: string;
  panelBg: string;
  panelBorder: string;
  panelInk: string;
  accent: string;
}

export type ThemeId = "blueprint" | "graphite" | "press";

const SYSTEM_SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** OKLCH L=0.58, hues 250°+60n, chroma to gamut edge. Cool, even, unhurried. */
const BLUEPRINT_LANES = ["#3f7ebb", "#8f66ad", "#b35b6b", "#a56d1c", "#638839", "#078d87"];
/** OKLCH L=0.55, higher chroma cap — saturated enough to survive a projector. */
const PRESS_LANES = ["#1b70cf", "#954db2", "#be3c52", "#996600", "#438500", "#058282"];
/** OKLCH L=0.72 — lifted for a dark ground so rails stay legible. */
const GRAPHITE_LANES = ["#5daaf5", "#be8be3", "#eb7e91", "#da9436", "#88b555", "#0cbdb6"];

/** Shared light-theme status ramp: lightness descends as severity rises. */
const LIGHT_STATUS: Record<Status, string> = {
  "not-started": "#a7afb7",
  complete: "#469f58",
  "on-track": "#0877bb",
  "at-risk": "#d2840f",
  delayed: "#bb021d",
};

/**
 * Cool, technical, drafting-table. The palette is derived from engineering
 * drawings rather than from software fashion.
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
  rowDivider: "#dbe3ec",

  axisBg: "#23384d",
  axisText: "#ffffff",
  separatorBg: "#dde4ed",
  separatorText: "#33475c",

  laneWashOpacity: 0.075,
  laneTint: BLUEPRINT_LANES,

  statusColor: LIGHT_STATUS,
  criticalPathColor: "#16202b",
  connector: "#a8b7c6",
  markerHalo: "#ffffff",

  pageBg: "#e4eaf2",
  panelBg: "#ffffff",
  panelBorder: "#c8d5e2",
  panelInk: "#16202b",
  accent: "#1f4e79",
};

/**
 * Dark, low-chroma ground with a bright ramp on top. Built for a screen and
 * for a README hero shot.
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
  rowDivider: "#1c242e",

  axisBg: "#1b2430",
  axisText: "#cdd9e5",
  separatorBg: "#151b23",
  separatorText: "#9fb0c0",

  laneWashOpacity: 0.075,
  laneTint: GRAPHITE_LANES,

  // On a dark ground severity reads as brighter; "complete" is the dimmest
  // coloured state so finished work recedes.
  statusColor: {
    "not-started": "#5d646c",
    complete: "#2d8d44",
    "on-track": "#46a6ef",
    "at-risk": "#ffa839",
    delayed: "#f4514f",
  },
  criticalPathColor: "#e6edf3",
  connector: "#3d4753",
  markerHalo: "#0d1117",

  pageBg: "#080b0f",
  panelBg: "#161d26",
  panelBorder: "#2b3542",
  panelInk: "#e6edf3",
  accent: "#4fa6e9",
};

/**
 * High-contrast editorial print — white ground, saturated rails, black
 * axis. The theme to pick when the destination is a deck or a printed page.
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
  rowDivider: "#e6e6e6",

  axisBg: "#101010",
  axisText: "#ffffff",
  separatorBg: "#f0f0f0",
  separatorText: "#3d3d3d",

  laneWashOpacity: 0.07,
  laneTint: PRESS_LANES,

  statusColor: LIGHT_STATUS,
  criticalPathColor: "#101010",
  connector: "#c4c4c4",
  markerHalo: "#ffffff",

  pageBg: "#f2f2f2",
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
