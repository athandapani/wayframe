"use client";

// PROTOTYPE — Variant C: structured modal, no free-form rich text.
// Deliberately disagrees with A and B: there is no way to format a single
// WORD anywhere in this variant — only a whole bullet at a time. The
// statement stays always plain (one bottom-line sentence). Round 1 only
// covered bold/italic as a single 3-way choice; extended per live feedback
// to independent Bold/Italic/Underline/Strikethrough toggles (combinable)
// plus a whole-bullet color and an optional whole-bullet link. Box size is
// three presets, not a free drag — matches wayframe#17's winning shape for
// the milestone editor (a small centered modal, instant-apply on Save).
import { useState } from "react";
import type { Theme } from "@/components/timeline/theme";

type Preset = "S" | "M" | "L";
const PRESET_WIDTH: Record<Preset, number> = { S: 280, M: 384, L: 480 };
const COLORS = [
  { name: "none", hex: null },
  { name: "red", hex: "#dc2626" },
  { name: "amber", hex: "#d97706" },
  { name: "green", hex: "#16a34a" },
  { name: "blue", hex: "#2563eb" },
] as const;

interface Bullet {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  linkUrl: string;
}

function emptyBullet(text: string): Bullet {
  return { text, bold: false, italic: false, underline: false, strike: false, color: null, linkUrl: "" };
}

function BulletView({ b }: { b: Bullet }) {
  const style: React.CSSProperties = {
    fontWeight: b.bold ? 700 : undefined,
    fontStyle: b.italic ? "italic" : undefined,
    textDecoration: [b.underline && "underline", b.strike && "line-through"].filter(Boolean).join(" ") || undefined,
    color: b.color ?? undefined,
  };
  const content = <span style={style}>{b.text}</span>;
  return b.linkUrl ? (
    <a href={b.linkUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
      {content}
    </a>
  ) : (
    content
  );
}

function ToggleButton({ active, onClick, title, className, children }: { active: boolean; onClick: () => void; title: string; className?: string; theme?: Theme; borderColor?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={"h-6 w-6 shrink-0 rounded border text-[11px] " + (className ?? "")}
      style={active ? undefined : { opacity: 0.5 }}
    >
      {children}
    </button>
  );
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
  const [linkEditorFor, setLinkEditorFor] = useState<number | null>(null);

  function updateBullet(i: number, patch: Partial<Bullet>) {
    setDraftBullets(draftBullets.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: theme.panelBg, color: theme.panelInk, borderColor: theme.panelBorder }}
        className="w-full max-w-xl rounded-lg border p-4 shadow-2xl"
      >
        <h3 className="mb-3 text-sm font-semibold">Edit So-what</h3>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs opacity-60">Bottom-line statement (always plain — no formatting)</span>
          <textarea
            value={draftStatement}
            onChange={(e) => setDraftStatement(e.target.value)}
            rows={2}
            className="w-full rounded border bg-transparent p-1.5 text-sm"
            style={{ borderColor: theme.panelBorder }}
          />
        </label>

        <div className="mb-3">
          <span className="mb-1 block text-xs opacity-60">Bullets — formatting applies to the whole line, not a phrase within it</span>
          <div className="space-y-2">
            {draftBullets.map((b, i) => (
              <div key={i} className="rounded border p-1.5" style={{ borderColor: theme.panelBorder }}>
                <div className="flex items-center gap-1.5">
                  <input
                    value={b.text}
                    onChange={(e) => updateBullet(i, { text: e.target.value })}
                    className="w-full rounded border bg-transparent p-1 text-xs"
                    style={{ borderColor: theme.panelBorder }}
                  />
                  <ToggleButton active={b.bold} onClick={() => updateBullet(i, { bold: !b.bold })} title="Bold" className="font-bold">
                    B
                  </ToggleButton>
                  <ToggleButton active={b.italic} onClick={() => updateBullet(i, { italic: !b.italic })} title="Italic" className="italic">
                    I
                  </ToggleButton>
                  <ToggleButton active={b.underline} onClick={() => updateBullet(i, { underline: !b.underline })} title="Underline" className="underline">
                    U
                  </ToggleButton>
                  <ToggleButton active={b.strike} onClick={() => updateBullet(i, { strike: !b.strike })} title="Strikethrough" className="line-through">
                    S
                  </ToggleButton>
                  <ToggleButton active={!!b.linkUrl} onClick={() => setLinkEditorFor(linkEditorFor === i ? null : i)} title="Link (whole bullet)">
                    🔗
                  </ToggleButton>
                  <button onClick={() => setDraftBullets(draftBullets.filter((_, j) => j !== i))} aria-label="Delete bullet" className="shrink-0 opacity-40 hover:opacity-90">
                    ✕
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-[10px] opacity-50">Color:</span>
                  {COLORS.map((c) => (
                    <button
                      key={c.name}
                      title={c.name}
                      onClick={() => updateBullet(i, { color: c.hex })}
                      aria-pressed={b.color === c.hex}
                      className="h-4 w-4 rounded-full border"
                      style={{ background: c.hex ?? "transparent", borderColor: b.color === c.hex ? theme.accent : theme.panelBorder, borderWidth: b.color === c.hex ? 2 : 1 }}
                    />
                  ))}
                  {linkEditorFor === i && (
                    <input
                      autoFocus
                      value={b.linkUrl}
                      onChange={(e) => updateBullet(i, { linkUrl: e.target.value })}
                      placeholder="https://… (whole bullet becomes a link)"
                      className="ml-2 w-full rounded border bg-transparent p-0.5 text-[10px]"
                      style={{ borderColor: theme.panelBorder }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setDraftBullets([...draftBullets, emptyBullet("New point")])} className="mt-1.5 text-[11px] opacity-70 hover:opacity-100">
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
  const [bullets, setBullets] = useState<Bullet[]>(initialBullets.map(emptyBullet));
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
            <BulletView b={b} />
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
