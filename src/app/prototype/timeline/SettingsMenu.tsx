// PROTOTYPE — theme + axis-tier + color controls, tucked behind a hamburger
// button inline with the page header so they're hidden until opened.
"use client";

import { useEffect, useRef, useState } from "react";
import { THEMES, type Theme } from "./theme";
import { AXIS_PRESETS, type AxisTierConfig } from "./axis-tiers";

export function SettingsMenu({
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open display settings"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <line x1="2" y1="5" x2="16" y2="5" />
          <line x1="2" y1="9" x2="16" y2="9" />
          <line x1="2" y1="13" x2="16" y2="13" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-11 right-0 z-30 w-64 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <label className="mb-3 flex items-center justify-between gap-2">
            Theme
            <select
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
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

          <label className="mb-3 flex items-center justify-between gap-2">
            Timeline tiers
            <select
              className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
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

          <div className="mb-1 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">Chrome colors</p>
            <label className="mb-3 flex items-center justify-between gap-2">
              Timeline header
              <input type="color" className="h-7 w-9 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700" value={axisBg} onChange={(e) => onAxisBgChange(e.target.value)} />
            </label>
            <label className="flex items-center justify-between gap-2">
              Separator
              <input
                type="color"
                className="h-7 w-9 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
                value={separatorBg}
                onChange={(e) => onSeparatorBgChange(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
