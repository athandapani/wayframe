"use client";

// PROTOTYPE (wayframe#112) — throwaway. Three variants answering "what does
// presence look like on the swimlane chart": remote cursors, colored
// avatars, remote selection highlighting, follow-mode. No collaboration
// infrastructure exists yet — two fake peers with simulated cursor
// positions and selections on a timer, standing in for Yjs awareness state
// (#78 already selected Yjs; its `{clientID -> JSON state}` awareness
// protocol is exactly this shape for real).
//
// A = remote cursors only.
// B = avatar stack + colored selection rings (reuses RoadmapTimeline's real
//     local selection-ring mechanism via a new `remoteSelections` prop),
//     no cursor tracking.
// C = everything, plus follow-mode (click an avatar to auto-scroll toward
//     whatever that peer currently has selected).
import { useEffect, useMemo, useRef, useState } from "react";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { collisionStressRoadmap, collisionStressToday } from "@/components/timeline/__fixtures__/collision-stress-roadmap";

const PEERS = [
  { id: "peer-1", name: "Ravi", color: "#e0552b" },
  { id: "peer-2", name: "Mina", color: "#2b7de0" },
] as const;

interface PeerState {
  xPct: number;
  yPct: number;
  selectedId: string | null;
}

function clamp01(n: number): number {
  return Math.max(0.05, Math.min(0.95, n));
}

function useFakePresence(milestoneIds: string[]) {
  // Deterministic initial state (SSR and first client render must match —
  // randomizing here caused a hydration mismatch); real randomization only
  // happens client-side, after mount, in the effect below.
  const [state, setState] = useState<Record<string, PeerState>>(() =>
    Object.fromEntries(PEERS.map((p) => [p.id, { xPct: 0.5, yPct: 0.5, selectedId: milestoneIds[0] ?? null }])),
  );
  useEffect(() => {
    setState(
      Object.fromEntries(
        PEERS.map((p) => [p.id, { xPct: Math.random() * 0.8 + 0.1, yPct: Math.random() * 0.6 + 0.1, selectedId: milestoneIds[Math.floor(Math.random() * milestoneIds.length)] ?? null }]),
      ),
    );
    const cursorTimer = setInterval(() => {
      setState((s) => {
        const next = { ...s };
        for (const p of PEERS) {
          const cur = next[p.id];
          next[p.id] = { ...cur, xPct: clamp01(cur.xPct + (Math.random() - 0.5) * 0.18), yPct: clamp01(cur.yPct + (Math.random() - 0.5) * 0.18) };
        }
        return next;
      });
    }, 900);
    const selectionTimer = setInterval(() => {
      setState((s) => {
        const next = { ...s };
        for (const p of PEERS) {
          next[p.id] = { ...next[p.id], selectedId: milestoneIds[Math.floor(Math.random() * milestoneIds.length)] ?? null };
        }
        return next;
      });
    }, 3500);
    return () => {
      clearInterval(cursorTimer);
      clearInterval(selectionTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestoneIds.join(",")]);
  return state;
}

function CursorOverlay({ presence }: { presence: Record<string, PeerState> }) {
  return (
    <>
      {PEERS.map((p) => {
        const st = presence[p.id];
        if (!st) return null;
        return (
          <div
            key={p.id}
            className="pointer-events-none absolute z-20 transition-all duration-700 ease-out"
            style={{ left: `${st.xPct * 100}%`, top: `${st.yPct * 100}%` }}
          >
            <div className="h-3.5 w-3.5 rounded-full border-2 border-white shadow" style={{ background: p.color }} />
            <div className="mt-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow" style={{ background: p.color }}>
              {p.name}
            </div>
          </div>
        );
      })}
    </>
  );
}

function PresenceAvatars({ following, onSelect }: { following?: string | null; onSelect?: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-zinc-500">Online:</span>
      {PEERS.map((p) => (
        <button
          key={p.id}
          onClick={onSelect ? () => onSelect(p.id) : undefined}
          title={onSelect ? (following === p.id ? `Following ${p.name} — click to stop` : `Follow ${p.name}`) : p.name}
          disabled={!onSelect}
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: p.color, outline: following === p.id ? `2px solid ${p.color}` : "2px solid transparent", outlineOffset: 2 }}
        >
          {p.name[0]}
        </button>
      ))}
    </div>
  );
}

function useRemoteSelections(presence: Record<string, PeerState>) {
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of PEERS) {
      const id = presence[p.id]?.selectedId;
      if (id) map[id] = p.color;
    }
    return map;
  }, [presence]);
}

