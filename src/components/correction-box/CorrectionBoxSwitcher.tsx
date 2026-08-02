"use client";

// Owns which of the two shipped correction-box UI shapes is showing (issue
// #9: Variant A default, Variant B kept as a togglable alternate) and the
// toggle between them. Real settings/hamburger nav doesn't exist yet, so
// this is a minimal inline toggle affordance rather than a menu item —
// an acceptable stand-in per #14 until that nav shell exists.
import { useState } from "react";
import { CorrectionBox } from "./CorrectionBox";
import { CorrectionSidebar } from "./CorrectionSidebar";
import type { UseCorrectionBoxResult } from "./use-correction-box";

type Mode = "bar" | "sidebar";

export function CorrectionBoxSwitcher({ box }: { box: UseCorrectionBoxResult }) {
  const [mode, setMode] = useState<Mode>("bar");

  return (
    <>
      {mode === "sidebar" ? <CorrectionSidebar box={box} /> : <CorrectionBox box={box} />}
      <button
        onClick={() => setMode((m) => (m === "bar" ? "sidebar" : "bar"))}
        className="fixed right-4 top-4 z-50 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs shadow dark:border-zinc-600 dark:bg-zinc-900"
      >
        {mode === "bar" ? "Sidebar mode" : "Bar mode"}
      </button>
    </>
  );
}
