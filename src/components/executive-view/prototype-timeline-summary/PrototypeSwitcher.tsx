// PROTOTYPE (wayframe#37) — throwaway. Floating variant switcher, per the
// /prototype skill's UI.md convention. Gated out of production builds.
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export const VARIANTS = [
  { id: "A", name: "Mini timeline strip" },
  { id: "B", name: "Narrative + date chips" },
  { id: "C", name: "Segmented phase bar" },
] as const;

export type VariantId = (typeof VARIANTS)[number]["id"];

export function useVariant(): VariantId {
  const params = useSearchParams();
  const v = params.get("variant");
  return (VARIANTS.find((x) => x.id === v)?.id ?? "A") as VariantId;
}

export function PrototypeSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = useVariant();
  const index = VARIANTS.findIndex((v) => v.id === current);

  function go(delta: number) {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    const sp = new URLSearchParams(params.toString());
    sp.set("variant", next.id);
    router.replace(`${pathname}?${sp.toString()}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  const variant = VARIANTS[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full border bg-white px-3 py-1.5 text-xs shadow-lg dark:bg-zinc-900">
      <button onClick={() => go(-1)} aria-label="Previous variant" className="px-1 text-base">
        ←
      </button>
      <span className="font-medium">
        {variant.id} — {variant.name}
      </span>
      <button onClick={() => go(1)} aria-label="Next variant" className="px-1 text-base">
        →
      </button>
    </div>
  );
}
