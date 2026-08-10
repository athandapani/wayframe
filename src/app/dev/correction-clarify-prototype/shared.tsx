"use client";

// PROTOTYPE shared plumbing — the input bar itself isn't the question under
// test (all three variants use the real production CorrectionBox.tsx's
// input styling unchanged); what differs per variant is how the box above
// it presents an ambiguous match. Factored out so each variant file stays
// focused on that one difference.
import { useState } from "react";
import type { Theme } from "@/components/timeline/theme";
import type { useCorrectionPrototype } from "../use-correction-prototype";

export type Box = ReturnType<typeof useCorrectionPrototype>;

export function CorrectionInputBar({ box, theme }: { box: Box; theme: Theme }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        box.submit(text);
        setText("");
      }}
      style={{ background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk }}
      className="fixed bottom-16 left-1/2 z-40 flex w-[660px] -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-2 shadow-xl"
    >
      <span aria-hidden="true" style={{ background: theme.accent, color: theme.panelBg }} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 0l1.3 3.4L11 4.8 7.6 6.1 6 9.6 4.4 6.1 1 4.8l3.5-1.4z" />
        </svg>
        Ask AI
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Describe a change for AI to make"
        placeholder='Try: "mark the pilot milestone complete"'
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
      />
      <button type="submit" style={{ background: theme.accent, color: theme.panelBg }} className="rounded-full px-3 py-1 text-sm">
        Send
      </button>
    </form>
  );
}

export function fieldLabel(field: string): string {
  if (field === "date") return "date";
  if (field === "status") return "status";
  return field;
}
