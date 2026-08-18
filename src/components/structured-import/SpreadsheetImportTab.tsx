"use client";

// Deterministic CSV/XLSX import wizard (Archer delta v1.2) — column mapper
// + smart merge + diff review, no AI call at all. Distinct from the
// existing "File upload" tab in ImportPanel.tsx, which still flattens rows
// to text and feeds `/api/extract`; this path never leaves the browser.
import { useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { Milestone, RoadmapData } from "@/components/timeline/types";
import type { PatchOp } from "@/lib/corrections/schema";
import { parseCsvFile } from "@/lib/import/parse-csv";
import { parseXlsxFile } from "@/lib/import/parse-xlsx";
import type { ParsedRow } from "@/lib/import/rows-to-text";
import { guessColumnMapping, rowsToRoadmap, MAPPABLE_FIELDS, type ColumnMapping, type NewMilestone } from "@/lib/import/rows-to-roadmap";
import { DiffBanner, type DiffEntry } from "@/components/shared/DiffBanner";

export function SpreadsheetImportTab({ data, onMerge }: { data: RoadmapData; onMerge: (newLanes: { id: string; name: string }[], adds: Milestone[], updateOps: PatchOp[]) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
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

  async function loadFile(file: File) {
    setLoadError(null);
    try {
      const parsed = file.name.toLowerCase().endsWith(".xlsx") ? await parseXlsxFile(file) : await parseCsvFile(file);
      if (parsed.length === 0) throw new Error("No rows found — check the file has a header row plus at least one data row.");
      setFileName(file.name);
      setRows(parsed);
      const guessed = guessColumnMapping(Object.keys(parsed[0]));
      setMapping(guessed);
      setAcceptedOverride(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to parse file.");
    }
  }

  function setMappingField(field: keyof ColumnMapping, value: string) {
    setMapping((prev) => (prev ? { ...prev, [field]: value || null } : prev));
    setAcceptedOverride(null);
  }

  const merge = useMemo(() => (mapping ? rowsToRoadmap(data, rows, mapping, nanoid) : null), [data, rows, mapping]);

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

  function apply() {
    if (!merge) return;
    const acceptedAdds = merge.adds.filter((m) => accepted.has(m.id));
    const acceptedUpdates = merge.updates.filter((u) => accepted.has(u.id));

    const newLaneNamesNeeded = new Set(acceptedAdds.map((m) => (m as NewMilestone).__newLaneName).filter((n): n is string => !!n));
    const newLanes = Array.from(newLaneNamesNeeded).map((name) => ({ id: nanoid(), name }));
    const laneIdByName = new Map(newLanes.map((l) => [l.name, l.id]));

    const resolvedAdds: Milestone[] = acceptedAdds.map((m) => {
      const { __newLaneName, ...rest } = m as NewMilestone;
      return __newLaneName ? { ...rest, laneId: laneIdByName.get(__newLaneName)! } : rest;
    });

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
    setFileName(null);
    setRows([]);
    setMapping(null);
    setAcceptedOverride(null);
  }

  return (
    <div className="space-y-3">
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
      {loadError && <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>}

      {fileName && mapping && (
        <>
          <p className="text-xs text-zinc-500">
            {fileName} — {rows.length} rows
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

          <DiffBanner title="Review changes" entries={entries} accepted={accepted} onToggle={toggle} onApply={apply} onDiscard={() => setFileName(null)} applyLabel="Import" />
        </>
      )}
    </div>
  );
}
