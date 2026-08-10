"use client";

// PROTOTYPE switcher shell — generic per the /prototype skill convention.
// Not gated separately; the page that mounts it is already dev-only
// (notFound() in production), but this stays out of any production render
// tree as a second line of defense.
import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export interface Variant {
  key: string;
  name: string;
}

export function PrototypeSwitcher({ variants }: { variants: Variant[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("variant") ?? variants[0].key;
  const index = Math.max(0, variants.findIndex((v) => v.key === current));

  function go(delta: 1 | -1) {
    const next = variants[(index + delta + variants.length) % variants.length];
    router.replace(`${pathname}?variant=${next.key}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const active = variants[index];

  return (
    <div className="fixed bottom-5 left-1/2 z-[999] flex -translate-x-1/2 items-center gap-3 rounded-full border border-fuchsia-400 bg-black px-3 py-2 text-xs text-white shadow-[0_0_0_3px_rgba(217,70,239,0.25)]">
      <button onClick={() => go(-1)} aria-label="Previous variant" className="px-1.5 text-fuchsia-300 hover:text-white">
        ←
      </button>
      <span className="font-mono">
        {active.key} — {active.name}
      </span>
      <button onClick={() => go(1)} aria-label="Next variant" className="px-1.5 text-fuchsia-300 hover:text-white">
        →
      </button>
    </div>
  );
}

export function useVariant(variants: Variant[]): string {
  const searchParams = useSearchParams();
  return searchParams.get("variant") ?? variants[0].key;
}
