"use client";

// Add / rename / reorder / recolour / delete swimlanes.
//
// This was in the product's stated scope from the start ("configurable L2
// swimlanes") and was the last piece of it missing: lanes could only be
// recoloured, and only ever came from whatever the extraction produced.
//
// It's a modal rather than another options-menu row because a row per lane
// with five controls each doesn't fit a 288px dropdown, and because
// deleting a lane needs enough room to say what it will take with it.
import { useState } from "react";
import type { Rag, RoadmapData, Swimlane } from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import { laneColorAt } from "@/components/timeline/lane-colors";

const RAG_OPTIONS: { value: Rag | "auto"; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "green", label: "Green" },
  { value: "amber", label: "Amber" },
  { value: "red", label: "Red" },
];

const DENSITY_OPTIONS: { value: "normal" | "lean"; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "lean", label: "Lean" },
];

export interface SwimlaneManagerProps {
  data: RoadmapData;
  theme: Theme;
  onAdd: (type: "lane" | "separator") => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onColor: (id: string, color: string | undefined) => void;
  /** Manual RAG override (wayframe#55/#58) — mirrors isCriticalPathOverride's pattern; "auto" clears back to the computed worst-status-wins rollup. Lanes only, mirroring onColor. */
  onRagOverride: (id: string, rag: Rag | "auto") => void;
  /** "Normal vs lean" row-height toggle — lanes only, mirrors onColor/onRagOverride's placement. */
  onDensity: (id: string, density: "normal" | "lean") => void;
  onClose: () => void;
}

export function SwimlaneManager({ data, theme, onAdd, onRename, onRemove, onMove, onColor, onRagOverride, onDensity, onClose }: SwimlaneManagerProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const ordered = [...data.swimlanes].sort((a, b) => a.order - b.order);
  const laneIndexById = new Map<string, number>();
  ordered.filter((l) => l.type === "lane").forEach((l, i) => laneIndexById.set(l.id, i));
  const laneCount = laneIndexById.size;

  const milestoneCount = (laneId: string) => data.milestones.filter((m) => m.laneId === laneId).length;

  function fallbackColor(lane: Swimlane): string {
    return laneColorAt(theme.laneRamp, laneIndexById.get(lane.id) ?? 0, Math.max(laneCount, 1));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)", borderWidth: 1 }}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Swimlanes"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--wf-border)" }}>
          <div>
            <h1 className="text-base font-semibold">Swimlanes</h1>
            <p className="text-xs opacity-60">Rename, reorder, recolour. Groups are the bands that separate sections.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100">
            ✕
          </button>
        </div>

        <ul className="divide-y p-2" style={{ borderColor: "var(--wf-border)" }}>
          {ordered.map((lane, i) => {
            const isLane = lane.type === "lane";
            const count = isLane ? milestoneCount(lane.id) : 0;
            const confirming = confirmingId === lane.id;
            return (
              <li key={lane.id} className="flex flex-wrap items-center gap-2 px-2 py-2" style={{ borderColor: "var(--wf-border)" }}>
                <div className="flex shrink-0 flex-col">
                  <button
                    onClick={() => onMove(lane.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${lane.name} up`}
                    className="px-1 text-[10px] leading-tight opacity-60 hover:opacity-100 disabled:opacity-20"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => onMove(lane.id, 1)}
                    disabled={i === ordered.length - 1}
                    aria-label={`Move ${lane.name} down`}
                    className="px-1 text-[10px] leading-tight opacity-60 hover:opacity-100 disabled:opacity-20"
                  >
                    ▼
                  </button>
                </div>

                {isLane ? (
                  <input
                    type="color"
                    aria-label={`Colour for ${lane.name}`}
                    value={lane.color ?? fallbackColor(lane)}
                    onChange={(e) => onColor(lane.id, e.target.value)}
                    style={{ borderColor: "var(--wf-border)" }}
                    className="h-6 w-7 shrink-0 cursor-pointer rounded border bg-transparent p-0"
                  />
                ) : (
                  <span className="w-7 shrink-0 text-center text-[10px] opacity-50">grp</span>
                )}

                <input
                  value={lane.name}
                  onChange={(e) => onRename(lane.id, e.target.value)}
                  aria-label={`Name of ${lane.name}`}
                  style={{ borderColor: "var(--wf-border)" }}
                  className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-sm"
                />

                {isLane && (
                  <select
                    value={lane.ragOverride ?? "auto"}
                    onChange={(e) => onRagOverride(lane.id, e.target.value as Rag | "auto")}
                    aria-label={`RAG override for ${lane.name}`}
                    style={{ borderColor: "var(--wf-border)" }}
                    className="shrink-0 rounded border bg-transparent px-1.5 py-1 text-xs"
                  >
                    {RAG_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}

                {isLane && (
                  <select
                    value={lane.density ?? "normal"}
                    onChange={(e) => onDensity(lane.id, e.target.value as "normal" | "lean")}
                    aria-label={`Row height for ${lane.name}`}
                    title="Row height — Lean is 75% of Normal"
                    style={{ borderColor: "var(--wf-border)" }}
                    className="shrink-0 rounded border bg-transparent px-1.5 py-1 text-xs"
                  >
                    {DENSITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}

                <span className="w-20 shrink-0 text-right text-[11px] opacity-55">
                  {isLane ? `${count} item${count === 1 ? "" : "s"}` : "group"}
                </span>

                {confirming ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => {
                        onRemove(lane.id);
                        setConfirmingId(null);
                      }}
                      className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white"
                    >
                      {count > 0 ? `Delete + ${count}` : "Delete"}
                    </button>
                    <button onClick={() => setConfirmingId(null)} className="text-[11px] opacity-60 hover:opacity-100">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingId(lane.id)}
                    aria-label={`Delete ${lane.name}`}
                    style={{ borderColor: "var(--wf-border)" }}
                    className="shrink-0 rounded border px-2 py-1 text-[11px] opacity-70 hover:opacity-100"
                  >
                    Delete
                  </button>
                )}

                {/* Named before it happens rather than after — the milestones go
                    with the lane, and a count is the only honest warning. */}
                {confirming && count > 0 && (
                  <p className="w-full text-[11px] text-red-500">
                    This also deletes {count} milestone{count === 1 ? "" : "s"} in this lane, and any dependency on them. Undo reverses it.
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2 border-t p-4" style={{ borderColor: "var(--wf-border)" }}>
          <button
            onClick={() => onAdd("lane")}
            style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
            className="rounded-full px-3 py-1.5 text-xs font-medium"
          >
            Add a lane
          </button>
          <button
            onClick={() => onAdd("separator")}
            style={{ borderColor: "var(--wf-border)" }}
            className="rounded-full border px-3 py-1.5 text-xs"
          >
            Add a group band
          </button>
          <span className="ml-auto text-[11px] opacity-55">Every change here is undoable.</span>
        </div>
      </div>
    </div>
  );
}
