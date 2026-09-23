"use client";

// PROTOTYPE — throwaway. wayframe#127, Variant B: a right-docked HISTORY
// DOCK, and viewing a version swaps the canvas IN PLACE beneath it.
//
// The bet: the useful act isn't "read one old version," it's "find the one
// I mean," and that is always a comparison — you step down the list watching
// the canvas redraw until the picture matches what you remember. So the list
// must stay on screen while a version is displayed, and switching versions
// must cost one keystroke, not a round trip through a modal.
//
// It docks right, at EDITOR_DOCK_WIDTH, because that slot already belongs to
// "the thing you're currently inspecting" on this surface (#125 Variant B's
// inspector) — so the shape is already familiar, and the rail on the left
// keeps telling you which Programs you're looking at. `Live document` is a
// pinned first row rather than a separate Back button: live is just the
// newest position in the same list, and leaving read-only is the same click
// as entering it.
//
// Naming is POST-HOC: "Save a version" takes one click and no dialog, and
// the new row lands at the top already in a rename field you can ignore. The
// moment you want to save is never the moment you want to name it.
//
// Cost of the bet: the dock permanently costs the canvas ~320px whenever
// it's open, on the surface that is already the most horizontally starved
// in the app.
import { useEffect, useState } from "react";
import type { ProtoState } from "./shared";
import { MockProgramRail, ProtoStatePanel, VersionCanvas, describeChange, formatSavedAt, versionTitle } from "./shared";

const DOCK_WIDTH = 320;

export function VariantB({ state }: { state: ProtoState }) {
  const [open, setOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // ↑/↓ steps the selection while the dock is open — the whole point of
  // keeping the list on screen is that comparing is a keystroke.
  const { versions, viewingId, setViewingId } = state;
  useEffect(() => {
    if (!open) return;
    // `Live` is row 0; the rest of the list follows it, newest first.
    const rowIds = [null as string | null, ...versions.map((v) => v.id)];
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = rowIds.indexOf(viewingId) + (e.key === "ArrowDown" ? 1 : -1);
      setViewingId(rowIds[Math.min(rowIds.length - 1, Math.max(0, i))]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, versions, viewingId, setViewingId]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex min-h-0 flex-1">
        <MockProgramRail programs={state.shownPrograms} readOnly={state.readOnly} footer={state.readOnly ? undefined : <div className="p-3 text-xs opacity-60">+ New Program</div>} />

        <main className={"min-w-0 flex-1 overflow-x-auto p-4" + (state.readOnly ? " bg-amber-50/40" : "")}>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-blue-600">&larr; Back to Portfolio</span>
            <span className="font-semibold text-gray-800">All Programs</span>
            {state.readOnly ? (
              <span className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                Read-only — version of {formatSavedAt(state.viewing!.savedAt)}
              </span>
            ) : (
              <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-500">Select mode: Off</span>
            )}
            <span className="ml-auto text-xs font-medium opacity-70">{state.readOnly ? "Live document still syncing in the background" : "Saved"}</span>
            {/* Next to the persistence indicator on purpose: "is my work safe" and "what did it look like last month" are the same question asked at two timescales. */}
            <button onClick={() => setOpen((v) => !v)} aria-pressed={open} className={"rounded border px-2 py-1 text-xs " + (open ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300")}>
              History
            </button>
          </div>

          <VersionCanvas programs={state.shownPrograms} readOnly={state.readOnly} />
        </main>

        {open && (
          <aside className="flex shrink-0 flex-col border-l border-gray-200 bg-white" style={{ width: DOCK_WIDTH }}>
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
              <h2 className="text-sm font-semibold">Version history</h2>
              <button onClick={() => setOpen(false)} aria-label="Close history" className="text-gray-400">
                ✕
              </button>
            </div>
            <div className="border-b border-gray-200 p-2">
              <button
                onClick={() => {
                  const id = state.saveVersion(null);
                  setRenamingId(id);
                }}
                className="w-full rounded border border-blue-500 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700"
              >
                Save a version
              </button>
              <p className="mt-1 text-[11px] text-gray-500">Captures every Program as it is right now.</p>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto">
              <li>
                <button
                  onClick={() => state.setViewingId(null)}
                  className={"flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left" + (state.viewingId === null ? " bg-blue-50" : "")}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Live document</span>
                    <span className="block text-[11px] text-gray-500">Editable · everyone&rsquo;s changes as they happen</span>
                  </span>
                </button>
              </li>
              {state.versions.map((v, i) => (
                <li key={v.id}>
                  <button
                    onClick={() => state.setViewingId(v.id)}
                    className={"flex w-full items-start gap-2 border-b border-gray-100 px-3 py-2 text-left" + (state.viewingId === v.id ? " bg-amber-50 ring-1 ring-inset ring-amber-300" : "")}
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-300" />
                    <span className="min-w-0 flex-1">
                      {renamingId === v.id ? (
                        <input
                          autoFocus
                          defaultValue={v.label ?? ""}
                          placeholder="Name this version…"
                          onBlur={(e) => {
                            state.renameVersion(v.id, e.target.value.trim());
                            setRenamingId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          className="w-full rounded border border-blue-400 px-1 py-0.5 text-sm"
                        />
                      ) : (
                        <span className="block truncate text-sm font-medium">{versionTitle(v)}</span>
                      )}
                      <span className="block text-[11px] text-gray-500">
                        {formatSavedAt(v.savedAt)} · {v.savedBy}
                      </span>
                      <span className="block text-[11px] text-gray-400">{describeChange(v, state.versions[i + 1])}</span>
                    </span>
                    {state.viewingId === v.id && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(v.id);
                        }}
                        className="shrink-0 text-[11px] text-blue-600 underline"
                      >
                        Rename
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-gray-200 px-3 py-2 text-[11px] text-gray-500">↑ ↓ steps through versions. Versions are permanent; restoring one isn&rsquo;t available yet.</p>
          </aside>
        )}
      </div>

      <ProtoStatePanel state={state} />
    </div>
  );
}
