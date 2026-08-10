"use client";

// PROTOTYPE — Variant A: type the syntax.
// Plain <textarea>/<input> fields, raw text at rest — bold/italic are typed
// literally as **bold** / *italic* and only render as such outside edit
// mode. Font size is a whole-box scale (Small/Medium/Large), not
// per-character — this variant has no rich-text model at all, so there's
// nothing to select-and-resize.
import { useState } from "react";
import type { Theme } from "@/components/timeline/theme";
import { useBoxSize, ResizeHandle } from "../shared";

const FONT_SIZE_PX = { sm: 11, md: 13, lg: 16 } as const;
type Size = keyof typeof FONT_SIZE_PX;

function renderInline(text: string): React.ReactNode[] {
  // **bold** and *italic*, non-overlapping, first match wins per token —
  // a real markdown parser would nest these; a prototype doesn't need to.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

export function VariantA({ initialStatement, initialBullets, theme }: { initialStatement: string; initialBullets: string[]; theme: Theme }) {
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(initialStatement);
  const [bullets, setBullets] = useState(initialBullets);
  const [fontSize, setFontSize] = useState<Size>("md");
  const { size, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp } = useBoxSize();

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
            placeholder="Bottom-line statement — **bold** and *italic* supported"
          />
          <div className="space-y-1">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
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
            <button onClick={() => setBullets([...bullets, ""])} className="text-[11px] opacity-70 hover:opacity-100">
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
