"use client";

// Generic "here's what will change" diff review — the deterministic,
// entity-agnostic counterpart to CorrectionBox.tsx's
// AI-proposal preview card. Two features need this: the CSV/XLSX import
// wizard's merge preview (structured-import/) and the bulk multi-select
// toolbar's shift/restatus/re-lane preview (workspace/SelectionToolbar.tsx)
// — same shape either way ("N adds, M updates, review and accept/reject,
// then commit as one undoable edit"), so it's built once here rather than
// twice.
export interface DiffFieldChange {
  field: string;
  before: string;
  after: string;
}

export interface DiffEntry {
  /** Stable key — the row's resolved id (new milestones) or existing entity id (updates). */
  id: string;
  kind: "add" | "update" | "remove";
  title: string;
  /** Short context line, e.g. "in Manufacturing & Supply Chain, 2026-03-01". */
  detail?: string;
  /** Only for "update" entries — one row per changed field. */
  fieldChanges?: DiffFieldChange[];
}

const KIND_LABEL: Record<DiffEntry["kind"], { glyph: string; className: string }> = {
  add: { glyph: "+", className: "text-emerald-600 dark:text-emerald-400" },
  update: { glyph: "~", className: "text-amber-600 dark:text-amber-400" },
  remove: { glyph: "−", className: "text-red-600 dark:text-red-400" },
};

export function DiffBanner({
  title,
  entries,
  accepted,
  onToggle,
  onApply,
  onDiscard,
  applyLabel = "Apply",
}: {
  title: string;
  entries: DiffEntry[];
  /** Which entry ids are currently accepted — every entry defaults accepted (per-row opt-out, not opt-in). */
  accepted: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onApply: () => void;
  onDiscard: () => void;
  applyLabel?: string;
}) {
  const acceptedCount = entries.filter((e) => accepted.has(e.id)).length;

  return (
    <div style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }} className="rounded-xl border p-4 text-sm shadow-2xl">
      <p className="mb-2 text-xs font-semibold tracking-wide uppercase text-zinc-500">{title}</p>
      {entries.length === 0 ? (
        <p className="mb-3 text-xs text-zinc-400">Nothing to change.</p>
      ) : (
        <ul className="mb-3 max-h-64 space-y-1.5 overflow-y-auto">
          {entries.map((e) => {
            const k = KIND_LABEL[e.kind];
            const isAccepted = accepted.has(e.id);
            return (
              <li key={e.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={isAccepted}
                  onChange={() => onToggle(e.id)}
                  aria-label={`Include ${e.title}`}
                  className="mt-0.5 shrink-0"
                />
                <div className={"min-w-0 flex-1" + (isAccepted ? "" : " opacity-40")}>
                  <span className={"font-semibold " + k.className}>{k.glyph}</span> <span className="font-medium">{e.title}</span>
                  {e.detail && <span className="text-zinc-400"> — {e.detail}</span>}
                  {e.fieldChanges && e.fieldChanges.length > 0 && (
                    <ul className="mt-0.5 ml-4 list-disc text-zinc-400">
                      {e.fieldChanges.map((f) => (
                        <li key={f.field}>
                          {f.field}: {f.before || "(empty)"} →{" "}
                          <span className="font-medium text-zinc-600 dark:text-zinc-300">{f.after || "(empty)"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={onApply}
          disabled={acceptedCount === 0}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {applyLabel} {acceptedCount > 0 && `(${acceptedCount})`}
        </button>
        <button onClick={onDiscard} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">
          Discard
        </button>
      </div>
    </div>
  );
}
