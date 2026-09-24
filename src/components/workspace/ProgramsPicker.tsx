"use client";

// The Roadmap's Program picker (wayframe#144) — one control, beside the
// Executive/Program toggle, that answers "which Program am I looking at"
// on every surface that can answer it.
//
// It replaces two links that each described the destination wrongly
// (wayframe#150): `/all`'s "← Back to Roadmap", which went to a SINGLE
// Program, and `/p/[id]`'s "View all Programs", which framed the combined
// canvas as a special mode rather than the Roadmap itself. A Roadmap is the
// container of every Program, so `All Programs` IS the Roadmap and each
// named entry is one Program inside it — which is what this control says,
// in one place, instead of two links pointing at each other.
//
// Selecting an entry NAVIGATES rather than filtering in place, and that is
// the deliberate half of #144's "decide whether the dropdown replaces the
// separate route or just drives what the existing one renders": the two
// routes are not two views of the same surface. `/p/[id]` carries the
// Portfolio-level editing the combined surface structurally cannot (theme,
// legend categories, export, saved views — see CombinedProgramEditor's
// header, seam 3), so scoping the combined canvas down to one Program
// in-place would hand back a WORSE single-Program editor than the one that
// already exists. The picker points at the real one.
//
// Renders nothing for a Roadmap with fewer than two Programs: with one
// Program there is no choice to offer, and "All Programs" and that Program
// are the same picture.
import { useRouter } from "next/navigation";

export interface ProgramPickerOption {
  id: string;
  name: string;
}

export const ALL_PROGRAMS = "all";

export function ProgramsPicker({
  portfolioId,
  programs,
  selected,
}: {
  portfolioId: string;
  /** Every Program in the Roadmap, in render order. */
  programs: ProgramPickerOption[];
  /** `"all"` on the combined surface, otherwise the Program being shown. */
  selected: string;
}) {
  const router = useRouter();
  if (programs.length < 2) return null;

  return (
    <select
      aria-label="Program"
      value={selected}
      onChange={(e) => {
        const next = e.target.value;
        router.push(next === ALL_PROGRAMS ? `/p/${portfolioId}/all` : `/p/${portfolioId}?programId=${encodeURIComponent(next)}`);
      }}
      style={{ background: "var(--wf-panel)", borderColor: "var(--wf-border)", color: "var(--wf-ink)" }}
      className="max-w-[14rem] truncate rounded-full border px-3 py-1.5 text-sm shadow"
    >
      <option value={ALL_PROGRAMS}>All Programs</option>
      {programs.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
