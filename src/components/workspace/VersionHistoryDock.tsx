"use client";

// Version History (wayframe#128) — #127's Variant B, built for real.
//
// The shape the prototype won on: a right-docked list in the SAME slot as the
// milestone inspector (EDITOR_DOCK_WIDTH), closed by default and mutually
// exclusive with it, because the useful act is never "read one old Version" —
// it's "find the one I mean", which is always a comparison. So the list stays
// on screen while a Version is displayed, the canvas swaps IN PLACE beneath
// it, and ↑/↓ steps through the rows so switching costs a keystroke rather
// than a round trip through a modal.
//
// Four consequences of that resolution that are easy to undo by accident:
//
//  - `Live document` is a pinned first row, not a Back button: live is just
//    the newest position in the same list, so entering and leaving read-only
//    are the same click.
//  - Saving takes one click and no dialog, ALWAYS captures the live document
//    (even while you're reading an old Version), and returns you to live —
//    then drops the new row straight into its rename field. The moment you
//    want to save is never the moment you want to name it.
//  - Renaming reaches the LABEL only. A Version's content is append-only
//    (#t11's ruling, inherited by versions.ts), and there is no delete.
//  - Read-only is expressed by the hosting surface WITHHOLDING its mutation
//    callbacks, not by a scrim over the canvas — this dock only reports which
//    Version is being read; it has no opinion about how the canvas dims.
//
// Per-row change summaries are counts only, and deliberately so: a real
// "12 dates moved" line needs a field-level diff of two full Program sets,
// which the list endpoint would have to load every Version's documents to
// compute. #127 said ship counts if the diff isn't cheap at list time, so the
// row reads the denormalized `program_count`/`milestone_count` columns and
// never claims more than they can support — equal counts print as
// "no change in counts", never as "no change".
import { useCallback, useEffect, useRef, useState } from "react";
import { EDITOR_DOCK_CLASS, EDITOR_DOCK_STYLE } from "@/components/milestone-editor/editor-dock";
import type { PortfolioVersion, PortfolioVersionSummary } from "@/lib/db/versions";

type ListState =
  | { status: "loading" }
  | { status: "ready"; versions: PortfolioVersionSummary[] }
  | { status: "error"; error: string };

type ListOutcome = { ok: true; versions: PortfolioVersionSummary[] } | { ok: false; error: string };

/**
 * Pure fetch — deliberately does NOT set state itself, so the mount effect and
 * the post-save refresh can share it without either calling a state-setting
 * function *through* an effect (the shape react-hooks/set-state-in-effect
 * flags even when the setState is behind an `await`). Same split
 * `src/app/p/[portfolioId]/all/page.tsx` already uses for its own fetch.
 */
async function fetchVersions(portfolioId: string): Promise<ListOutcome> {
  try {
    const res = await fetch(`/api/portfolios/${portfolioId}/versions`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? "Couldn't load Version history." };
    }
    const body = (await res.json()) as { versions: PortfolioVersionSummary[] };
    return { ok: true, versions: body.versions ?? [] };
  } catch {
    return { ok: false, error: "Couldn't load Version history." };
  }
}

/** "Sep 18, 2:14 PM" — the absolute (never relative) convention SnapshotsPanel/SharePanel already use for stored records. */
export function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** A Version's display name: its label if it was named, else when it was saved. */
export function versionTitle(version: PortfolioVersionSummary): string {
  return version.label ?? formatSavedAt(version.createdAt);
}

/** Who saved it, preferring the display name captured at save time and falling back to the identity the server vouches for. */
export function versionAuthor(version: PortfolioVersionSummary): string {
  return version.creatorName ?? version.creatorIdentity;
}

/**
 * The one-line "what changed" a row carries, computed against the Version
 * saved immediately before it from the denormalized counts alone. Says
 * "no change in counts" rather than "no change" when the counts match, because
 * counts cannot see a moved date, a rename, or a re-lane — see this file's
 * header.
 */
