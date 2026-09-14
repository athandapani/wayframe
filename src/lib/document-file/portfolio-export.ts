// Whole-Portfolio export/import: the second half of wayframe#t17's
// ".wayframe.json vs .wayframeportfolio.json" resolution (see
// document-file.ts's header for the Program-level half). `.wayframe.json`
// keeps its existing PortfolioDocument schema unchanged as the Program-level
// interchange format — by convention still one Program per file, nothing
// enforces that, it's just today's usage pattern. `.wayframeportfolio.json`
// is this new, separate container extension for exporting a whole Portfolio
// with N Programs — no new type needed, since PortfolioDocument's
// `programs` array already structurally supports more than one, it's just
// conventionally allowed to hold more than one here and round-tripped
// through its own extension-specific functions instead of document-file.ts's.
//
// Deliberately unconsumed — no UI button calls savePortfolioExportFile yet,
// same "scaffolded but unconsumed" treatment t4/t13/t36 already got for
// infra landing ahead of the UI that would drive it, since there's no
// multi-Program-per-Portfolio workflow yet for an export button to make
// sense in.
import type { PortfolioDocument } from "@/components/timeline/types";
import { validatePortfolioDocument, type LoadResult } from "./schema";

export type { LoadResult };

export function parsePortfolioExportFile(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file isn't valid JSON.", issues: [] };
  }
  return validatePortfolioDocument(raw);
}

export function portfolioExportFileName(portfolioName?: string): string {
  const slug = (portfolioName ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "portfolio"}.wayframeportfolio.json`;
}

/** Triggers a download of the whole Portfolio (every Program, not just one) as pretty-printed JSON. */
export function savePortfolioExportFile(data: PortfolioDocument): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = portfolioExportFileName();
  a.click();
  // Revoking immediately can cancel the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
