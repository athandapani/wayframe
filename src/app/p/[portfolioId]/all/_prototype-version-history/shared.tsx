"use client";

// PROTOTYPE — throwaway. wayframe#127. The pieces that are the SAME in every
// variant, so each variant file is free to throw out the layout entirely and
// keep only the version-history shape it is actually proposing:
//
//   VersionCanvas     the real RoadmapTimeline over the real
//                     mergeProgramsForAllView merge, fed EITHER the live
//                     Programs or a stored Version's Programs. Read-only is
//                     expressed the way the app already expresses it —
//                     by omitting the on* mutation callbacks, not by a
//                     CSS overlay (see all/page.tsx's own t26 comment).
//   MockProgramRail   a stand-in for the real ProgramRail at roughly its
//                     real density, so no variant wins by being emptier
//                     than the surface it has to live inside.
//   version helpers   labels, counts, and the "what changed" line — the
//                     same facts in all three, differently placed.
//   ProtoStatePanel   rule 5: the whole store printed after every action,
//                     plus the scaffolding that makes live ≠ versions
//                     (a fake edit, so "Save a version" has something new
//                     to capture).
//
// No fetch, no DB, no Yjs: saving a version appends to an in-memory array.
// #128 builds the real table, list and read-only route behind whichever
// shape wins.
import { useMemo, useState } from "react";
import type { Program } from "@/components/timeline/types";
import { mergeForRender } from "@/components/timeline/types";
import { mergeProgramsForAllView } from "@/lib/portfolio/merge-programs";
import { resolvePortfolioTheme, defaultPortfolioTheme } from "@/components/timeline/theme";
import { RoadmapTimeline } from "@/components/timeline/RoadmapTimeline";
import { MOCK_PORTFOLIO, MOCK_PROGRAMS, MOCK_VERSIONS, type MockVersion } from "./mock-data";

export const PROTO_TODAY = new Date("2026-05-15T00:00:00.000Z");
export const PROTO_THEME = resolvePortfolioTheme(MOCK_PORTFOLIO.theme ?? defaultPortfolioTheme);

/** "Sep 18, 2:14 PM" — the absolute (never relative) convention SnapshotsPanel/SharePanel already use for stored records. */
export function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function versionTitle(v: MockVersion): string {
  return v.label ?? formatSavedAt(v.savedAt);
}

export function countMilestones(programs: Program[]): number {
  return programs.reduce((n, p) => n + p.milestones.length, 0);
}

/**
 * The one-line "what changed" a row can carry, computed against the version
 * saved before it. Whether a list row is worth this much text at all is part
 * of what the variants disagree about — B and C lean on it, A doesn't.
 */
export function describeChange(current: MockVersion, previous: MockVersion | undefined): string {
  const milestones = countMilestones(current.programs);
  if (!previous) return `${current.programs.length} Programs · ${milestones} milestones`;
  const added = milestones - countMilestones(previous.programs);
  const moved = current.programs.reduce((n, p) => {
    const before = previous.programs.find((q) => q.id === p.id);
    if (!before) return n;
    return n + p.milestones.filter((m) => before.milestones.find((x) => x.id === m.id)?.date !== undefined && before.milestones.find((x) => x.id === m.id)!.date !== m.date).length;
  }, 0);
  const bits = [added > 0 ? `+${added} milestone${added === 1 ? "" : "s"}` : null, moved > 0 ? `${moved} date${moved === 1 ? "" : "s"} moved` : null].filter(Boolean);
  return bits.length > 0 ? bits.join(" · ") : "no structural change";
}

export interface SaveLogEntry {
  at: string;
  label: string | null;
  milestones: number;
}

/** Everything the three variants share as *state*: the version store, which one is being viewed (null = live), and a live document you can dirty so a new Version differs from the last. */
export function useProtoState() {
  const [livePrograms, setLivePrograms] = useState<Program[]>(MOCK_PROGRAMS);
  const [versions, setVersions] = useState<MockVersion[]>(MOCK_VERSIONS);
  /** null = the live document. Any other value = read-only viewing of that Version. */
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [saveLog, setSaveLog] = useState<SaveLogEntry[]>([]);
  const [editCount, setEditCount] = useState(0);

  const viewing = versions.find((v) => v.id === viewingId) ?? null;
  const shownPrograms = viewing ? viewing.programs : livePrograms;
  const readOnly = viewing !== null;

  /** Manual-only, per #119 — there is no automatic checkpoint anywhere in this prototype on purpose. */
  function saveVersion(label: string | null) {
    // Mid-morning "today", so a freshly saved row reads like a plausible
    // save time next to the seeded ones rather than like midnight.
    const at = new Date(PROTO_TODAY.getTime() + (14 + editCount) * 3600_000).toISOString();
    const v: MockVersion = { id: `v${versions.length + 1}-new`, savedAt: at, savedBy: "You", label: label ?? undefined, programs: livePrograms };
    setVersions((prev) => [v, ...prev]);
    setSaveLog((prev) => [{ at, label, milestones: countMilestones(livePrograms) }, ...prev]);
    // A save always captures the LIVE document, never the version you happen
    // to be reading — so it also drops you back onto live, rather than
    // leaving you in read-only next to a new row you didn't just look at.
    setViewingId(null);
    return v.id;
  }

  /** Renaming an already-saved Version — content is immutable (#t11's append-only shape), the label is not. Whether a variant offers this at all is a design choice, so it lives here rather than in any one of them. */
  function renameVersion(id: string, label: string) {
    setVersions((prev) => prev.map((v) => (v.id === id ? { ...v, label: label || undefined } : v)));
  }

  /** Prototype scaffolding, NOT a proposed affordance: dirty the live document so the next saved Version is visibly different from the last one. */
  function simulateEdit() {
    setEditCount((n) => n + 1);
    setLivePrograms((prev) =>
      prev.map((p, i) =>
        i !== 0
          ? p
          : {
              ...p,
              milestones: p.milestones.map((m, j) => (j !== 2 ? m : { ...m, date: new Date(new Date(`${m.date}T00:00:00.000Z`).getTime() + 12 * 86400_000).toISOString().slice(0, 10), status: "delayed" as const })),
            },
      ),
    );
  }

  return { livePrograms, versions, viewingId, setViewingId, viewing, shownPrograms, readOnly, saveVersion, renameVersion, saveLog, simulateEdit, editCount };
}

