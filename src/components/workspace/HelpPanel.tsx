"use client";

// "What can this do?" — one place listing every capability.
//
// The tool had grown a lot of features that are only discoverable by
// opening the options menu and reading it, or by clicking something and
// finding out. Drag-to-reschedule and path tracing in particular are
// invisible until someone tells you they exist.
//
// Grouped by the question a reader is actually asking ("how do I get my
// plan in?", "how do I change it?") rather than by where the code lives.
import { WayframeMark } from "@/components/brand/WayframeLogo";
import type { Theme } from "@/components/timeline/theme";

interface Feature {
  name: string;
  detail: string;
  /** Where the control lives, when it isn't obvious. */
  where?: string;
}

const GROUPS: { title: string; blurb: string; features: Feature[] }[] = [
  {
    title: "Getting a plan in",
    blurb: "Four ways in; all of them end up in the same editable roadmap.",
    features: [
      { name: "Type or paste notes", detail: "Meeting notes, a status mail, a rough list — AI drafts the roadmap from it.", where: "Entry page" },
      { name: "Photograph a whiteboard", detail: "A napkin sketch or whiteboard photo is read the same way as text.", where: "Entry page" },
      { name: "Import a CSV", detail: "Parsed in the browser, previewed row by row before anything is extracted.", where: "Options ▸ Import" },
      { name: "Pull from Smartsheet", detail: "One-way live pull from a sheet. Nothing is written back.", where: "Options ▸ Import" },
    ],
  },
  {
    title: "Changing it",
    blurb: "Every edit is undoable, and the AI never applies anything without showing you first.",
    features: [
      { name: "Ask AI in plain English", detail: '"Delay UL 3100 by two weeks" — you get a preview of the exact changes before they apply.', where: "Bar at the bottom" },
      { name: "Edit a milestone", detail: "Click any marker: title, date, status, % complete, owner, comment, critical-path override.", where: "Click a marker" },
      { name: "Drag to reschedule", detail: "Drag a marker along the timeline to move its date. Dependants cascade automatically.", where: "Drag a marker" },
      { name: "Add a milestone", detail: "The + in a lane header creates one and opens it for editing.", where: "Lane header" },
      { name: "Link predecessors and successors", detail: "Build the dependency graph from either end; the critical path recomputes as you go.", where: "Milestone editor" },
      { name: "Undo anything", detail: "One history stack covers AI edits, manual edits, drags and imports alike.", where: "Bar at the bottom" },
    ],
  },
  {
    title: "Reading it",
    blurb: "What the chart is telling you, and how to focus it.",
    features: [
      { name: "Critical path", detail: "The dependency chain that sets the finish date, drawn as a red line. Style is selectable.", where: "Options ▸ Critical line" },
      { name: "Highlight a path", detail: "Trace everything feeding a milestone, or everything waiting on it. Nothing is saved — it's a view.", where: "Milestone editor" },
      { name: "Slipped dates", detail: "A milestone that moved shows how far, against its original date.", where: "Options ▸ Ghosts" },
      { name: "Marker labels", detail: "Show every title, only the ones that carry news, or none at all.", where: "Options ▸ Marker labels" },
      { name: "Executive view", detail: "Per-lane RAG rollup and the top risks, for a ninety-second read.", where: "Top toggle" },
    ],
  },
  {
    title: "Making it yours, and getting it out",
    blurb: "",
    features: [
      { name: "Three themes", detail: "Blueprint, Graphite and Press — each tuned as a whole, not a palette swap.", where: "Options ▸ Theme" },
      { name: "Per-lane colours", detail: "Pin any lane's colour; the rest follow the theme.", where: "Options ▸ Lane colours" },
      { name: "Save and open", detail: "Download the whole roadmap as a file and open it again later, or hand it to someone else.", where: "Options ▸ File" },
      { name: "Export to deck", detail: "Both views as PowerPoint slides, whichever one you're looking at.", where: "Options ▸ Export" },
    ],
  },
];

export function HelpPanel({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)", borderWidth: 1 }}
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="What Wayframe can do"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--wf-border)" }}>
          <div className="flex items-center gap-2.5">
            <WayframeMark size={26} accent={theme.accent} />
            <div>
              <h1 className="text-base font-semibold">What Wayframe can do</h1>
              <p className="text-xs opacity-60">Notes, a photo or a spreadsheet in — a program roadmap out.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100">
            ✕
          </button>
        </div>

        <div className="space-y-6 p-5">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h2 className="text-xs font-bold tracking-wide uppercase" style={{ color: theme.accent }}>
                {group.title}
              </h2>
              {group.blurb && <p className="mt-0.5 mb-2 text-xs opacity-60">{group.blurb}</p>}
              <ul className="space-y-1.5">
                {group.features.map((f) => (
                  <li key={f.name} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{f.name}</span>
                    {f.where && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap opacity-70" style={{ background: "var(--wf-border)" }}>
                        {f.where}
                      </span>
                    )}
                    <span className="w-full text-xs opacity-70">{f.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
