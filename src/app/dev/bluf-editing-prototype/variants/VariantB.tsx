"use client";

// PROTOTYPE — Variant B: always-live contentEditable + a selection toolbar.
// No mode toggle — click straight into the text like a Notion/Docs block.
// Select a phrase and a floating toolbar appears over it; the result
// renders immediately, no visible syntax ever. Round 1 only covered
// Bold/Italic; extended per live feedback to the full rich-text set —
// Underline, Strikethrough, Code, Link, text Color, and Highlight. This is
// the variant with a real schema consequence: `bluf.statement`/`bullets`
// would have to become markup, not plain strings. Bold/Italic/Underline/
// Strikethrough use the standard `document.execCommand` names; Code/Color/
// Highlight have no reliable execCommand equivalent, so those wrap the
// selection with `insertHTML` directly — both are quick stand-ins for a
// real contentEditable range implementation, not something to ship as-is.
import { useRef, useState } from "react";
import type { Theme } from "@/components/timeline/theme";
import { useBoxSize, ResizeHandle } from "../shared";

const SIZES = { sm: 11, md: 13, lg: 16 } as const;
type Size = keyof typeof SIZES;

const COLORS = [
  { name: "red", hex: "#dc2626" },
  { name: "amber", hex: "#d97706" },
  { name: "green", hex: "#16a34a" },
  { name: "blue", hex: "#2563eb" },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ToolbarButton({ onClick, title, className, children }: { onClick: () => void; title: string; className?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className={"min-w-6 rounded px-1.5 py-0.5 text-xs hover:bg-zinc-700 " + (className ?? "")}>
      {children}
    </button>
  );
}

function Toolbar({
  x,
  y,
  onCmd,
  onWrap,
  onLink,
}: {
  x: number;
  y: number;
  onCmd: (cmd: "bold" | "italic" | "underline" | "strikeThrough") => void;
  onWrap: (tag: string, style?: string) => void;
  onLink: () => void;
}) {
  const [showColors, setShowColors] = useState<"text" | "highlight" | null>(null);

  return (
    <div
      style={{ left: x, top: y }}
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full flex-col gap-1 rounded-md bg-zinc-900 p-1 text-white shadow-lg"
      // mousedown, not click — a click would first collapse the selection via blur
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex gap-0.5">
        <ToolbarButton onClick={() => onCmd("bold")} title="Bold" className="font-bold">
          B
        </ToolbarButton>
        <ToolbarButton onClick={() => onCmd("italic")} title="Italic" className="italic">
          I
        </ToolbarButton>
        <ToolbarButton onClick={() => onCmd("underline")} title="Underline" className="underline">
          U
        </ToolbarButton>
        <ToolbarButton onClick={() => onCmd("strikeThrough")} title="Strikethrough" className="line-through">
          S
        </ToolbarButton>
        <ToolbarButton onClick={() => onWrap("code", "background:rgba(255,255,255,0.15);padding:0 3px;border-radius:3px;font-family:monospace")} title="Code">
          {"</>"}
        </ToolbarButton>
        <ToolbarButton onClick={onLink} title="Link">
          🔗
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowColors(showColors === "text" ? null : "text")} title="Text color">
          A
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowColors(showColors === "highlight" ? null : "highlight")} title="Highlight">
          ▉
        </ToolbarButton>
      </div>
      {showColors && (
        <div className="flex gap-0.5 border-t border-white/20 pt-1" onMouseDown={(e) => e.preventDefault()}>
          {COLORS.map((c) => (
            <button
              key={c.name}
              title={c.name}
              onClick={() => {
                onWrap("span", showColors === "text" ? `color:${c.hex}` : `background:${c.hex}55`);
                setShowColors(null);
              }}
              className="h-5 w-5 rounded-full border border-white/30"
              style={{ background: c.hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkPrompt({ x, y, onSubmit, onCancel }: { x: number; y: number; onSubmit: (url: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  return (
    <div style={{ left: x, top: y }} className="fixed z-50 flex -translate-x-1/2 -translate-y-full gap-1 rounded-md bg-zinc-900 p-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && url.trim()) onSubmit(url.trim());
          if (e.key === "Escape") onCancel();
        }}
        placeholder="https://…"
        className="w-40 rounded bg-white/10 px-1.5 py-0.5 text-xs text-white outline-none placeholder:text-white/40"
      />
      <button onClick={() => url.trim() && onSubmit(url.trim())} className="rounded bg-white/15 px-2 text-xs text-white hover:bg-white/25">
        Add
      </button>
    </div>
  );
}

function EditableLine({ html, onChange, sizePx, placeholder }: { html: string; onChange: (html: string) => void; sizePx: number; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<{ x: number; y: number } | null>(null);
  const savedRange = useRef<Range | null>(null);

  function checkSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current?.contains(sel.anchorNode)) {
      setToolbar(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setToolbar({ x: rect.left + rect.width / 2, y: rect.top - 6 });
  }

  function sync() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function execCmd(cmd: "bold" | "italic" | "underline" | "strikeThrough") {
    document.execCommand(cmd);
    sync();
    ref.current?.focus();
  }

  // No reliable execCommand for inline code / arbitrary color — insertHTML
  // over the live selection is the deliberately quick stand-in.
  function wrapSelection(tag: string, style?: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const text = sel.toString();
    if (!text) return;
    document.execCommand("insertHTML", false, `<${tag} style="${style ?? ""}">${escapeHtml(text)}</${tag}>`);
    sync();
    ref.current?.focus();
  }

  function openLinkPrompt() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
    setLinkPrompt(toolbar);
    setToolbar(null);
  }

  function submitLink(url: string) {
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    ref.current?.focus();
    document.execCommand("createLink", false, url);
    sync();
    setLinkPrompt(null);
  }

  return (
    <div className="relative">
      {toolbar && (
        <Toolbar x={toolbar.x} y={toolbar.y} onCmd={execCmd} onWrap={wrapSelection} onLink={openLinkPrompt} />
      )}
      {linkPrompt && <LinkPrompt x={linkPrompt.x} y={linkPrompt.y} onSubmit={submitLink} onCancel={() => setLinkPrompt(null)} />}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onMouseUp={checkSelection}
        onKeyUp={checkSelection}
        onBlur={() => setToolbar(null)}
        style={{ fontSize: sizePx, outline: "none" }}
        className="rounded border border-dashed border-transparent px-1 focus:border-current/20 [&_a]:underline [&_code]:font-mono"
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
        <span className="text-[10px] opacity-50">select a phrase for the toolbar</span>
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
