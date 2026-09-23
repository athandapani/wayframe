"use client";

// PROTOTYPE — throwaway. Floating variant switcher for the 3 Version History
// shapes, per the /prototype skill's UI convention. wayframe#127. Hidden in
// production by the host page's own dev-only gate.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

export const VARIANTS = [
  { key: "a", label: "A — Versions modal + read-only route" },
  { key: "b", label: "B — Right History dock, swaps in place" },
  { key: "c", label: "C — Version ribbon over the axis" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

export function useVersionVariant(): VariantKey {
  const searchParams = useSearchParams();
  const v = searchParams.get("variant");
  return (VARIANTS.some((x) => x.key === v) ? v : "a") as VariantKey;
}

export function VersionSwitcher() {
  const current = useVersionVariant();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goTo = useCallback(
    (key: VariantKey) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", key);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const cycle = useCallback(
    (dir: 1 | -1) => {
      const idx = VARIANTS.findIndex((v) => v.key === current);
      goTo(VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length].key);
    },
    [current, goTo],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      // ← / → belong to variant C's own ribbon stepping, so the switcher
      // takes shift+arrow here rather than stealing the key the design
      // under test is proposing.
      if (!e.shiftKey) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  const label = VARIANTS.find((v) => v.key === current)!.label;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-400 bg-emerald-950/90 px-4 py-2 text-sm text-white shadow-lg shadow-emerald-900/40">
      <button onClick={() => cycle(-1)} className="px-1 font-bold" aria-label="Previous variant">
        &larr;
      </button>
      <span className="min-w-[320px] text-center font-mono">{label}</span>
      <button onClick={() => cycle(1)} className="px-1 font-bold" aria-label="Next variant">
        &rarr;
      </button>
      <span className="font-mono text-[10px] opacity-60">shift+←/→</span>
    </div>
  );
}