export type ProtoState = ReturnType<typeof useProtoState>;

/**
 * The combined canvas, showing whichever Programs it's handed. Read-only is
 * the absence of mutation callbacks — the same way the pre-#126 read-only
 * `/all` expressed it, and the same way #128 will (RoadmapWorkspace with
 * editing disabled), so a variant can't fake read-only-ness with a scrim.
 */
export function VersionCanvas({ programs, readOnly, width }: { programs: Program[]; readOnly: boolean; width?: number }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const data = useMemo(() => {
    const merged = mergeProgramsForAllView(MOCK_PORTFOLIO.id, programs);
    const renderable = mergeForRender(MOCK_PORTFOLIO, merged);
    return { ...renderable, swimlaneGroups: (renderable.swimlaneGroups ?? []).map((g) => (collapsed.has(g.id) ? { ...g, collapsed: true } : g)) };
  }, [programs, collapsed]);

  return (
    <RoadmapTimeline
      data={data}
      today={PROTO_TODAY}
      theme={PROTO_THEME}
      width={width}
      // Collapse stays available while viewing a Version — it's viewer-local
      // and reads nothing back into the document, so it's the one control
      // that survives read-only (you still need to be able to scan an old
      // Roadmap). Everything that would WRITE is simply not passed.
      onToggleGroupCollapsed={(groupId) =>
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(groupId)) next.delete(groupId);
          else next.add(groupId);
          return next;
        })
      }
      onMilestoneClick={readOnly ? undefined : () => {}}
    />
  );
}

/** Stand-in for the real ProgramRail (#126) at roughly its density — two affordances per card, lanes under the expanded one. `readOnly` strips what a Version viewer must not offer. */
export function MockProgramRail({ programs, readOnly, header, footer, width = 300 }: { programs: Program[]; readOnly: boolean; header?: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  const [expandedId, setExpandedId] = useState<string | null>(programs[0]?.id ?? null);
  return (
    <aside className="flex shrink-0 flex-col border-r border-[var(--wf-border)] bg-[var(--wf-panel)] text-[var(--wf-ink)]" style={{ width }}>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {programs.map((p) => (
          <div key={p.id} className="border-b border-[var(--wf-border)]">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-xs opacity-60">◻</span>
              <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                {p.programName}
              </button>
              <span className="text-[11px] opacity-50">{p.milestones.length}</span>
              <span className="text-xs opacity-60">{expandedId === p.id ? "▾" : "▸"}</span>
            </div>
            {expandedId === p.id && (
              <div className="px-3 pb-2">
                {p.swimlanes.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 py-0.5 text-xs">
                    <span className="min-w-0 flex-1 truncate opacity-80">{l.name}</span>
                    {!readOnly && <span className="opacity-40">▲ ▼ ⇄ ✕</span>}
                  </div>
                ))}
                {!readOnly ? (
                  <button className="mt-1 rounded border border-dashed border-[var(--wf-border)] px-1.5 py-0.5 text-[11px] opacity-70">All lane options…</button>
                ) : (
                  <p className="mt-1 text-[11px] opacity-40">Lanes as they were in this version</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {footer}
    </aside>
  );
}

/** Rule 5 — the whole store printed after every action, plus the scaffolding buttons that make the store change. Identical in all three variants; deliberately ugly so it can't be mistaken for design. */
export function ProtoStatePanel({ state }: { state: ProtoState }) {
  return (
    <div className="border-t-2 border-dashed border-emerald-500 bg-zinc-50 px-3 pb-16 pt-2 font-mono text-[11px] leading-relaxed text-zinc-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white">proto scaffolding</span>
        <button onClick={state.simulateEdit} className="rounded border border-zinc-400 px-1.5 py-0.5">
          Make a live edit (so the next Version differs)
        </button>
        <span>
          viewing: {state.viewing ? `${versionTitle(state.viewing)} (read-only)` : "LIVE (editable)"} · live edits: {state.editCount} · versions stored: {state.versions.length}
        </span>
      </div>
      <div>
        live: {countMilestones(state.livePrograms)} milestones · on screen: {countMilestones(state.shownPrograms)} milestones
      </div>
      {state.saveLog.length === 0 ? (
        <div className="opacity-60">saved this session: none yet</div>
      ) : (
        <ul>
          {state.saveLog.map((e, i) => (
            <li key={i}>
              save#{state.saveLog.length - i} at {formatSavedAt(e.at)} · label: {e.label ? `"${e.label}"` : "(none)"} · captured {e.milestones} milestones across {state.livePrograms.length} Programs
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
