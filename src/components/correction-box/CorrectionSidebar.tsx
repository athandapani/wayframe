"use client";

// Variant B (persistent correction sidebar) — kept as a user-selectable
// alternate mode per issue #9's resolution. Adds a running log of past
// corrections; the log is pure UI bookkeeping local to this component, not
// part of the core patch/undo state in use-correction-box.ts.
//
// Ambiguous ties (wayframe#38 item 1 / #39) get the same conversational
// treatment CorrectionBox.tsx uses, scaled to the sidebar's width — the
// clarify-prototype's verdict applies regardless of which variant is active.
import { useState } from "react";
import {
  buildAddPreview,
  buildAddTopLevelItemPreview,
  buildAmbiguousPreview,
  buildAttachmentOpPreview,
  buildBlufOpPreview,
  buildDeletePreview,
  buildDependencyOpPreview,
  buildDocumentOpPreview,
  buildOpPreview,
  buildSkippedPreview,
  buildSwimlaneOpPreview,
  buildTopLevelItemOpPreview,
} from "@/lib/corrections/preview";
import type { AppliedIds, UseCorrectionBoxResult } from "./use-correction-box";

interface LogEntry {
  text: string;
  status: "applied" | "discarded";
  opCount: number;
}

export function CorrectionSidebar({ box, onNeedsEditor }: { box: UseCorrectionBoxResult; onNeedsEditor?: (ids: AppliedIds) => void }) {
  const [text, setText] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const opRows = box.pending ? buildOpPreview(box.data.milestones, box.pending.ops) : [];
  const skippedRows = box.pending ? buildSkippedPreview(box.data.milestones, box.pending.skipped) : [];
  const addRows = box.pending ? buildAddPreview(box.data.swimlanes, box.pending.adds) : [];
  const deleteRows = box.pending ? buildDeletePreview(box.data.milestones, box.data.topLevelItems, box.data.swimlanes, box.pending.deletes) : [];
  const swimlaneOpRows = box.pending ? buildSwimlaneOpPreview(box.data.swimlanes, box.pending.swimlaneOps) : [];
  const topLevelOpRows = box.pending ? buildTopLevelItemOpPreview(box.data.topLevelItems, box.pending.topLevelItemOps) : [];
  const addTopLevelRows = box.pending ? buildAddTopLevelItemPreview(box.pending.addTopLevelItems) : [];
  const dependencyRows = box.pending ? buildDependencyOpPreview(box.data.milestones, box.pending.dependencyOps) : [];
  const attachmentRows = box.pending ? buildAttachmentOpPreview(box.data.milestones, box.pending.attachmentOps) : [];
  const blufRows = box.pending ? buildBlufOpPreview(box.pending.blufOp) : [];
  const documentRows = box.pending ? buildDocumentOpPreview(box.pending.documentOp) : [];
  const ambiguous = box.pending?.ambiguous ? buildAmbiguousPreview(box.data.milestones, box.data.swimlanes, box.pending.ambiguous) : null;
  const hasCleanResolution =
    opRows.length > 0 ||
    addRows.length > 0 ||
    skippedRows.length > 0 ||
    deleteRows.length > 0 ||
    swimlaneOpRows.length > 0 ||
    topLevelOpRows.length > 0 ||
    addTopLevelRows.length > 0 ||
    dependencyRows.length > 0 ||
    attachmentRows.length > 0 ||
    blufRows.length > 0 ||
    documentRows.length > 0;

  function handleApply() {
    const ids = box.apply();
    setLog((l) => [...l, { text: box.pending!.inputText, status: "applied", opCount: box.pending!.ops.length + box.pending!.adds.length }]);
    onNeedsEditor?.(ids);
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold">Corrections</h2>
        <button
          onClick={box.undo}
          disabled={box.historyLength === 0}
          className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
        >
          Undo last ({box.historyLength})
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {log.length === 0 && !box.pending && (
          <p className="text-xs text-zinc-400">Type a correction below — e.g. &quot;push certification milestones by two weeks&quot;.</p>
        )}

        {log.map((entry, i) => (
          <div key={i} className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">&quot;{entry.text}&quot;</p>
            <p className={entry.status === "applied" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}>
              {entry.status} — {entry.opCount} change{entry.opCount === 1 ? "" : "s"}
            </p>
          </div>
        ))}

        {ambiguous && (
          <div className="rounded-md border border-zinc-300 p-2 text-xs dark:border-zinc-600">
            <p className="mb-1.5 flex items-center gap-1.5 font-medium">
              <span aria-hidden="true" style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }} className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold">AI</span>
              I found {ambiguous.candidates.length} milestones that could match &quot;{box.pending!.inputText}&quot;. Which one?
            </p>
            <div className="mb-1.5 flex flex-col gap-1">
              {ambiguous.candidates.map((c) => (
                <button
                  key={c.targetId}
                  onClick={() => box.resolveAmbiguous(c.targetId)}
                  className="rounded border border-zinc-300 px-1.5 py-1 text-left dark:border-zinc-600"
                >
                  <span className="font-medium">{c.targetTitle}</span>
                  <span className="text-zinc-400"> — {c.laneName}, set to {c.newValue}</span>
                </button>
              ))}
            </div>
            <button onClick={box.discard} className="text-[11px] text-zinc-400 hover:text-zinc-600">
              None of these — let me rephrase
            </button>
          </div>
        )}

        {!ambiguous && box.pending && hasCleanResolution && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-700 dark:bg-amber-950">
            <p className="mb-1 font-medium">&quot;{box.pending.inputText}&quot;</p>
            <ul className="mb-2 space-y-0.5">
              {opRows.map((op) => (
                <li key={`${op.targetId}-${op.field}`}>
                  {op.targetTitle}: {op.field} {op.previousValue} → <span className="font-semibold">{op.newValue}</span>
                </li>
              ))}
              {addRows.map((a, i) => (
                <li key={`add-${i}`}>
                  <span className="font-semibold">+ {a.title}</span> in {a.laneName}
                  {a.date ? ` on ${a.date}` : " (date TBD)"}
                </li>
              ))}
              {deleteRows.map((d, i) => (
                <li key={`delete-${i}`}>
                  <span className="font-semibold">− Delete {d.targetTitle}</span> ({d.entityType})
                </li>
              ))}
              {swimlaneOpRows.map((s, i) => (
                <li key={`swimlane-${i}`}>
                  Swimlane {s.targetTitle}: {s.detail}
                </li>
              ))}
              {topLevelOpRows.map((t, i) => (
                <li key={`toplevel-op-${i}`}>
                  {t.targetTitle}: {t.field} → <span className="font-semibold">{t.newValue}</span>
                </li>
              ))}
              {addTopLevelRows.map((a, i) => (
                <li key={`add-toplevel-${i}`}>
                  <span className="font-semibold">+ New {a.kind}</span> {a.title}
                  {a.date ? ` on ${a.date}` : " (date TBD)"}
                </li>
              ))}
              {dependencyRows.map((d, i) => (
                <li key={`dependency-${i}`}>
                  {d.add ? "+ Link" : "− Unlink"} {d.dependentTitle} {d.add ? "to depend on" : "from"} {d.dependencyTitle}
                </li>
              ))}
              {attachmentRows.map((a, i) => (
                <li key={`attachment-${i}`}>
                  <span className="font-semibold">{a.action === "add" ? "+" : "−"} Attachment</span> on {a.targetTitle}: {a.detail}
                </li>
              ))}
              {blufRows.map((b, i) => (
                <li key={`bluf-${i}`}>
                  BLUF {b.field} → <span className="font-semibold">{b.newValue}</span>
                </li>
              ))}
              {documentRows.map((d, i) => (
                <li key={`document-${i}`}>
                  {d.field} → <span className="font-semibold">{d.newValue}</span>
                </li>
              ))}
              {skippedRows.map((s) => (
                <li key={s.targetId} className="text-zinc-400">
                  skipped: {s.targetTitle}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={handleApply} className="rounded bg-emerald-600 px-2 py-1 text-white">
                Apply
              </button>
              <button
                onClick={() => {
                  setLog((l) => [...l, { text: box.pending!.inputText, status: "discarded", opCount: box.pending!.ops.length }]);
                  box.discard();
                }}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {!ambiguous && box.pending && !hasCleanResolution && (
          <p className="rounded-md border border-zinc-200 p-2 text-xs text-zinc-500 dark:border-zinc-700">
            I couldn&apos;t make sense of that as a request — try naming a milestone (or lane, for a new one) and what should change.
          </p>
        )}

        {box.error && <p className="text-xs text-red-600 dark:text-red-400">{box.error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          box.submit(text);
          setText("");
        }}
        className="border-t border-zinc-200 p-3 dark:border-zinc-700"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={box.loading}
          placeholder="Describe a correction..."
          className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-zinc-400 disabled:opacity-50 dark:border-zinc-600"
        />
      </form>
    </aside>
  );
}
