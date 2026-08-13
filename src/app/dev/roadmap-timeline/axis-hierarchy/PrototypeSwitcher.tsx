// PROTOTYPE (wayframe#70) — throwaway. Floating variant switcher per the
// /prototype UI-variant skill: ?variant= in the URL, arrow keys, hidden in
// production builds.

"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const VARIANTS = [
  { id: "A", name: "Preset ladder" },
  { id: "B", name: "Level stepper" },
  { id: "C", name: "Settings matrix" },
  { id: "D", name: "Depth control" },
  { id: "E", name: "Timeline-edge disclosure" },
] as const;

export function PrototypeSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setVariant = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const currentIndex = Math.max(
    0,
    VARIANTS.findIndex((v) => v.id === current),
  );

  const cycle = useCallback(
    (dir: 1 | -1) => {
      const next = VARIANTS[(currentIndex + dir + VARIANTS.length) % VARIANTS.length];
      setVariant(next.id);
    },
    [currentIndex, setVariant],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const isEditable = el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (isEditable) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  if (process.env.NODE_ENV === "production") return null;

  const active = VARIANTS[currentIndex];

  return (
    <div
      className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border px-4 py-2 text-sm shadow-lg"
      style={{ background: "#101418", borderColor: "#3d4753", color: "#e6edf3" }}
    >
      <button onClick={() => cycle(-1)} aria-label="Previous variant" className="px-1 text-lg leading-none">
        ←
      </button>
      <span className="font-mono">
        {active.id} — {active.name}
      </span>
      <button onClick={() => cycle(1)} aria-label="Next variant" className="px-1 text-lg leading-none">
        →
      </button>
    </div>
  );
}
