"use client";

// PROTOTYPE — throwaway. wayframe#127, Variant C: no list panel anywhere. A
// VERSION RIBBON sits directly above the shared time axis — every saved
// version as a dated chip, oldest left to newest right, with `Live` as the
// right-hand end of the same strip.
//
// The bet: this app's whole idea is that a Roadmap is a picture of time, and
// a version is a position on a second time axis — when the picture was
// taken. Drawing that as a horizontal strip above the axis says so directly:
// the gaps between chips are visible, "we haven't saved anything since
// March" is legible at a glance, and stepping with ← / → feels like
// scrubbing, not like opening files. A vertical list of ISO timestamps says
// none of that.
//
// Because the ribbon costs one row and no width, viewing a version can take
// the whole screen: the left rail collapses to a narrow read-only Program
// legend while you scrub (you're reading, not restructuring), and the canvas
// gets the reclaimed width — the opposite move from B, which spends 320px to
// keep the list visible.
//
// Cost of the bet: the strip has no room for "who saved it" or a change
// summary (both go to hover/the selected chip's caption only), and it scales
// badly — 40 versions is a scrolling strip, where a list would be fine.
import { useEffect, useState } from "react";
import type { ProtoState } from "./shared";
import { MockProgramRail, ProtoStatePanel, VersionCanvas, describeChange, formatSavedAt, versionTitle } from "./shared";

export function VariantC({ state }: { state: ProtoState }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  // Oldest → newest, so the ribbon reads left-to-right like the axis under it.
  const chronological = [...state.versions].reverse();
  const positions = [...chronological.map((v) => v.id), null as string | null];
  const index = positions.indexOf(state.viewingId);

  const { setViewingId } = state;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.shiftKey) return; // shift+arrows belong to the prototype switcher
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const i = index + (e.key === "ArrowRight" ? 1 : -1);
      setViewingId(positions[Math.min(positions.length - 1, Math.max(0, i))]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selected = state.viewing;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex min-h-0 flex-1">
        {/* Reading a version doesn't need the structure editor — the rail
            shrinks to a legend and hands the width to the canvas. */}
        {state.readOnly ? (
          <aside className="w-[180px] shrink-0 border-r border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Programs in this version</p>
            {state.shownPrograms.map((p) => (
              <div key={p.id} className="flex items-baseline gap-2 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate">{p.programName}</span>
                <span className="opacity-50">{p.milestones.length}</span>
              </div>
            ))}
            <p className="mt-3 text-[11px] leading-snug text-gray-400">Lane editing comes back when you return to Live.</p>
          </aside>
        ) : (
          <MockProgramRail programs={state.shownPrograms} readOnly={false} footer={<div className="p-3 text-xs opacity-60">+ New Program</div>} />
        )}

        <main className="min-w-0 flex-1 overflow-x-auto p-4">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-blue-600">&larr; Back to Portfolio</span>
            <span className="font-semibold text-gray-800">All Programs</span>
            {!state.readOnly && <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-500">Select mode: Off</span>}
            <span className="ml-auto text-xs font-medium opacity-70">
              {state.readOnly ? `Version ${index + 1} of ${positions.length} — read-only` : "Saved"}
            </span>
          </div>

          {/* THE RIBBON — the whole proposal, in one row above the axis. */}
          <div className={"mb-2 flex items-center gap-1 overflow-x-auto rounded-md border px-2 py-1.5 " + (state.readOnly ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-gray-50")}>
            <span className="shrink-0 pr-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Versions</span>
            {chronological.map((v, i) => (
              <div key={v.id} className="flex shrink-0 items-center">
                {i > 0 && <span className="px-1 text-gray-300">—</span>}
                <button
                  onClick={() => state.setViewingId(v.id)}
                  onDoubleClick={() => setRenaming(v.id)}
                  title={`${versionTitle(v)} · saved ${formatSavedAt(v.savedAt)} by ${v.savedBy}`}
                  className={
                    "max-w-[160px] truncate rounded-full border px-2.5 py-1 text-xs " +
                    (state.viewingId === v.id ? "border-amber-500 bg-amber-200 font-semibold text-amber-900" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400")
                  }
                >
                  {v.label ? `★ ${v.label}` : formatSavedAt(v.savedAt)}
                </button>
              </div>
            ))}
            <span className="px-1 text-gray-300">—</span>
            <button
              onClick={() => state.setViewingId(null)}
              className={
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs " +
                (state.viewingId === null ? "border-emerald-500 bg-emerald-100 font-semibold text-emerald-900" : "border-gray-300 bg-white text-gray-600")
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </button>
            <button
              onClick={() => setRenaming(state.saveVersion(null))}
              className="ml-auto shrink-0 rounded-full border border-blue-500 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
            >
              ⊕ Save a version
            </button>
          </div>

          {/* The caption under the ribbon carries everything a chip has no room for. */}
          <div className="mb-3 min-h-[20px] text-[11px] text-gray-500">
            {renaming ? (
              <input
                autoFocus
                placeholder="Name this version…"
                defaultValue={state.versions.find((v) => v.id === renaming)?.label ?? ""}
                onBlur={(e) => {
                  state.renameVersion(renaming, e.target.value.trim());
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="rounded border border-blue-400 px-1.5 py-0.5 text-xs"
              />
            ) : selected ? (
              <>
                Saved {formatSavedAt(selected.savedAt)} by {selected.savedBy} · {describeChange(selected, state.versions[state.versions.indexOf(selected) + 1])} · nothing here can be edited ·{" "}
                <button onClick={() => setRenaming(selected.id)} className="underline">
                  rename
                </button>{" "}
                · ← → steps
              </>
            ) : (
              <>Editing the live Roadmap. Double-click a chip to name it; ← → steps back through versions.</>
            )}
          </div>

          <VersionCanvas programs={state.shownPrograms} readOnly={state.readOnly} />
        </main>
      </div>

      <ProtoStatePanel state={state} />
    </div>
  );
}
