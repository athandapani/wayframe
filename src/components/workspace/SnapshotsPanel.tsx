"use client";

// Snapshot list/viewer (wayframe#t31) — same modal shape SharePanel.tsx
// already established (fixed backdrop, --wf-* themed card, role="dialog",
// scrollable body, ✕ close). Read-only: Snapshots are append-only/
// undeletable per #t11, so unlike SharePanel there's no mutation here at
// all, just a list plus a per-row "Download .pptx" action that recompiles
// the stored IR through the existing t28/t30 pptxgenjs path — no new
// IR-to-screen renderer needed. Wired in via RoadmapWorkspace's Options
// menu, NOT gated by canManageSharing — any member (viewer included) can
// view Snapshots, since a Snapshot is document content, not an owner-only
// setting.
import { useEffect, useState } from "react";
import { exportNativeDeckFromSlides } from "@/lib/export/export-native-deck";
import type { PortfolioSnapshotSummary, PortfolioSnapshot } from "@/lib/db/snapshots";
import { deckFileName } from "./RoadmapWorkspace";

type ListState =
  | { status: "loading" }
  | { status: "ready"; snapshots: PortfolioSnapshotSummary[] }
  | { status: "error"; error: string };

// Same absolute (not relative) formatting convention SharePanel.tsx already
// duplicates from RoadmapWorkspace.tsx's own module-private formatLastUpdated.
function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  const datePart = `${d.getMonth() + 1}/${d.getDate()}`;
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart} ${timePart}`;
}

const SECTION_LABELS: { key: keyof Pick<PortfolioSnapshotSummary["selection"], "executive" | "combinedBaseline" | "individualBaseline" | "scenarioCombined" | "scenarioProgram">; label: string }[] = [
  { key: "executive", label: "Executive" },
  { key: "combinedBaseline", label: "Combined Programs" },
  { key: "individualBaseline", label: "Individual Programs" },
  { key: "scenarioCombined", label: "Scenario: Combined" },
  { key: "scenarioProgram", label: "Scenario: Program view" },
];

/** Human-readable summary of which of the 5 export-dialog sections a Snapshot's `selection` had checked, comma-separated. */
export function summarizeSelection(selection: PortfolioSnapshotSummary["selection"]): string {
  const labels = SECTION_LABELS.filter(({ key }) => selection[key]).map(({ label }) => label);
  return labels.length > 0 ? labels.join(", ") : "No sections";
}

export function SnapshotsPanel({ portfolioId, onClose }: { portfolioId: string; onClose: () => void }) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portfolios/${portfolioId}/snapshots`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          // Local/unauthenticated mode has no real Portfolio row to read —
          // not an error state, just an empty list (same posture
          // ExportDialog.tsx's own allPrograms fetch already takes).
          setState({ status: "ready", snapshots: [] });
          return;
        }
        const body = (await res.json()) as { snapshots: PortfolioSnapshotSummary[] };
        setState({ status: "ready", snapshots: body.snapshots ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "ready", snapshots: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  async function handleDownload(id: string, createdAt: string) {
    setDownloading((d) => ({ ...d, [id]: true }));
    setDownloadErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/snapshots/${id}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setDownloadErrors((e) => ({ ...e, [id]: body.error ?? "Download failed." }));
        return;
      }
      const body = (await res.json()) as { snapshot: PortfolioSnapshot };
      await exportNativeDeckFromSlides(body.snapshot.slides, deckFileName(`Snapshot ${formatCreatedAt(createdAt)}`));
    } catch {
      setDownloadErrors((e) => ({ ...e, [id]: "Download failed." }));
    } finally {
      setDownloading((d) => ({ ...d, [id]: false }));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)", borderWidth: 1 }}
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Snapshots"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--wf-border)" }}>
          <div>
            <h1 className="text-base font-semibold">Snapshots</h1>
            <p className="text-xs opacity-60">Immutable, view-only records saved from the Export dialog.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100">
            ✕
          </button>
        </div>

        {state.status === "loading" && <p className="p-5 text-xs opacity-60">Loading…</p>}
        {state.status === "error" && <p className="p-5 text-xs text-red-500">{state.error}</p>}

        {state.status === "ready" && (
          <div className="p-5">
            {state.snapshots.length === 0 ? (
              <p className="text-xs opacity-60">No Snapshots saved yet.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--wf-border)" }}>
                {state.snapshots.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{formatCreatedAt(s.createdAt)}</span>
                        <span className="font-mono text-[11px] opacity-60">{s.creatorIdentity}</span>
                      </div>
                      <p className="mt-0.5 opacity-70">{summarizeSelection(s.selection)}</p>
                      {downloadErrors[s.id] && <p className="mt-0.5 text-red-500">{downloadErrors[s.id]}</p>}
                    </div>
                    <button
                      onClick={() => handleDownload(s.id, s.createdAt)}
                      disabled={downloading[s.id]}
                      style={{ borderColor: "var(--wf-border)" }}
                      className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] opacity-80 hover:opacity-100 disabled:opacity-40"
                    >
                      {downloading[s.id] ? "Downloading…" : "Download .pptx"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
