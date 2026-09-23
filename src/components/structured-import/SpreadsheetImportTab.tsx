"use client";

// Deterministic CSV/XLSX/Smartsheet import wizard — column mapper
// + smart merge + diff review, no AI call at all. Distinct from the
// existing "AI extraction" tab in ImportPanel.tsx, which still flattens
// rows to text and feeds `/api/extract`; this path never leaves rowsToRoadmap's
// exact key-matching. Smartsheet (wayframe#t39) lives here as a second row
// source rather than under ImportPanel's AI-extraction tab — fetchSheetRows
// already returns the identical ParsedRow[] shape rowsToRoadmap consumes, so
// routing it through an LLM call was standing in for deterministic matching
// that already existed.
import { useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { Milestone, Program } from "@/components/timeline/types";
import type { PatchOp } from "@/lib/corrections/schema";
import { parseCsvFile } from "@/lib/import/parse-csv";
import { parseXlsxFile } from "@/lib/import/parse-xlsx";
import type { ParsedRow } from "@/lib/import/rows-to-text";
import { guessColumnMapping, rowsToRoadmap, MAPPABLE_FIELDS, type ColumnMapping, type NewMilestone } from "@/lib/import/rows-to-roadmap";
import { DiffBanner, type DiffEntry } from "@/components/shared/DiffBanner";
import { useOwnedPortfolioId } from "@/lib/auth/use-owned-portfolio-id";

interface SheetSummary {
  id: string;
  name: string;
}

type SmartsheetState = "disconnected" | "connecting" | "connected" | "pulling";

// rowsToRoadmap's "new Program" case (wayframe#t39, sibling to #t35's
// AI-extraction path): matching against an empty document means every row
// falls through to `adds` with no updates possible, exactly the seed the
// gist calls for. A module-level constant since rowsToRoadmap only reads
// `swimlanes`/`milestones` off it and this keeps the useMemo dep stable.
const EMPTY_SEED_PROGRAM: Program = {
  id: "",
  portfolioId: "",
  order: 0,
  programName: "",
  generatedAt: "",
  owner: "",
  bluf: { statement: "", bullets: [] },
  actionItems: [],
  swimlanes: [],
  topLevelItems: [],
  milestones: [],
};

export function SpreadsheetImportTab({
  data,
  onMerge,
  onClose,
}: {
  data: Program;
  onMerge: (newLanes: { id: string; name: string }[], adds: Milestone[], updateOps: PatchOp[]) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<"file" | "smartsheet">("file");
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // `null` = "not customized yet, default every entry to accepted" — the
  // moment a mapping edit or a fresh file load changes what the diff even
  // is, this resets to null rather than trying to carry stale per-id
  // choices forward. A real Set only exists once the viewer actually
  // toggles a row. Avoids syncing derived state through an effect (which
  // this repo's lint config flags as cascading-render-prone) — accepted
  // ids are computed straight from `entries` in render instead.
  const [acceptedOverride, setAcceptedOverride] = useState<Set<string> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [smartsheetState, setSmartsheetState] = useState<SmartsheetState>("disconnected");
  const [smartsheetError, setSmartsheetError] = useState<string | null>(null);

  const targetPortfolioId = useOwnedPortfolioId();
  const [createAsNewProgram, setCreateAsNewProgramRaw] = useState(false);
  const [newProgramName, setNewProgramName] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [createdConfirmation, setCreatedConfirmation] = useState(false);

  function loadRows(label: string, parsed: ParsedRow[]) {
    setSourceLabel(label);
    setRows(parsed);
    const guessed = guessColumnMapping(Object.keys(parsed[0]));
    setMapping(guessed);
    setAcceptedOverride(null);
    setCreatedConfirmation(false);
    setApplyError(null);
  }

  async function loadFile(file: File) {
    setLoadError(null);
    try {
      const parsed = file.name.toLowerCase().endsWith(".xlsx") ? await parseXlsxFile(file) : await parseCsvFile(file);
      if (parsed.length === 0) throw new Error("No rows found — check the file has a header row plus at least one data row.");
      loadRows(file.name, parsed);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to parse file.");
    }
  }

  async function connectSmartsheet() {
    setSmartsheetState("connecting");
    setSmartsheetError(null);
    try {
      const res = await fetch("/api/smartsheet/sheets");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to connect to Smartsheet.");
      setSheets(body.sheets);
      setSelectedSheetId(body.sheets[0]?.id ?? null);
      setSmartsheetState("connected");
    } catch (err) {
      setSmartsheetError(err instanceof Error ? err.message : "Failed to connect to Smartsheet.");
      setSmartsheetState("disconnected");
    }
  }

  async function pullSheet() {
    if (!selectedSheetId) return;
    setSmartsheetState("pulling");
    setSmartsheetError(null);
    try {
      const res = await fetch(`/api/smartsheet/sheets/${selectedSheetId}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to pull sheet.");
      if (body.rows.length === 0) throw new Error("That sheet has no rows.");
      loadRows(body.label, body.rows);
    } catch (err) {
      setSmartsheetError(err instanceof Error ? err.message : "Failed to pull sheet.");
    } finally {
      setSmartsheetState("connected");
    }
  }

  function setMappingField(field: keyof ColumnMapping, value: string) {
    setMapping((prev) => (prev ? { ...prev, [field]: value || null } : prev));
    setAcceptedOverride(null);
  }

  function setCreateAsNewProgram(next: boolean) {
    setCreateAsNewProgramRaw(next);
    setAcceptedOverride(null);
    setCreatedConfirmation(false);
    setApplyError(null);
  }

  const matchTarget = createAsNewProgram ? EMPTY_SEED_PROGRAM : data;
  const merge = useMemo(() => (mapping ? rowsToRoadmap(matchTarget, rows, mapping, nanoid) : null), [matchTarget, rows, mapping]);

  const entries: DiffEntry[] = useMemo(() => {
    if (!merge) return [];
    const laneNameById = new Map(data.swimlanes.map((l) => [l.id, l.name]));
    const addEntries: DiffEntry[] = merge.adds.map((m) => ({
      id: m.id,
      kind: "add",
      title: m.title,
      detail: `in ${(m as NewMilestone).__newLaneName ?? laneNameById.get(m.laneId) ?? "?"}, ${m.date}`,
    }));
    const updateEntries: DiffEntry[] = merge.updates.map((u) => ({
      id: u.id,
      kind: "update",
      title: u.title,
      detail: `in ${u.laneName}`,
      fieldChanges: Object.entries(u.patch).map(([field, after]) => ({ field, before: u.before[field] ?? "", after: String(after ?? "") })),
    }));
    return [...addEntries, ...updateEntries];
  }, [merge, data.swimlanes]);

  // Every entry defaults accepted until the viewer opts one out.
  const accepted = acceptedOverride ?? new Set(entries.map((e) => e.id));

  function toggle(id: string) {
    const next = new Set(accepted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAcceptedOverride(next);
  }

  function resetSource() {
    setSourceLabel(null);
    setRows([]);
    setMapping(null);
    setAcceptedOverride(null);
  }

  async function apply() {
    if (!merge || applying) return;
    const acceptedAdds = merge.adds.filter((m) => accepted.has(m.id));
    const acceptedUpdates = merge.updates.filter((u) => accepted.has(u.id));

    const newLaneNamesNeeded = new Set(acceptedAdds.map((m) => (m as NewMilestone).__newLaneName).filter((n): n is string => !!n));
    const newLanes = Array.from(newLaneNamesNeeded).map((name) => ({ id: nanoid(), name }));
    const laneIdByName = new Map(newLanes.map((l) => [l.name, l.id]));

    const resolvedAdds: Milestone[] = acceptedAdds.map((m) => {
      const { __newLaneName, ...rest } = m as NewMilestone;
      return __newLaneName ? { ...rest, laneId: laneIdByName.get(__newLaneName)! } : rest;
    });

    if (createAsNewProgram && targetPortfolioId) {
      setApplying(true);
      setApplyError(null);
      try {
        const document = {
          programName: newProgramName.trim() || sourceLabel || "New Program",
          generatedAt: new Date().toISOString(),
          owner: "",
          bluf: { statement: "", bullets: [] },
          actionItems: [],
          swimlanes: newLanes.map((l, i) => ({ id: l.id, order: i, type: "lane" as const, name: l.name })),
          topLevelItems: [],
          milestones: resolvedAdds,
        };
        const res = await fetch(`/api/portfolios/${targetPortfolioId}/programs/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Couldn't create the new Program.");
        setCreatedConfirmation(true);
      } catch (err) {
        setApplyError(err instanceof Error ? err.message : "Couldn't create the new Program.");
      } finally {
        setApplying(false);
      }
      return;
    }

    const updateOps: PatchOp[] = acceptedUpdates.flatMap((u) =>
      (Object.entries(u.patch) as [keyof typeof u.patch, unknown][])
        .filter(([, v]) => v !== undefined || true)
        .map(([field, value]) => {
          if (field === "status") return { targetId: u.id, field: "status", newValue: value as Milestone["status"], reason: "spreadsheet import" };
          if (field === "percentComplete") return { targetId: u.id, field: "percentComplete", newValue: value as number, reason: "spreadsheet import" };
          if (field === "endDate") return { targetId: u.id, field: "endDate", newValue: (value as string) ?? "", reason: "spreadsheet import" };
          if (field === "owner") return { targetId: u.id, field: "owner", newValue: (value as string) ?? "", reason: "spreadsheet import" };
          if (field === "comment") return { targetId: u.id, field: "comment", newValue: (value as string) ?? "", reason: "spreadsheet import" };
          return { targetId: u.id, field: "date", newValue: value as string, reason: "spreadsheet import" };
        }),
    );

    onMerge(newLanes, resolvedAdds, updateOps);
    resetSource();
  }

  return (
    <div className="space-y-3">
      <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-xs dark:border-zinc-700">
        {(["file", "smartsheet"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={"flex-1 px-3 py-1.5 " + (source === s ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-300")}
          >
            {s === "file" ? "File (CSV / XLSX)" : "Smartsheet"}
          </button>
        ))}
      </div>

      {source === "file" && (
        <div className="flex gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
            Browse CSV / XLSX
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {loadError && <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>}

      {source === "smartsheet" && (
        <div className="space-y-2">
          {smartsheetState === "disconnected" && (
            <button onClick={connectSmartsheet} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
              Connect Smartsheet
            </button>
          )}
          {smartsheetState === "connecting" && <p className="text-sm text-zinc-500">Connecting…</p>}
          {(smartsheetState === "connected" || smartsheetState === "pulling") && (
            <div className="flex gap-2">
              <select
                value={selectedSheetId ?? ""}
                onChange={(e) => setSelectedSheetId(e.target.value)}
                className="flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-600"
              >
                {sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={pullSheet}
                disabled={smartsheetState === "pulling" || !selectedSheetId}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {smartsheetState === "pulling" ? "Pulling…" : "Pull now"}
              </button>
            </div>
          )}
          {smartsheetError && <p className="text-xs text-red-600 dark:text-red-400">{smartsheetError}</p>}
          <p className="text-xs text-zinc-400">One-way pull, matched deterministically by title + lane — re-pull any time to sync, no write-back.</p>
        </div>
      )}

      {sourceLabel && mapping && (
        <>
          <p className="text-xs text-zinc-500">
            {sourceLabel} — {rows.length} rows
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            {MAPPABLE_FIELDS.map((f) => (
              <label key={f.id} className="text-xs">
                <span className="mb-1 block text-zinc-500">
                  {f.label}
                  {f.required && " *"}
                </span>
                <select
                  value={mapping[f.id] ?? ""}
                  onChange={(e) => setMappingField(f.id, e.target.value)}
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                >
                  <option value="">(none)</option>
                  {Object.keys(rows[0] ?? {}).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {merge && merge.skipped.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {merge.skipped.length} row{merge.skipped.length === 1 ? "" : "s"} skipped ({merge.skipped[0].reason}
              {merge.skipped.length > 1 ? ", …" : ""}).
            </p>
          )}

          {targetPortfolioId && (
            <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={createAsNewProgram} onChange={(e) => setCreateAsNewProgram(e.target.checked)} />
                Add as a new Program in my Roadmap (instead of updating this one)
              </label>
              {createAsNewProgram && (
                <input
                  type="text"
                  value={newProgramName}
                  onChange={(e) => setNewProgramName(e.target.value)}
                  placeholder={sourceLabel ?? "New Program"}
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-600"
                />
              )}
            </div>
          )}

          {applyError && <p className="text-xs text-red-600 dark:text-red-400">{applyError}</p>}

          {createdConfirmation ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ Added as a new Program in your Roadmap.</p>
              <button onClick={onClose} className="w-full rounded-lg bg-zinc-900 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                Done
              </button>
            </div>
          ) : (
            <DiffBanner
              title="Review changes"
              entries={entries}
              accepted={accepted}
              onToggle={toggle}
              onApply={apply}
              onDiscard={resetSource}
              applyLabel={applying ? "Working…" : createAsNewProgram ? "Create Program" : "Import"}
            />
          )}
        </>
      )}
    </div>
  );
}
