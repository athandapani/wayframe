"use client";

// Presence UX (wayframe t36) — avatar stack + colored remote-selection
// rings, per the wayframe#112 prototype's Variant B verdict: avatars +
// selection highlighting as the core design, live cursors deferred/optional
// (a mouse position over an SVG chart isn't as legible as a text cursor),
// follow-mode left as valid future work rather than bundled into this cut.
// `onSelect` is kept optional so a later follow-mode ticket can add the
// click affordance without touching this component's shape.
//
// No caller supplies real peers yet — real Yjs awareness state (see
// src/lib/realtime/provider.ts) isn't wired into the app until t14/t37/t38
// land. This is the display half only.
export interface Peer {
  id: string;
  name: string;
  /** Also the color of this peer's remote-selection ring, passed to RoadmapTimeline's `remoteSelections` — one color per peer, everywhere. */
  color: string;
}

export function PresenceAvatars({ peers, following, onSelect }: { peers: Peer[]; following?: string | null; onSelect?: (id: string) => void }) {
  if (peers.length === 0) return null;
  return (
    <div className="mb-3 flex items-center gap-2 text-xs" style={{ color: "var(--wf-ink)" }}>
      <span className="font-semibold opacity-60">Online:</span>
      {peers.map((p) => (
        <button
          key={p.id}
          onClick={onSelect ? () => onSelect(p.id) : undefined}
          title={onSelect ? (following === p.id ? `Following ${p.name} — click to stop` : `Follow ${p.name}`) : p.name}
          disabled={!onSelect}
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: p.color, outline: following === p.id ? `2px solid ${p.color}` : "2px solid transparent", outlineOffset: 2, cursor: onSelect ? "pointer" : "default" }}
        >
          {p.name[0]?.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/**
 * Milestone id -> peer color, for RoadmapTimeline's `remoteSelections`.
 * wayframe#112's gist left "two peers selecting the same milestone at once"
 * as an open question — this resolves it as last-writer-wins (later peer in
 * `peers` silently overwrites an earlier one's ring on that milestone) only
 * because RoadmapTimeline's `remoteSelections` is a flat id->color map;
 * revisit if/when real multi-peer contention turns out to matter in practice.
 */
export function remoteSelectionsFromPeers(peers: (Peer & { selectedId?: string | null })[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of peers) {
    if (p.selectedId) map[p.selectedId] = p.color;
  }
  return map;
}
