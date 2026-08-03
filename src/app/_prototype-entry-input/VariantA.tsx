"use client";

// PROTOTYPE — throwaway. wayframe#23, Variant A.
//
// Unified composer: one card, drop a photo anywhere on it. Single generic
// error message regardless of what /api/extract's typed error actually was
// — the bet here is that a first-time visitor doesn't care *why* it failed,
// just that they should try again. One sample link, text-only (the simplest
// possible "try it" affordance).
import { useRef, useState } from "react";
import type { ExtractionError } from "@/lib/extraction/extract";
import {
  callExtract,
  readFileAsDataUrl,
  SAMPLE_NOTES_TEXT,
  validateImageFile,
  type ExtractSuccess,
} from "./shared";

export function VariantA() {
  const [text, setText] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<ExtractionError | null>(null);
  const [result, setResult] = useState<ExtractSuccess | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setStatus("loading");
    setError(null);
    setResult(null);
    const outcome = await callExtract(text, photoDataUrl);
    setStatus("idle");
    if (outcome.ok) setResult(outcome.result);
    else setError(outcome.error);
  }

  return (
    <div className="mx-auto max-w-xl p-8 pt-24">
      <h1 className="mb-1 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Build your roadmap</h1>
      <p className="mb-6 text-center text-sm text-zinc-500">Paste your notes, drop in a photo of a whiteboard, or both.</p>

      <div
        className={
          "rounded-2xl border-2 border-dashed p-5 transition-colors " +
          (dragOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-zinc-300 dark:border-zinc-700")
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
        {photoDataUrl && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoDataUrl} alt="" className="h-10 w-10 rounded object-cover" />
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

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={status === "loading"}
          placeholder="Paste meeting notes, a status update, anything…"
          rows={8}
          className="w-full resize-none rounded-lg border-none bg-transparent text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none disabled:opacity-50 dark:text-zinc-100"
        />

        <div className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={status === "loading"}
            className="text-xs text-zinc-500 underline decoration-dotted hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200"
          >
            or attach a photo
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
          <button
            onClick={() => setText(SAMPLE_NOTES_TEXT)}
            disabled={status === "loading"}
            className="text-xs text-zinc-500 underline decoration-dotted hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200"
          >
            try a sample
          </button>
        </div>
        {photoError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{photoError}</p>}
      </div>

      {status === "loading" && (
        <div className="mt-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div className="h-1 w-1/3 animate-[loading-bar_1.1s_ease-in-out_infinite] rounded-full bg-emerald-500" />
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
          Something went wrong — try again.
        </p>
      )}

      {result && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
          Built &ldquo;{result.programName}&rdquo; — {result.topLevelItemCount} top-level items, {result.milestoneCount} milestones.
        </p>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="mt-4 w-full rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {status === "loading" ? "Reading your notes…" : "Build my roadmap →"}
      </button>
      {!canSubmit && status !== "loading" && (
        <p className="mt-2 text-center text-xs text-zinc-400">Add notes or a photo to continue.</p>
      )}

      <style jsx>{`
        @keyframes loading-bar {
          0% {
            margin-left: 0%;
          }
          50% {
            margin-left: 66%;
          }
          100% {
            margin-left: 0%;
          }
        }
      `}</style>
    </div>
  );
}
