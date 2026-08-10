"use client";

// PROTOTYPE — Variant A: type the syntax.
// Plain <textarea>/<input> fields, raw text at rest. Round 1 of this
// prototype only covered bold/italic; extended per live feedback to the
// full rich-text set requested — bold, italic, underline, strikethrough,
// inline code, links, and color/highlight. Font size is still a whole-box
// scale (Small/Medium/Large), not per-character.
import { useEffect, useRef, useState } from "react";
import type { Theme } from "@/components/timeline/theme";
import { useBoxSize, ResizeHandle } from "../shared";

const FONT_SIZE_PX = { sm: 11, md: 13, lg: 16 } as const;
type Size = keyof typeof FONT_SIZE_PX;

const COLOR_MAP: Record<string, string> = { red: "#dc2626", amber: "#d97706", green: "#16a34a", blue: "#2563eb" };

// Longest/most-specific tokens first — JS split() with an alternation tries
// alternatives in order at each position, so a shorter token listed first
// would swallow part of a longer one (e.g. "*" matching inside "**").
// Link and color have no real markdown precedent — [text](url) is borrowed
// from real markdown, {color:red}text{/color} is invented for this
// prototype specifically to see how it feels (spoiler: see README).
const TOKEN_RE = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\{color:\w+\}[^{]+\{\/color\}|==[^=]+==|~~[^~]+~~|__[^_]+__|\*\*[^*]+\*\*|\*[^*]+\*)/g;

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(TOKEN_RE);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-black/10 px-1 py-0.5 text-[0.9em] dark:bg-white/10">
          {p.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "inherit", textDecorationStyle: "dotted" }}>
          {link[1]}
        </a>
      );
    }
    const color = /^\{color:(\w+)\}([^{]+)\{\/color\}$/.exec(p);
    if (color) {
      return (
        <span key={i} style={{ color: COLOR_MAP[color[1]] ?? color[1] }}>
          {color[2]}
        </span>
      );
    }
    if (p.startsWith("==") && p.endsWith("==")) {
      return (
        <mark key={i} className="rounded px-0.5">
          {p.slice(2, -2)}
        </mark>
      );
    }
    if (p.startsWith("~~") && p.endsWith("~~")) return <s key={i}>{p.slice(2, -2)}</s>;
    if (p.startsWith("__") && p.endsWith("__")) return <u key={i}>{p.slice(2, -2)}</u>;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

const SYNTAX_LEGEND: [string, string][] = [
  ["**bold**", "bold"],
  ["*italic*", "italic"],
  ["__underline__", "underline"],
  ["~~strike~~", "strikethrough"],
  ["`code`", "code"],
  ["[text](url)", "link"],
  ["==mark==", "highlight"],
  ["{color:red}text{/color}", "color"],
];

export function VariantA({ initialStatement, initialBullets, theme }: { initialStatement: string; initialBullets: string[]; theme: Theme }) {
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(initialStatement);
  const [bullets, setBullets] = useState(initialBullets);
  const [fontSize, setFontSize] = useState<Size>("md");
  const { size, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp } = useBoxSize();

  // Caught live: a plain <button onClick> for "+ Add bullet" keeps focus on
  // the button afterward (default browser behavior), not the new input —
  // if the very next keystrokes include a space (near-certain when typing a
  // sentence), each one re-activates the focused button instead of typing,
  // silently adding empty bullets instead of text. Auto-focusing the new
  // input closes that gap.
  const newBulletInputRef = useRef<HTMLInputElement | null>(null);
  const focusNewBullet = useRef(false);
  useEffect(() => {
    if (focusNewBullet.current) {
      newBulletInputRef.current?.focus();
      focusNewBullet.current = false;
    }
  }, [bullets.length]);

  const surface = { background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk };

  return (
    <div
      style={{ ...surface, borderWidth: 1, width: size.width, fontSize: FONT_SIZE_PX[fontSize] }}
      className="relative mt-3 rounded-lg border p-3 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-bold tracking-wide uppercase select-none" style={{ color: theme.accent, fontSize: 11 }}>
          So what
        </span>
        <div className="flex items-center gap-2">
          {editing && (
            <div className="flex overflow-hidden rounded border text-[10px]" style={{ borderColor: theme.panelBorder }}>
              {(Object.keys(FONT_SIZE_PX) as Size[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  style={fontSize === s ? { background: theme.accent, color: theme.panelBg } : undefined}
                  className="px-1.5 py-0.5 uppercase"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setEditing((v) => !v)} className="text-[11px] opacity-70 hover:opacity-100">
            {editing ? "Done" : "✎ Edit"}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            rows={2}
            className="w-full rounded border bg-transparent p-1.5 text-[0.95em]"
            style={{ borderColor: theme.panelBorder }}
            placeholder="Bottom-line statement"
          />
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 rounded border border-dashed p-1.5 text-[10px] opacity-70" style={{ borderColor: theme.panelBorder }}>
            {SYNTAX_LEGEND.map(([syntax, label]) => (
              <span key={syntax}>
                <code className="rounded bg-black/10 px-1 dark:bg-white/10">{syntax}</code> {label}
              </span>
            ))}
          </div>
          <div className="space-y-1">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  ref={i === bullets.length - 1 ? newBulletInputRef : undefined}
                  value={b}
                  onChange={(e) => setBullets(bullets.map((x, j) => (j === i ? e.target.value : x)))}
                  className="w-full rounded border bg-transparent p-1 text-[0.9em]"
                  style={{ borderColor: theme.panelBorder }}
                />
                <button onClick={() => setBullets(bullets.filter((_, j) => j !== i))} aria-label="Delete bullet" className="shrink-0 opacity-50 hover:opacity-100">
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                focusNewBullet.current = true;
                setBullets([...bullets, ""]);
              }}
              className="text-[11px] opacity-70 hover:opacity-100"
            >
              + Add bullet
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-2 font-medium">{renderInline(statement)}</p>
          <ul className="list-disc space-y-1 pl-4">
            {bullets.map((b, i) => (
              <li key={i}>{renderInline(b)}</li>
            ))}
          </ul>
        </>
      )}

      <ResizeHandle onPointerDown={(e) => onHandlePointerDown(e, 0)} onPointerMove={onHandlePointerMove} onPointerUp={onHandlePointerUp} />
    </div>
  );
}
