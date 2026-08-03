"use client";

// The real `/` entry page's input surface (wayframe#25), folding in Variant
// B from the wayframe#23 prototype spike (prototype/entry-input-ux): two
// panes, always both visible (no tab-switching — text and photo are
// options, not a source you pick between). Errors are fully differentiated
// per /api/extract's typed ExtractionError kind, with a collapsible "Show
// details" for the two kinds that carry an `issues[]` list. Sample content
// is split per-pane so a visitor can see each affordance independently.
import { useRef, useState } from "react";
import type { RoadmapData } from "@/components/timeline/types";
import type { ExtractionError } from "@/lib/extraction/extract";
import {
  generateSampleWhiteboardPhoto,
  readFileAsDataUrl,
  SAMPLE_NOTES_TEXT,
  validateImageFile,
} from "./sample-content";

const ERROR_COPY: Record<ExtractionError["kind"], { tone: "amber" | "red" | "zinc"; message: string }> = {
  no_input: { tone: "zinc", message: "Add some notes or a photo first." },
  api_error: { tone: "red", message: "Couldn't reach Claude just now — check your connection and try again." },
  no_tool_call: { tone: "amber", message: "The model didn't return a structured result. Try again, or add a bit more detail." },
  schema_validation_failed: { tone: "amber", message: "The extraction came out malformed. Try again, or simplify the input a little." },
  dangling_reference: { tone: "amber", message: "The extraction referenced something that doesn't exist. Try again." },
  empty_extraction: { tone: "zinc", message: "Couldn't find any milestones or schedule items in that input — try adding more detail." },
};

const TONE_CLASSES: Record<"amber" | "red" | "zinc", string> = {
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
  red: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

async function callExtract(text: string, imageDataUrl: string | null): Promise<{ ok: true; document: RoadmapData } | { ok: false; error: ExtractionError }> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text || undefined, imageDataUrl: imageDataUrl || undefined }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, error: body?.error ?? { kind: "api_error", message: "Extraction failed." } };
  }
  return { ok: true, document: body.document as RoadmapData };
}

export function EntryForm({ onExtracted }: { onExtracted: (data: RoadmapData) => void }) {
  const [text, setText] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<ExtractionError | null>(null);
  const [showDetails, setShowDetails] = useState(false);
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
    setShowDetails(false);
    const outcome = await callExtract(text, photoDataUrl);
    setStatus("idle");
    if (outcome.ok) onExtracted(outcome.document);
    else setError(outcome.error);
  }

  return (
    <div className="mx-auto max-w-3xl p-8 pt-16">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Build your roadmap</h1>
      <p className="mb-6 text-sm text-zinc-500">Type your notes, upload a photo, or both — at least one is required.</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          <h2 className="mb-2 text-xs font-bold tracking-wide text-zinc-500 uppercase">Notes</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={status === "loading"}
            placeholder="Paste meeting notes, a status update, anything…"
            rows={10}
            className="w-full resize-none rounded-lg border border-zinc-200 bg-transparent p-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100"
          />
          <button
            onClick={() => setText(SAMPLE_NOTES_TEXT)}
            disabled={status === "loading"}
            className="mt-2 text-xs text-zinc-500 underline decoration-dotted hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200"
          >
            Use sample notes
          </button>
        </div>

        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          <h2 className="mb-2 text-xs font-bold tracking-wide text-zinc-500 uppercase">Photo</h2>
          <div
            className={
              "flex h-[calc(100%-2.5rem)] min-h-[180px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 text-center transition-colors " +
              (photoDragOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-zinc-300 dark:border-zinc-700")
            }
            onDragOver={(e) => {
              e.preventDefault();
              setPhotoDragOver(true);
            }}
            onDragLeave={() => setPhotoDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setPhotoDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) attachPhoto(file);
            }}
          >
            {photoDataUrl ? (
              <div className="w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoDataUrl} alt="" className="mx-auto mb-2 max-h-32 rounded object-contain" />
                <p className="mb-2 truncate text-xs text-zinc-500">{photoName}</p>
                <button
                  onClick={() => {
                    setPhotoDataUrl(null);
                    setPhotoName(null);
                  }}
                  className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Remove photo
                </button>
              </div>
            ) : (
              <>
                <p className="mb-2 text-xs text-zinc-500">Drag a photo here, or</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={status === "loading"}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Browse
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
              </>
            )}
          </div>
          {photoError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{photoError}</p>}
          <button
            onClick={() => setPhotoDataUrl(generateSampleWhiteboardPhoto())}
            disabled={status === "loading"}
            className="mt-2 text-xs text-zinc-500 underline decoration-dotted hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200"
          >
            Use sample photo
          </button>
        </div>
      </div>

      {error && (
        <div className={"mt-4 rounded-lg px-3 py-2 text-sm " + TONE_CLASSES[ERROR_COPY[error.kind].tone]}>
          <p>{ERROR_COPY[error.kind].message}</p>
          {"issues" in error && error.issues.length > 0 && (
            <>
              <button onClick={() => setShowDetails((s) => !s)} className="mt-1 text-xs underline">
                {showDetails ? "Hide details" : "Show details"}
              </button>
              {showDetails && (
                <ul className="mt-1 list-inside list-disc text-xs">
                  {error.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="mt-4 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {status === "loading" ? "Extracting…" : "Extract roadmap →"}
      </button>
    </div>
  );
}
