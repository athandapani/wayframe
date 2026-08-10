"use client";

// PROTOTYPE — Variant B: always-live contentEditable + a selection toolbar.
// No mode toggle — click straight into the text like a Notion/Docs block.
// Select a phrase and a floating Bold/Italic toolbar appears over it; the
// result renders bold/italic immediately, no visible syntax ever. This is
// the variant with a real consequence for the schema: `bluf.statement` and
// `bluf.bullets` would have to become markup/HTML, not a plain string —
// document.execCommand is a deliberately quick stand-in for a real
// contentEditable range implementation (or a small rich-text lib), good
// enough to feel the interaction, not something to ship as-is.
import { useRef, useState } from "react";
import type { Theme } from "@/components/timeline/theme";
import { useBoxSize, ResizeHandle } from "../shared";

const SIZES = { sm: 11, md: 13, lg: 16 } as const;
type Size = keyof typeof SIZES;

function Toolbar({ x, y, onBold, onItalic }: { x: number; y: number; onBold: () => void; onItalic: () => void }) {
  return (
    <div
      style={{ left: x, top: y }}
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full gap-0.5 rounded-md bg-zinc-900 p-1 text-white shadow-lg"
      // mousedown, not click — a click would first collapse the selection via blur
      onMouseDown={(e) => e.preventDefault()}
    >
      <button onClick={onBold} className="w-6 rounded px-1.5 py-0.5 text-xs font-bold hover:bg-zinc-700">
        B
      </button>
      <button onClick={onItalic} className="w-6 rounded px-1.5 py-0.5 text-xs italic hover:bg-zinc-700">
        I
      </button>
    </div>
  );
}

function EditableLine({ html, onChange, sizePx, placeholder }: { html: string; onChange: (html: string) => void; sizePx: number; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);

  function checkSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current?.contains(sel.anchorNode)) {
      setToolbar(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setToolbar({ x: rect.left + rect.width / 2, y: rect.top - 6 });
  }

  function exec(cmd: "bold" | "italic") {
    document.execCommand(cmd);
    if (ref.current) onChange(ref.current.innerHTML);
    ref.current?.focus();
  }

  return (
    <div className="relative">
      {toolbar && <Toolbar x={toolbar.x} y={toolbar.y} onBold={() => exec("bold")} onItalic={() => exec("italic")} />}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onMouseUp={checkSelection}
        onKeyUp={checkSelection}
        onBlur={() => setToolbar(null)}
        style={{ fontSize: sizePx, outline: "none" }}
        className="rounded border border-dashed border-transparent px-1 focus:border-current/20"
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export function VariantB({ initialStatement, initialBullets, theme }: { initialStatement: string; initialBullets: string[]; theme: Theme }) {
  const [statementHtml, setStatementHtml] = useState(initialStatement);
  const [bullets, setBullets] = useState(initialBullets.map((b) => ({ html: b, size: "md" as Size })));
  const { size, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp } = useBoxSize();

  const surface = { background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk };

  return (
    <div style={{ ...surface, borderWidth: 1, width: size.width }} className="relative mt-3 rounded-lg border p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold tracking-wide uppercase select-none" style={{ color: theme.accent, fontSize: 11 }}>
          So what
        </span>
        <span className="text-[10px] opacity-50">click text to edit — select a phrase for Bold/Italic</span>
      </div>

      <div className="mb-2 font-medium">
        <EditableLine html={statementHtml} onChange={setStatementHtml} sizePx={13} />
      </div>

      <ul className="list-disc space-y-1 pl-4">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <EditableLine
                html={b.html}
                sizePx={SIZES[b.size]}
                onChange={(html) => setBullets(bullets.map((x, j) => (j === i ? { ...x, html } : x)))}
              />
            </div>
            <select
              value={b.size}
              onChange={(e) => setBullets(bullets.map((x, j) => (j === i ? { ...x, size: e.target.value as Size } : x)))}
              aria-label="Bullet font size"
              className="mt-0.5 shrink-0 rounded border bg-transparent text-[10px]"
              style={{ borderColor: theme.panelBorder }}
            >
              <option value="sm">S</option>
              <option value="md">M</option>
              <option value="lg">L</option>
            </select>
            <button onClick={() => setBullets(bullets.filter((_, j) => j !== i))} aria-label="Delete bullet" className="mt-0.5 shrink-0 opacity-40 hover:opacity-90">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => setBullets([...bullets, { html: "New point", size: "md" }])} className="mt-1.5 text-[11px] opacity-70 hover:opacity-100">
        + Add bullet
      </button>

      <ResizeHandle onPointerDown={(e) => onHandlePointerDown(e, 0)} onPointerMove={onHandlePointerMove} onPointerUp={onHandlePointerUp} />
    </div>
  );
}