export function PresenceVariantA() {
  const milestoneIds = useMemo(() => collisionStressRoadmap.milestones.map((m) => m.id), []);
  const presence = useFakePresence(milestoneIds);
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        Remote cursors only — a colored dot + name tag per peer, floating over the chart, position updates every ~900ms. No avatar list, no selection
        highlight, no follow mode.
      </p>
      <div className="relative h-[600px] overflow-auto rounded border border-zinc-300 dark:border-zinc-700">
        <CursorOverlay presence={presence} />
        <RoadmapTimeline data={collisionStressRoadmap} today={collisionStressToday} />
      </div>
    </div>
  );
}

export function PresenceVariantB() {
  const milestoneIds = useMemo(() => collisionStressRoadmap.milestones.map((m) => m.id), []);
  const presence = useFakePresence(milestoneIds);
  const remoteSelections = useRemoteSelections(presence);
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        Avatar stack (static, not clickable) + colored selection rings — reuses <code>RoadmapTimeline</code>&apos;s real local selection-ring mechanism
        (the same one mass-edit's <code>selectedIds</code> uses), just parameterized per remote peer&apos;s color via a prototype-only{" "}
        <code>remoteSelections</code> prop. No live cursor tracking — you only know where someone is by what lights up.
      </p>
      <div className="mb-3">
        <PresenceAvatars />
      </div>
      <div className="relative h-[600px] overflow-auto rounded border border-zinc-300 dark:border-zinc-700">
        <RoadmapTimeline data={collisionStressRoadmap} today={collisionStressToday} remoteSelections={remoteSelections} />
      </div>
    </div>
  );
}

const DOMAIN_START = Date.parse("2026-04-17");
const DOMAIN_END = Date.parse("2026-07-01");

export function PresenceVariantC() {
  const milestoneIds = useMemo(() => collisionStressRoadmap.milestones.map((m) => m.id), []);
  const presence = useFakePresence(milestoneIds);
  const remoteSelections = useRemoteSelections(presence);
  const [following, setFollowing] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!following) return;
    const selectedId = presence[following]?.selectedId;
    const m = collisionStressRoadmap.milestones.find((mm) => mm.id === selectedId);
    const el = containerRef.current;
    if (!m || !el) return;
    const frac = (Date.parse(m.date) - DOMAIN_START) / (DOMAIN_END - DOMAIN_START);
    const targetLeft = Math.max(0, frac * el.scrollWidth - el.clientWidth / 2);
    el.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [following, presence]);

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        Everything: live cursors, avatar stack, colored selection rings, and follow mode — click a peer&apos;s avatar to auto-scroll toward whatever
        they currently have selected (approximated from the milestone&apos;s date, not a real pixel lookup — good enough to feel the interaction).
      </p>
      <div className="mb-3 flex items-center gap-3">
        <PresenceAvatars following={following} onSelect={(id) => setFollowing((f) => (f === id ? null : id))} />
        {following && <span className="text-xs text-zinc-500">Following {PEERS.find((p) => p.id === following)?.name} — click their avatar again to stop.</span>}
      </div>
      <div ref={containerRef} className="relative h-[600px] overflow-auto rounded border border-zinc-300 dark:border-zinc-700">
        <CursorOverlay presence={presence} />
        <RoadmapTimeline data={collisionStressRoadmap} today={collisionStressToday} remoteSelections={remoteSelections} />
      </div>
    </div>
  );
}

const VARIANTS = [
  { key: "a", name: "Cursors only", Component: PresenceVariantA },
  { key: "b", name: "Avatars + selection highlight", Component: PresenceVariantB },
  { key: "c", name: "Everything + follow mode", Component: PresenceVariantC },
] as const;

export function PresenceSwitcher({ current, onChange }: { current: string; onChange: (k: string) => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      const idx = VARIANTS.findIndex((v) => v.key === current);
      if (e.key === "ArrowLeft") onChange(VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length].key);
      if (e.key === "ArrowRight") onChange(VARIANTS[(idx + 1) % VARIANTS.length].key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, onChange]);

  if (process.env.NODE_ENV === "production") return null;
  const idx = VARIANTS.findIndex((v) => v.key === current);
  const active = VARIANTS[idx] ?? VARIANTS[0];
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
      <button onClick={() => onChange(VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length].key)} className="px-2 text-lg leading-none">
        ←
      </button>
      <span className="font-mono">
        {active.key.toUpperCase()} — {active.name}
      </span>
      <button onClick={() => onChange(VARIANTS[(idx + 1) % VARIANTS.length].key)} className="px-2 text-lg leading-none">
        →
      </button>
    </div>
  );
}

export function presenceVariantComponent(key: string) {
  return (VARIANTS.find((v) => v.key === key) ?? VARIANTS[0]).Component;
}
