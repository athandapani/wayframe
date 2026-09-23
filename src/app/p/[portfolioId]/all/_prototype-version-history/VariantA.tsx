"use client";

// PROTOTYPE — throwaway. wayframe#127, Variant A: "Versions" is a MODAL you
// open, and viewing one is a SEPARATE READ-ONLY PAGE you navigate to.
//
// The bet: Version History is not a thing you sit inside while working. It's
// a filing cabinet you open occasionally, take one folder out of, read, and
// close. So it spends no permanent pixels on the editing surface at all —
// one row in the existing Options menu, exactly where Export Snapshot
// already lives, and the list itself is the same modal shape SnapshotsPanel
// and SharePanel already established (fixed backdrop, --wf-* card, ✕ close).
//
// Viewing is a route change (`?version=v3` in the real build): the editing
// chrome is REPLACED, not disabled — no Options menu, no Select mode, no
// "+ New Program", no per-lane controls, and a banner across the top where
// the toolbar was. Nothing on screen can be clicked hoping it will edit,
// because nothing that edits is rendered.
//
// Cost of the bet: you can't compare versions without three round trips
// (open modal → view → back → open modal → view), and the list is invisible
// while you're reading a version.
import { useState } from "react";
import type { ProtoState } from "./shared";
import { MockProgramRail, ProtoStatePanel, VersionCanvas, describeChange, formatSavedAt, versionTitle } from "./shared";

export function VariantA({ state }: { state: ProtoState }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex min-h-0 flex-1">
        <MockProgramRail
          programs={state.shownPrograms}
          readOnly={state.readOnly}
          footer={state.readOnly ? undefined : <div className="p-3 text-xs opacity-60">+ New Program</div>}
        />

        <main className="min-w-0 flex-1 overflow-x-auto p-4">
          {state.readOnly ? (
            // The whole toolbar, replaced. Not greyed out — gone.
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <button onClick={() => state.setViewingId(null)} className="rounded border border-amber-500 bg-white px-2 py-1 text-xs font-medium">
                &larr; Back to live Roadmap
              </button>
              <span>
                <strong>Viewing a saved version</strong> — {versionTitle(state.viewing!)} · saved {formatSavedAt(state.viewing!.savedAt)} by {state.viewing!.savedBy}
              </span>
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Read-only</span>
              <button onClick={() => setModalOpen(true)} className="ml-auto text-xs underline">
                Pick another version
              </button>
            </div>
          ) : (
            <div className="relative mb-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-blue-600">&larr; Back to Portfolio</span>
              <span className="font-semibold text-gray-800">All Programs</span>
              <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-500">Select mode: Off</span>
              <span className="ml-auto text-xs font-medium opacity-70">Saved</span>
              <button onClick={() => setOptionsOpen((v) => !v)} aria-expanded={optionsOpen} className="rounded border border-gray-300 px-2 py-1 text-xs">
                ☰ Options
              </button>
              {optionsOpen && (
                <div className="absolute right-0 top-8 z-30 w-56 rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
                  <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">File</p>
                  <button
                    onClick={() => {
                      setOptionsOpen(false);
                      setModalOpen(true);
                    }}
                    className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
                  >
                    Versions…
                  </button>
                  <p className="block w-full px-3 py-1.5 text-left text-gray-400">Export Snapshot…</p>
                  <p className="block w-full px-3 py-1.5 text-left text-gray-400">Share…</p>
                </div>
              )}
            </div>
          )}

          <VersionCanvas programs={state.shownPrograms} readOnly={state.readOnly} />
        </main>
      </div>

      {modalOpen && <VersionsModal state={state} onClose={() => setModalOpen(false)} />}
      <ProtoStatePanel state={state} />
    </div>
  );
}

/** Same modal shape SnapshotsPanel.tsx already established — except this one is NOT read-only: saving a Version is the one mutation it carries, at the top, because there is nowhere else in this variant to put it. */
function VersionsModal({ state, onClose }: { state: ProtoState; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [justSaved, setJustSaved] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label="Versions">
      <div className="flex max-h-[80vh] w-[560px] flex-col rounded-lg border border-[var(--wf-border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Versions</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400">
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            state.saveVersion(label.trim() || null);
            setLabel("");
            setJustSaved(new Date().toISOString());
          }}
          className="flex items-end gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3"
        >
          <label className="flex-1">
            <span className="mb-1 block text-[11px] font-medium text-gray-500">Name this version (optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Pre-QBR baseline" className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <button type="submit" className="rounded border border-blue-500 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            Save a version
          </button>
        </form>
        {justSaved && <p className="border-b border-gray-200 bg-emerald-50 px-4 py-1.5 text-[11px] text-emerald-800">Captured every Program as of {formatSavedAt(justSaved)}.</p>}

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {state.versions.map((v, i) => (
            <li key={v.id} className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{versionTitle(v)}</p>
                <p className="text-[11px] text-gray-500">
                  {formatSavedAt(v.savedAt)} · {v.savedBy} · {describeChange(v, state.versions[i + 1])}
                </p>
              </div>
              <button
                onClick={() => {
                  state.setViewingId(v.id);
                  onClose();
                }}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                View
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-gray-200 px-4 py-2 text-[11px] text-gray-500">Versions are permanent and can&rsquo;t be edited or deleted. Restoring one onto the live Roadmap isn&rsquo;t available yet.</p>
      </div>
    </div>
  );
}
