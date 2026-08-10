"use client";

// The So-what (BLUF) box's rich-text authoring surface (wayframe#38 item 4
// / #39) — promoted from Variant B of prototype/bluf-editing-and-formatting
// ("build Variant B for real ... replacing document.execCommand/insertHTML
// with an actual contentEditable range implementation"). No edit-mode
// toggle: click straight into the text, select a phrase, a floating
// toolbar appears over it. Real formatting goes through
// lib/rich-text/inline-format.ts's Range-API helpers, not execCommand.
import { useLayoutEffect, useRef, useState } from "react";
import { sanitizeBlufHtml } from "@/lib/rich-text/sanitize";
import { toggleInlineTag, wrapRangeWithLink, wrapSelectionWithStyle } from "@/lib/rich-text/inline-format";

const HIGHLIGHT_COLORS = [
  { name: "red", hex: "#dc2626" },
  { name: "amber", hex: "#d97706" },
  { name: "green", hex: "#16a34a" },
  { name: "blue", hex: "#2563eb" },
];

function ToolbarButton({ onClick, title, className, children }: { onClick: () => void; title: string; className?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} type="button" className={"min-w-6 rounded px-1.5 py-0.5 text-xs hover:bg-white/15 " + (className ?? "")}>
      {children}
    </button>
  );
}

function Toolbar({
  x,
  y,
  onTag,
  onColor,
  onLink,
}: {
  x: number;
  y: number;
  onTag: (tag: "strong" | "em" | "u" | "s" | "code") => void;
  onColor: (property: "color" | "background-color", value: string) => void;
  onLink: () => void;
}) {
  const [showColors, setShowColors] = useState<"color" | "background-color" | null>(null);

  return (
    <div
      style={{ left: x, top: y }}
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full flex-col gap-1 rounded-md bg-zinc-900 p-1 text-white shadow-lg"
      // mousedown, not click — a click would blur the editable div first and
      // collapse the selection these buttons act on.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex gap-0.5">
        <ToolbarButton onClick={() => onTag("strong")} title="Bold" className="font-bold">
          B
        </ToolbarButton>
        <ToolbarButton onClick={() => onTag("em")} title="Italic" className="italic">
          I
        </ToolbarButton>
        <ToolbarButton onClick={() => onTag("u")} title="Underline" className="underline">
          U
        </ToolbarButton>
        <ToolbarButton onClick={() => onTag("s")} title="Strikethrough" className="line-through">
          S
        </ToolbarButton>
        <ToolbarButton onClick={() => onTag("code")} title="Code">
          {"</>"}
        </ToolbarButton>
        <ToolbarButton onClick={onLink} title="Link">
          🔗
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowColors(showColors === "color" ? null : "color")} title="Text color">
          A
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowColors(showColors === "background-color" ? null : "background-color")} title="Highlight">
          ▉
        </ToolbarButton>
      </div>
      {showColors && (
        <div className="flex gap-0.5 border-t border-white/20 pt-1" onMouseDown={(e) => e.preventDefault()}>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              title={c.name}
              onClick={() => {
                onColor(showColors, showColors === "background-color" ? `${c.hex}55` : c.hex);
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
        aria-label="Link URL"
        className="w-40 rounded bg-white/10 px-1.5 py-0.5 text-xs text-white outline-none placeholder:text-white/40"
      />
      <button type="button" onClick={() => url.trim() && onSubmit(url.trim())} className="rounded bg-white/15 px-2 text-xs text-white hover:bg-white/25">
        Add
      </button>
    </div>
  );
}

export function RichTextEditableLine({
  html,
  onChange,
  sizePx,
  autoFocus,
  ariaLabel,
}: {
  /** Sanitized HTML — caller owns sanitizing the persisted value; this component sanitizes again on every change before calling back, so it's never the weak link either way. */
  html: string;
  onChange: (html: string) => void;
  sizePx: number;
  /** Focuses on mount — fixes the prototype's caught bug where "+ Add bullet" left focus on the button and the next keystroke's space re-triggered it instead of typing (re-checked here, not re-audited in the Variant B round). */
  autoFocus?: boolean;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<{ x: number; y: number } | null>(null);
  const savedRange = useRef<Range | null>(null);
  const didAutoFocus = useRef(false);

  // contentEditable is inherently uncontrolled — React doesn't own its
  // children, the DOM does. Applying `html` via dangerouslySetInnerHTML on
  // every render would reset the DOM (and the caret) on every keystroke,
  // since sync() below writes each edit straight back into the `html` prop.
  // The guard makes this a no-op for that self-inflicted echo (this
  // component's own last edit, sanitized, is byte-identical to what's
  // already in the DOM) while still picking up a genuine external change —
  // Undo, or a freshly mounted line.
  useLayoutEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
    if (autoFocus && !didAutoFocus.current) {
      didAutoFocus.current = true;
      ref.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

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
    if (ref.current) onChange(sanitizeBlufHtml(ref.current.innerHTML));
  }

  function applyTag(tag: "strong" | "em" | "u" | "s" | "code") {
    if (!ref.current) return;
    toggleInlineTag(ref.current, tag);
    sync();
    ref.current.focus();
    setToolbar(null);
  }

  function applyColor(property: "color" | "background-color", value: string) {
    if (!ref.current) return;
    wrapSelectionWithStyle(ref.current, property, value);
    sync();
    ref.current.focus();
    setToolbar(null);
  }

  function openLinkPrompt() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
    setLinkPrompt(toolbar);
    setToolbar(null);
  }

  function submitLink(url: string) {
    if (savedRange.current) wrapRangeWithLink(savedRange.current, url);
    sync();
    ref.current?.focus();
    setLinkPrompt(null);
  }

  return (
    <div className="relative">
      {toolbar && <Toolbar x={toolbar.x} y={toolbar.y} onTag={applyTag} onColor={applyColor} onLink={openLinkPrompt} />}
      {linkPrompt && <LinkPrompt x={linkPrompt.x} y={linkPrompt.y} onSubmit={submitLink} onCancel={() => setLinkPrompt(null)} />}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="false"
        onInput={sync}
        onMouseUp={checkSelection}
        onKeyUp={checkSelection}
        onBlur={() => setToolbar(null)}
        style={{ fontSize: sizePx, outline: "none" }}
        className="rounded border border-dashed border-transparent px-1 focus:border-current/20 [&_a]:underline [&_code]:font-mono"
      />
    </div>
  );
}
