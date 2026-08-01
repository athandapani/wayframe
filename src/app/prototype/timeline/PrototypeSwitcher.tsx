// PROTOTYPE — floating variant switcher. Hidden in production builds.
// Not for reuse elsewhere yet (only one prototype route exists); relocate to
// src/components if a second prototype needs it.
"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface VariantMeta {
  key: string;
  label: string;
}

export function PrototypeSwitcher({ variants, current }: { variants: VariantMeta[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", key);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const idx = variants.findIndex((v) => v.key === current);
      if (e.key === "ArrowLeft") {
        go(variants[(idx - 1 + variants.length) % variants.length].key);
      } else if (e.key === "ArrowRight") {
        go(variants[(idx + 1) % variants.length].key);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, variants, go]);

  if (process.env.NODE_ENV === "production") return null;

  const idx = variants.findIndex((v) => v.key === current);
  const currentMeta = variants[idx] ?? variants[0];

  return (
    <div className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-sm text-white shadow-xl backdrop-blur">
      <button
        aria-label="Previous variant"
        className="rounded-full px-2 py-1 hover:bg-white/10"
        onClick={() => go(variants[(idx - 1 + variants.length) % variants.length].key)}
      >
        ←
      </button>
      <span className="min-w-[10rem] text-center font-medium">
        {currentMeta.key} — {currentMeta.label}
      </span>
      <button
        aria-label="Next variant"
        className="rounded-full px-2 py-1 hover:bg-white/10"
        onClick={() => go(variants[(idx + 1) % variants.length].key)}
      >
        →
      </button>
    </div>
  );
}
