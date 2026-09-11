// Save / open a roadmap as a .wayframe.json file (prototype/theme-system).
//
// Until now the only persistence was a single localStorage slot, which
// means the work is trapped in one browser profile: no backup, no handoff
// to a colleague, no second roadmap. This is the escape hatch — the whole
// document, round-trippable.
//
// Loading validates before it replaces anything. The reducer's loadDocument
// is destructive-ish (it swaps the whole document, undoably), so handing it
// a malformed file would put the app in a state where the chart throws on
// render and the only recovery is clearing storage. Failing closed with a
// readable reason is the same posture /api/extract already takes.
import type { RoadmapData } from "@/components/timeline/types";
import { validateRoadmapDocument, type LoadResult } from "./schema";

export type { LoadResult };

export function parseDocumentFile(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file isn't valid JSON.", issues: [] };
  }
  return validateRoadmapDocument(raw);
}

export function documentFileName(programName: string): string {
  const slug = programName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "roadmap"}.wayframe.json`;
}

/** Triggers a download of the document as pretty-printed JSON. */
export function saveDocumentFile(data: RoadmapData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = documentFileName(data.programName);
  a.click();
  // Revoking immediately can cancel the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
