"use client";

// PROTOTYPE — Variant C: structured modal, no free-form rich text.
// Deliberately disagrees with A and B: there is no way to bold or italicize
// a single word anywhere in this variant. The statement is always plain
// (it's one bottom-line sentence — the question is whether it ever needs
// emphasis at all). Each bullet can be marked bold or italic as a whole
// row, not per-character. Box size is three presets, not a free drag —
// matches wayframe#17's winning shape for the milestone editor (a small
// centered modal, instant-apply on Save), reused here rather than
// reinvented.
import { useState } from "react";
import type { Theme } from "@/components/timeline/theme";

type Emphasis = "none" | "bold" | "italic";
type Preset = "S" | "M" | "L";
const PRESET_WIDTH: Record<Preset, number> = { S: 280, M: 384, L: 480 };

interface Bullet {
  text: string;
  emphasis: Emphasis;
}

function EmphasisText({ text, emphasis }: { text: string; emphasis: Emphasis }) {
  if (emphasis === "bold") return <strong>{text}</strong>;
  if (emphasis === "italic") return <em>{text}</em>;
  return <>{text}</>;
}

function EditModal({
  statement,
  bullets,
  preset,
  onSave,
  onClose,
  theme,
}: {
  statement: string;
  bullets: Bullet[];
  preset: Preset;
  onSave: (statement: string, bullets: Bullet[], preset: Preset) => void;
  onClose: () => void;
  theme: Theme;
}) {
  const [draftStatement, setDraftStatement] = useState(statement);
  const [draftBullets, setDraftBullets] = useState(bullets);
  const [draftPreset, setDraftPreset] = useState(preset);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: theme.panelBg, color: theme.panelInk, borderColor: theme.panelBorder }}
        className="w-full max-w-lg rounded-lg border p-4 shadow-2xl"
      >
        <h3 className="mb-3 text-sm font-semibold">Edit So-what</h3>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs opacity-60">Bottom-line statement</span>
          <textarea
            value={draftStatement}
            onChange={(e) => setDraftStatement(e.target.value)}
            rows={2}
            className="w-full rounded border bg-transparent p-1.5 text-sm"
            style={{ borderColor: theme.panelBorder }}
          />
        </label>

        <div className="mb-3">
          <span className="mb-1 block text-xs opacity-60">Bullets — each can be bold or italic as a whole line</span>
          <div className="space-y-1.5">
            {draftBullets.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={b.text}
                  onChange={(e) => setDraftBullets(draftBullets.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  className="w-full rounded border bg-transparent p-1 text-xs"
                  style={{ borderColor: theme.panelBorder }}
                />
                {(["none", "bold", "italic"] as Emphasis[]).map((em) => (
                  <button
                    key={em}
                    onClick={() => setDraftBullets(draftBullets.map((x, j) => (j === i ? { ...x, emphasis: em } : x)))}
                    aria-pressed={b.emphasis === em}
                    title={em}
                    style={b.emphasis === em ? { background: theme.accent, color: theme.panelBg } : { borderColor: theme.panelBorder }}
                    className={"h-6 w-6 shrink-0 rounded border text-[11px] " + (em === "bold" ? "font-bold" : em === "italic" ? "italic" : "")}
                  >
                    {em === "none" ? "–" : em === "bold" ? "B" : "I"}
                  </button>
                ))}
                <button onClick={() => setDraftBullets(draftBullets.filter((_, j) => j !== i))} aria-label="Delete bullet" className="shrink-0 opacity-40 hover:opacity-90">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setDraftBullets([...draftBullets, { text: "New point", emphasis: "none" }])} className="mt-1.5 text-[11px] opacity-70 hover:opacity-100">
            + Add bullet
          </button>
        </div>

        <div className="mb-4">
          <span className="mb-1 block text-xs opacity-60">Box size</span>
          <div className="flex overflow-hidden rounded border text-xs" style={{ borderColor: theme.panelBorder }}>
            {(["S", "M", "L"] as Preset[]).map((p) => (
              <button
                key={p}
                onClick={() => setDraftPreset(p)}
                style={draftPreset === p ? { background: theme.accent, color: theme.panelBg } : undefined}
                className="flex-1 px-2 py-1"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-xs" style={{ borderColor: theme.panelBorder }}>
            Cancel
          </button>
          <button onClick={() => onSave(draftStatement, draftBullets, draftPreset)} className="rounded px-3 py-1.5 text-xs text-white" style={{ background: theme.accent }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function VariantC({ initialStatement, initialBullets, theme }: { initialStatement: string; initialBullets: string[]; theme: Theme }) {
  const [statement, setStatement] = useState(initialStatement);
  const [bullets, setBullets] = useState<Bullet[]>(initialBullets.map((text) => ({ text, emphasis: "none" as Emphasis })));
  const [preset, setPreset] = useState<Preset>("M");
  const [modalOpen, setModalOpen] = useState(false);

  const surface = { background: theme.panelBg, borderColor: theme.panelBorder, color: theme.panelInk };

  return (
    <div style={{ ...surface, borderWidth: 1, width: PRESET_WIDTH[preset] }} className="relative mt-3 rounded-lg border p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold tracking-wide uppercase select-none" style={{ color: theme.accent, fontSize: 11 }}>
          So what
        </span>
        <button onClick={() => setModalOpen(true)} className="text-[11px] opacity-70 hover:opacity-100">
          ✎ Edit So-what
        </button>
      </div>

      <p className="mb-2 font-medium">{statement}</p>
      <ul className="list-disc space-y-1 pl-4">
        {bullets.map((b, i) => (
          <li key={i}>
            <EmphasisText text={b.text} emphasis={b.emphasis} />
          </li>
        ))}
      </ul>

      {modalOpen && (
        <EditModal
          statement={statement}
          bullets={bullets}
          preset={preset}
          theme={theme}
          onClose={() => setModalOpen(false)}
          onSave={(s, b, p) => {
            setStatement(s);
            setBullets(b);
            setPreset(p);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
