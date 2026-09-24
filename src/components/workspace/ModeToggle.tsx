"use client";

// The Executive/Program toggle (wayframe issue #8's two readings of one
// plan), lifted out of RoadmapWorkspace in wayframe#144 so the combined
// multi-Program surface can carry the same control instead of inventing a
// second navigation model. It had no toggle at all before #144.
//
// The Programs picker rides INSIDE this control rather than beside it
// (#144 feedback): "which reading" and "of what" are one question, and two
// separate pills in the middle of the strip read as two unrelated controls
// competing for the same space. The Program half is also labelled in the
// plural when the Roadmap has several — what you are switching into is all
// of them, not one.
export type Mode = "executive" | "program";

export function ModeToggle({
  mode,
  onChange,
  /** True when the Roadmap holds more than one Program — labels the Program half "Programs". */
  plural = false,
  /** The Programs picker, rendered inside this control's own border. */
  trailing,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  plural?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-full border text-sm shadow" style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}>
      {(["executive", "program"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          style={mode === m ? { background: "var(--wf-accent)", color: "var(--wf-panel)" } : undefined}
          className={"px-4 py-1.5 " + (mode === m ? "font-semibold" : "opacity-60")}
        >
          {m === "executive" ? "Executive" : plural ? "Programs" : "Program"}
        </button>
      ))}
      {trailing && (
        <div className="flex items-center border-l" style={{ borderColor: "var(--wf-border)" }}>
          {trailing}
        </div>
      )}
    </div>
  );
}
