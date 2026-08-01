// PROTOTYPE — inline controls for theme + axis-tier depth, separate from the
// variant switcher (these are cross-cutting knobs, not a variant choice).
"use client";

import { THEMES, type Theme } from "./theme";
import { AXIS_PRESETS, type AxisTierConfig } from "./axis-tiers";

export function ThemeAxisControls({
  theme,
  onThemeChange,
  axisTiers,
  onAxisTiersChange,
  axisBg,
  onAxisBgChange,
  separatorBg,
  onSeparatorBgChange,
}: {
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  axisTiers: AxisTierConfig;
  onAxisTiersChange: (c: AxisTierConfig) => void;
  axisBg: string;
  onAxisBgChange: (color: string) => void;
  separatorBg: string;
  onSeparatorBgChange: (color: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-zinc-700 dark:text-zinc-300">
      <label className="flex items-center gap-2">
        Theme
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          value={theme.key}
          onChange={(e) => {
            const next = THEMES.find((t) => t.key === e.target.value);
            if (next) onThemeChange(next);
          }}
        >
          {THEMES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        Timeline tiers
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          value={axisTiers.key}
          onChange={(e) => {
            const next = AXIS_PRESETS.find((c) => c.key === e.target.value);
            if (next) onAxisTiersChange(next);
          }}
        >
          {AXIS_PRESETS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {/* structural color knobs, not a one-off fix — timeline header and swimlane
          separator bars are independently themeable, per issue #7 feedback */}
      <label className="flex items-center gap-2">
        Timeline header color
        <input
          type="color"
          className="h-7 w-9 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
          value={axisBg}
          onChange={(e) => onAxisBgChange(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2">
        Separator color
        <input
          type="color"
          className="h-7 w-9 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
          value={separatorBg}
          onChange={(e) => onSeparatorBgChange(e.target.value)}
        />
      </label>
    </div>
  );
}