export function describeCounts(current: PortfolioVersionSummary, previous: PortfolioVersionSummary | undefined): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (!previous) return `${plural(current.programCount, "Program")} · ${plural(current.milestoneCount, "milestone")}`;
  const signed = (n: number, word: string) => `${n > 0 ? "+" : "−"}${plural(Math.abs(n), word)}`;
  const bits: string[] = [];
  if (current.programCount !== previous.programCount) bits.push(signed(current.programCount - previous.programCount, "Program"));
  if (current.milestoneCount !== previous.milestoneCount) bits.push(signed(current.milestoneCount - previous.milestoneCount, "milestone"));
  if (bits.length === 0) return `${plural(current.milestoneCount, "milestone")} · no change in counts`;
  return bits.join(" · ");
}

export function VersionHistoryDock({
  portfolioId,
  canEdit,
  viewingVersionId,
  onViewVersion,
  onClose,
}: {
  portfolioId: string;
  /** Owner/editor: gates "Save a version" and the inline rename. A viewer can still read every Version. */
  canEdit: boolean;
  /** Which row is selected — null is the pinned "Live document" row. Held by the hosting surface, since that's what actually renders read-only. */
  viewingVersionId: string | null;
  /** Reports the Version to render (with its full Program documents), or null to go back to the live document. */
  onViewVersion: (version: PortfolioVersion | null) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Fetched Versions, kept so ↑/↓ stepping back over a row you've already seen
  // redraws immediately instead of re-fetching a document that cannot have
  // changed (a Version's content is immutable).
  const fetched = useRef<Map<string, PortfolioVersion>>(new Map());

  const reload = useCallback(async () => {
    const outcome = await fetchVersions(portfolioId);
    setState(outcome.ok ? { status: "ready", versions: outcome.versions } : { status: "error", error: outcome.error });
  }, [portfolioId]);

  useEffect(() => {
    let cancelled = false;
    fetchVersions(portfolioId).then((outcome) => {
      if (cancelled) return;
      setState(outcome.ok ? { status: "ready", versions: outcome.versions } : { status: "error", error: outcome.error });
    });
    return () => {
      cancelled = true;
    };
  }, [portfolioId]);

  const select = useCallback(
    async (versionId: string | null) => {
      setActionError(null);
      if (versionId === null) {
        onViewVersion(null);
        return;
      }
      const cached = fetched.current.get(versionId);
      if (cached) {
        onViewVersion(cached);
        return;
      }
      setLoadingId(versionId);
      try {
        const res = await fetch(`/api/portfolios/${portfolioId}/versions/${versionId}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setActionError(body.error ?? "Couldn't open that Version.");
          return;
        }
        const body = (await res.json()) as { version: PortfolioVersion };
        fetched.current.set(versionId, body.version);
        onViewVersion(body.version);
      } catch {
        setActionError("Couldn't open that Version.");
      } finally {
        setLoadingId(null);
      }
    },
    [portfolioId, onViewVersion],
  );

  // ↑/↓ steps the selection — the whole point of keeping the list on screen is
  // that comparing Versions is a keystroke. Row 0 is `Live document`; the rest
  // follow it newest-first, the order the list endpoint returns.
  useEffect(() => {
    const rowIds: (string | null)[] = [null, ...(state.status === "ready" ? state.versions.map((v) => v.id) : [])];
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const next = rowIds.indexOf(viewingVersionId) + (e.key === "ArrowDown" ? 1 : -1);
      select(rowIds[Math.min(rowIds.length - 1, Math.max(0, next))]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, viewingVersionId, select]);

  async function handleSave() {
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({}))) as { versionId?: string; error?: string };
      if (!res.ok || !body.versionId) {
        setActionError(body.error ?? "Couldn't save a Version.");
        return;
      }
      // A save always captures the LIVE document, never the Version you happen
      // to be reading — so it also drops you back onto live rather than
      // leaving you in read-only next to a new row you didn't just look at.
      onViewVersion(null);
      await reload();
      setRenamingId(body.versionId);
    } catch {
      setActionError("Couldn't save a Version.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRename(versionId: string, label: string) {
    const trimmed = label.trim();
    setRenamingId(null);
    setActionError(null);
    // Optimistic: the row is already on screen with a name typed into it, and
    // a label is not content — a failed write reports itself below and the
    // next list load corrects the row.
    setState((prev) => (prev.status === "ready" ? { ...prev, versions: prev.versions.map((v) => (v.id === versionId ? { ...v, label: trimmed === "" ? null : trimmed } : v)) } : prev));
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/versions/${versionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? "Couldn't rename that Version.");
        await reload();
      }
    } catch {
      setActionError("Couldn't rename that Version.");
      await reload();
    }
  }

  return (
    <aside aria-label="Version history" className={EDITOR_DOCK_CLASS} style={EDITOR_DOCK_STYLE}>
      <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-700">
        <h2 className="text-base font-semibold">Version history</h2>
        <button onClick={onClose} aria-label="Close version history" className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
          ✕
        </button>
      </div>

      {canEdit && (
        <div className="border-b border-zinc-200 p-3 dark:border-zinc-700">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded border border-blue-500 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 disabled:opacity-50 dark:bg-blue-950/40 dark:text-blue-300"
          >
            {saving ? "Saving…" : "Save a version"}
          </button>
          <p className="mt-1 text-[11px] text-zinc-500">Captures every Program as it is right now.</p>
        </div>
      )}

      {actionError && <p className="border-b border-zinc-200 px-3 py-2 text-[11px] text-red-600 dark:border-zinc-700">{actionError}</p>}

      {state.status === "loading" && <p className="p-3 text-xs text-zinc-500">Loading…</p>}
      {state.status === "error" && <p className="p-3 text-xs text-red-600">{state.error}</p>}

      {state.status === "ready" && (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          <li>
            <button
              onClick={() => select(null)}
              aria-current={viewingVersionId === null}
              className={"flex w-full items-center gap-2 border-b border-zinc-100 px-3 py-2 text-left dark:border-zinc-800" + (viewingVersionId === null ? " bg-blue-50 dark:bg-blue-950/40" : "")}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Live document</span>
                <span className="block text-[11px] text-zinc-500">Editable · everyone&rsquo;s changes as they happen</span>
              </span>
            </button>
          </li>
          {state.versions.map((version, i) => (
            <li key={version.id}>
              <button
                onClick={() => select(version.id)}
                aria-current={viewingVersionId === version.id}
                className={
                  "flex w-full items-start gap-2 border-b border-zinc-100 px-3 py-2 text-left dark:border-zinc-800" +
                  (viewingVersionId === version.id ? " bg-amber-50 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/30" : "")
                }
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <span className="min-w-0 flex-1">
                  {renamingId === version.id ? (
                    <input
                      autoFocus
                      defaultValue={version.label ?? ""}
                      placeholder="Name this version…"
                      aria-label="Name this version"
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => handleRename(version.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full rounded border border-blue-400 px-1 py-0.5 text-sm"
                    />
                  ) : (
                    <span className="block truncate text-sm font-medium">{versionTitle(version)}</span>
                  )}
                  <span className="block text-[11px] text-zinc-500">
                    {formatSavedAt(version.createdAt)} · {versionAuthor(version)}
                  </span>
                  <span className="block text-[11px] text-zinc-400">
                    {loadingId === version.id ? "Opening…" : describeCounts(version, state.versions[i + 1])}
                  </span>
                </span>
                {canEdit && viewingVersionId === version.id && renamingId !== version.id && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(version.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        setRenamingId(version.id);
                      }
                    }}
                    className="shrink-0 text-[11px] text-blue-600 underline"
                  >
                    Rename
                  </span>
                )}
              </button>
            </li>
          ))}
          {state.versions.length === 0 && <li className="px-3 py-2 text-[11px] text-zinc-500">No Versions saved yet.</li>}
        </ul>
      )}

      <p className="border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-700">
        ↑ ↓ steps through Versions. Versions are permanent; restoring one onto the live document isn&rsquo;t available yet.
      </p>
    </aside>
  );
}
