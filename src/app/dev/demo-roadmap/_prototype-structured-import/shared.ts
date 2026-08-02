// PROTOTYPE — throwaway. wayframe#13: structured-data import design
// (file upload + Smartsheet one-way live pull). Shared parsing/serialization
// used by all three variants so they answer the same question — "what
// should this look like" — on top of identical plumbing.
//
// Smartsheet is fully mocked here: wayframe#12 (provisioning a real
// Smartsheet API token) is a separate, still-open ticket. This design pass
// doesn't need real credentials — only the interaction shape does.

export type ParsedRow = Record<string, string>;

export interface LoadedSource {
  kind: "file" | "smartsheet";
  label: string;
  rows: ParsedRow[];
  loadedAt: Date;
}

// Naive CSV parsing — good enough for a prototype's drag/drop demo files.
// SheetJS/PapaParse (per the ticket) would replace this for XLSX + real
// quoting/escaping edge cases.
export function parseCsvText(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: ParsedRow = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

// The one place both import paths converge: rows become the same plain-text
// blob shape the existing /api/extract route already accepts as `text`
// (see src/lib/extraction/prompt.ts) — no new API field, no schema change.
export function rowsToText(sourceLabel: string, rows: ParsedRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    `Source: ${sourceLabel}`,
    headers.join(" | "),
    ...rows.map((r) => headers.map((h) => r[h] ?? "").join(" | ")),
  ];
  return lines.join("\n");
}

export const SAMPLE_CSV_FILENAME = "atlas-safety-cert-schedule.csv";
export const SAMPLE_CSV_TEXT = `Task,Lane,Date,Owner,Status
UL 3100 pre-submission review,Safety Certification,2026-09-05,T. Boyer,on-track
UL 3100 lab test slot,Safety Certification,2026-11-10,T. Boyer,at-risk
Certification report sign-off,Safety Certification,2026-12-01,T. Boyer,not-started
Motor controller dual-source qualification,Mechanical & Hardware,2026-09-20,R. Alvarez,on-track`;

export interface MockSheet {
  id: string;
  name: string;
  rows: ParsedRow[];
}

// Canned "workspace" a mocked Smartsheet connection would return — same
// Atlas Mobile Robot Platform theme as the real demo dataset, zero
// Archer-specific content.
export const MOCK_SMARTSHEET_ACCOUNT = "demo@wayframe.dev";

export const MOCK_SHEETS: MockSheet[] = [
  {
    id: "sheet-pilot",
    name: "Field Pilot Deployments Tracker",
    rows: [
      { Task: "Pilot Site 1 go-live", Lane: "Field Pilot Deployments", Date: "2026-10-01", Owner: "K. Simmons", Status: "on-track" },
      { Task: "Pilot Site 2 go-live", Lane: "Field Pilot Deployments", Date: "2026-10-15", Owner: "K. Simmons", Status: "at-risk" },
      { Task: "Pilot Site 3 go-live", Lane: "Field Pilot Deployments", Date: "2026-11-01", Owner: "K. Simmons", Status: "on-track" },
    ],
  },
  {
    id: "sheet-mfg",
    name: "Manufacturing Ramp Schedule",
    rows: [
      { Task: "Production tooling complete", Lane: "Manufacturing & Supply Chain", Date: "2026-09-30", Owner: "R. Alvarez", Status: "on-track" },
      { Task: "Phase 2 ramp start", Lane: "Manufacturing & Supply Chain", Date: "2026-12-01", Owner: "R. Alvarez", Status: "not-started" },
    ],
  },
  {
    id: "sheet-launch",
    name: "Commercial Launch Readiness",
    rows: [
      { Task: "Pricing finalized", Lane: "Commercial Launch", Date: "2026-08-15", Owner: "Dana Whitfield", Status: "complete" },
      { Task: "Channel agreements signed", Lane: "Commercial Launch", Date: "2026-09-01", Owner: "Dana Whitfield", Status: "on-track" },
    ],
  },
];

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
