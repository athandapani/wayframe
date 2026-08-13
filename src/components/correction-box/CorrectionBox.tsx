"use client";

// Variant A (floating command bar) — the default, per issue #9's
// resolution: a single always-visible text input, proposal card floats
// above it. Preview-before-commit, always; never auto-applies.
//
// The ambiguous-tie state (wayframe#38 item 1 / #39) gets a distinct
// conversational-bubble treatment instead of the plain card — the
// clarify-prototype's verdict was that the bubble earns its keep
// specifically where the AI needs something *from* the human, not on every
// successful match. A clean resolution (ops/adds with no ambiguity) keeps
// today's efficient "Proposed correction" card.
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

function AiAvatar() {
  return (
    <span
      aria-hidden="true"
      style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
    >
      AI
    </span>
  );
}

export function CorrectionBox({ box, onNeedsEditor }: { box: UseCorrectionBoxResult; onNeedsEditor?: (ids: AppliedIds) => void }) {
  const [text, setText] = useState("");
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
    onNeedsEditor?.(box.apply());
  }

  return (
    <>
      {ambiguous && (
        <div className="fixed bottom-24 left-1/2 z-40 flex w-[560px] -translate-x-1/2 items-start gap-2">
          <AiAvatar />
          <div
            style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
            className="flex-1 rounded-2xl rounded-tl-sm border p-3 shadow-2xl"
          >
            <p className="mb-2 text-sm">
              I found <strong>{ambiguous.candidates.length} milestones</strong> that could match &ldquo;{box.pending!.inputText}&rdquo;. Which one did you mean?
            </p>
            <div className="flex flex-col gap-1">
              {ambiguous.candidates.map((c) => (
                <button
                  key={c.targetId}
                  onClick={() => box.resolveAmbiguous(c.targetId)}
                  style={{ borderColor: "var(--wf-border)" }}
                  className="rounded-lg border px-2.5 py-1.5 text-left text-xs hover:border-current"
                >
                  <span className="font-medium">{c.targetTitle}</span>
                  <span className="opacity-50"> — {c.laneName}, set {ambiguous.field} to {c.newValue}</span>
                </button>
              ))}
            </div>
            <button onClick={box.discard} className="mt-2 text-[11px] opacity-50 hover:opacity-80">
              None of these — let me rephrase
            </button>
          </div>
        </div>
      )}

      {!ambiguous && box.pending && hasCleanResolution && (
        <div style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
          className="fixed bottom-24 left-1/2 z-40 w-[560px] -translate-x-1/2 rounded-xl border p-4 shadow-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Proposed correction</p>
          <ul className="mb-3 space-y-1 text-sm">
            {opRows.map((op) => (
              <li key={`${op.targetId}-${op.field}`}>
                <span className="font-medium">{op.targetTitle}</span>: {op.field} {op.previousValue} →{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{op.newValue}</span>
                <span className="text-zinc-400"> ({op.reason})</span>
              </li>
            ))}
            {addRows.map((a, i) => (
              <li key={`add-${i}`}>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">+ New milestone</span>{" "}
                <span className="font-medium">{a.title}</span> in {a.laneName}
                {a.date ? ` on ${a.date}` : " — date not given, will open for editing"}
                <span className="text-zinc-400"> ({a.reason})</span>
              </li>
            ))}
            {deleteRows.map((d, i) => (
              <li key={`delete-${i}`}>
                <span className="font-semibold text-red-600 dark:text-red-400">− Delete</span>{" "}
                <span className="font-medium">{d.targetTitle}</span> ({d.entityType})
                <span className="text-zinc-400"> ({d.reason})</span>
              </li>
            ))}
            {swimlaneOpRows.map((s, i) => (
              <li key={`swimlane-${i}`}>
                Swimlane <span className="font-medium">{s.targetTitle}</span>: {s.detail}
                <span className="text-zinc-400"> ({s.reason})</span>
              </li>
            ))}
            {topLevelOpRows.map((t, i) => (
              <li key={`toplevel-op-${i}`}>
                <span className="font-medium">{t.targetTitle}</span>: {t.field} →{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t.newValue}</span>
                <span className="text-zinc-400"> ({t.reason})</span>
              </li>
            ))}
            {addTopLevelRows.map((a, i) => (
              <li key={`add-toplevel-${i}`}>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">+ New {a.kind}</span>{" "}
                <span className="font-medium">{a.title}</span> in the PROGRAM band
                {a.date ? ` on ${a.date}` : " — date not given, will open for editing"}
                <span className="text-zinc-400"> ({a.reason})</span>
              </li>
            ))}
            {dependencyRows.map((d, i) => (
              <li key={`dependency-${i}`}>
                {d.add ? "+ Link" : "− Unlink"} <span className="font-medium">{d.dependentTitle}</span> {d.add ? "to depend on" : "from"}{" "}
                <span className="font-medium">{d.dependencyTitle}</span>
                {d.add && d.showConnector !== undefined ? (d.showConnector ? " (visible connector)" : " (no connector line)") : ""}
                <span className="text-zinc-400"> ({d.reason})</span>
              </li>
            ))}
            {attachmentRows.map((a, i) => (
              <li key={`attachment-${i}`}>
                {a.action === "add" ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">+ Attachment</span>
                ) : (
                  <span className="font-semibold text-red-600 dark:text-red-400">− Attachment</span>
                )}{" "}
                on <span className="font-medium">{a.targetTitle}</span>: {a.detail}
                <span className="text-zinc-400"> ({a.reason})</span>
              </li>
            ))}
            {blufRows.map((b, i) => (
              <li key={`bluf-${i}`}>
                BLUF <span className="font-medium">{b.field}</span> →{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{b.newValue}</span>
              </li>
            ))}
            {documentRows.map((d, i) => (
              <li key={`document-${i}`}>
                <span className="font-medium">{d.field}</span> →{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{d.newValue}</span>
              </li>
            ))}
            {skippedRows.map((s) => (
              <li key={s.targetId} className="text-zinc-400">
                skipped: {s.targetTitle} ({s.reason})
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={handleApply} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              Apply
            </button>
            <button onClick={box.discard} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">
              Discard
            </button>
          </div>
        </div>
      )}

      {!ambiguous && box.pending && !hasCleanResolution && (
        <div className="fixed bottom-24 left-1/2 z-40 flex w-[560px] -translate-x-1/2 items-start gap-2">
          <AiAvatar />
          <div
            style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
            className="flex-1 rounded-2xl rounded-tl-sm border p-3 text-sm shadow-2xl"
          >
            I couldn&apos;t make sense of that as a request — try naming a milestone (or lane, for a new one) and what should change.
          </div>
        </div>
      )}

      {box.error && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white shadow-lg">
          {box.error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          box.submit(text);
          setText("");
        }}
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
        className="fixed bottom-16 left-1/2 z-40 flex w-[660px] -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-2 shadow-xl"
      >
        {/* Nothing on the chart said this bar was AI-driven — it read as a
            search box. The badge names the capability, and the placeholder
            shows the shape of a request rather than describing it. */}
        <span
          aria-hidden="true"
          style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 0l1.3 3.4L11 4.8 7.6 6.1 6 9.6 4.4 6.1 1 4.8l3.5-1.4z" />
          </svg>
          Ask AI
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={box.loading}
          aria-label="Describe a change for AI to make"
          placeholder='Describe a change — "delay UL 3100 by two weeks"'
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={box.undo}
          disabled={box.historyLength === 0}
          className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
        >
          Undo
        </button>
        <button
          type="submit"
          disabled={box.loading}
          style={{ background: "var(--wf-accent)", color: "var(--wf-panel)" }}
          className="rounded-full px-3 py-1 text-sm disabled:opacity-50"
        >
          {box.loading ? "Thinking…" : "Send"}
        </button>
      </form>

      {/* Says what happens next, which is the part that makes people willing
          to try it: nothing is applied until you've seen the diff. */}
      {!box.pending && !box.error && (
        <p className="pointer-events-none fixed bottom-9 left-1/2 z-40 -translate-x-1/2 text-[11px] opacity-55" style={{ color: "var(--wf-ink)" }}>
          Plain English. You&apos;ll see a preview before anything changes — and Undo reverses it.
        </p>
      )}
    </>
  );
}
