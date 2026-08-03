"use client";

// PROTOTYPE — throwaway. wayframe#23, Variant C.
//
// Chat-style hero composer, centered on an otherwise empty page. Photo
// attaches inline above the composer, like a chat app's image preview.
// Loading cycles through a couple lines of copy instead of a static
// spinner. Errors land as a message bubble and get partial differentiation
// — a soft nudge for "you didn't give me anything" vs. a real error bubble
// for everything else — a middle point between Variant A's fully generic
// message and Variant B's fully typed one. Sample content is a single
// suggestion chip that fills text *and* attaches the sample photo together,
// demonstrating the dual-input path in one click.
import { useEffect, useRef, useState } from "react";
import type { ExtractionError } from "@/lib/extraction/extract";
import {
  callExtract,
  generateSampleWhiteboardPhoto,
  readFileAsDataUrl,
  SAMPLE_NOTES_TEXT,
  validateImageFile,
  type ExtractSuccess,
} from "./shared";

const LOADING_LINES = ["Reading your notes…", "Sketching the roadmap…", "Almost there…"];

export function VariantC() {
  const [text, setText] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [loadingLine, setLoadingLine] = useState(0);
  const [error, setError] = useState<ExtractionError | null>(null);
  const [result, setResult] = useState<ExtractSuccess | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status !== "loading") return;
    const id = setInterval(() => setLoadingLine((l) => (l + 1) % LOADING_LINES.length), 1400);
    return () => clearInterval(id);
  }, [status]);

  async function attachPhoto(file: File) {
    setPhotoError(null);
    const problem = validateImageFile(file);
    if (problem) {
      setPhotoError(problem);
      return;
    }
    setPhotoDataUrl(await readFileAsDataUrl(file));
    setPhotoName(file.name);
  }

  const canSubmit = (text.trim().length > 0 || photoDataUrl !== null) && status !== "loading";

  async function submit() {
    if (!canSubmit) return;
    setLoadingLine(0);
    setStatus("loading");
    setError(null);
    setResult(null);
    const outcome = await callExtract(text, photoDataUrl);
    setStatus("idle");
    if (outcome.ok) setResult(outcome.result);
    else setError(outcome.error);
  }

  function useSample() {
    setText(SAMPLE_NOTES_TEXT);
    setPhotoDataUrl(generateSampleWhiteboardPhoto());
    setPhotoName("sample-whiteboard.png");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <h1 className="mb-8 text-center text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
        What&rsquo;s the state of your program?
      </h1>

      {error && (
        <div
          className={
            "mb-3 max-w-lg rounded-2xl px-4 py-2 text-sm " +
            (error.kind === "no_input"
              ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400")
          }
        >
          {error.kind === "no_input"
            ? "Give me some notes or a photo to work with."
            : "Couldn't build a roadmap from that — try adding more detail or a clearer photo."}
        </div>
      )}

      {result && (
        <div className="mb-3 max-w-lg rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
          Built &ldquo;{result.programName}&rdquo; — {result.topLevelItemCount} top-level items, {result.milestoneCount} milestones.
        </div>
      )}

      <div className="w-full max-w-lg">
        {photoDataUrl && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoDataUrl} alt="" className="h-8 w-8 rounded object-cover" />
            <span className="flex-1 truncate text-zinc-600 dark:text-zinc-300">{photoName}</span>
            <button
              onClick={() => {
                setPhotoDataUrl(null);
                setPhotoName(null);
              }}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
        )}

        <div
          className={
            "flex items-end gap-2 rounded-3xl border bg-white px-3 py-2 shadow-sm transition-colors dark:bg-zinc-900 " +
            (dragOver ? "border-emerald-500" : "border-zinc-300 dark:border-zinc-700")
          }
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) attachPhoto(file);
          }}
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={status === "loading"}
            className="shrink-0 rounded-full p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
            aria-label="Attach a photo"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) attachPhoto(file);
            }}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={status === "loading"}
            placeholder="Paste your notes, or just drop a photo…"
            rows={1}
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none disabled:opacity-50 dark:text-zinc-100"
          />
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="shrink-0 rounded-full bg-zinc-900 p-2 text-white disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900"
            aria-label="Build roadmap"
          >
            {status === "loading" ? (
              <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-zinc-900/40 dark:border-t-zinc-900" />
            ) : (
              "→"
            )}
          </button>
        </div>
        {photoError && <p className="mt-1 px-2 text-xs text-red-600 dark:text-red-400">{photoError}</p>}
        {status === "loading" && (
          <p className="mt-1 px-2 text-xs text-zinc-400">{LOADING_LINES[loadingLine]}</p>
        )}
      </div>

      <button
        onClick={useSample}
        disabled={status === "loading"}
        className="mt-4 rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        ✨ Try Atlas robotics program notes
      </button>
    </div>
  );
}
