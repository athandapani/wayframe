"use client";

// The Executive/Program toggle (wayframe issue #8's two readings of one
// plan), lifted out of RoadmapWorkspace in wayframe#144 so the combined
// multi-Program surface can carry the same control instead of inventing a
// second navigation model. It had no toggle at all before #144 — the
// multi-Program canvas offered only the editing view, with the cross-Program
// summary parked above it in an editing surface it didn't belong in.
export type Mode = "executive" | "program";

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex overflow-hidden rounded-full border text-sm shadow" style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}>
      {(["executive", "program"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          style={mode === m ? { background: "var(--wf-accent)", color: "var(--wf-panel)" } : undefined}
          className={"px-4 py-1.5 capitalize " + (mode === m ? "font-semibold" : "opacity-60")}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
