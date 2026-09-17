"use client";

// Manual milestone editor — two-column redesign (wayframe#102/t34), the
// winning shape from that ticket's prototype exploration (validated on
// prototype/milestone-editor-redesign-102: sticky-preview-rail +
// collapsible-sections beat a top-strip+tabs layout and a wizard/stepper —
// see the prototype's own "Rejected alternatives" writeup). Content
// (title/dates/status/%/owner/category/lane row/comment/critical-path)
// stays always-open on the left and scrolls; Appearance and Relationships
// collapse by default, each badged with a live count so a glance shows
// what's actually been customized. The live preview on the right renders
// through the REAL t19 resolvers (style-resolution.ts) and the REAL
// CushionMarker/pill geometry (RoadmapTimeline.tsx) — never a re-guess at
// what the chart draws — per the prototype's own explicit design goal.
//
// Save behavior per wayframe#18: Content-field edits stay batched into the
// Save button (buildMilestoneEditOps/milestoneToEditableFields, unchanged).
// Appearance (styleOverride)/Lane row/Category/Relationships edits apply
// immediately through their own dedicated correction-box actions, same
// "instant apply, not batched" treatment onToggleDependency/onEditAttachments
// already had — batching a styleOverride change into Save would mean the
// override count badge and the live preview show stale state while the
// modal is still open.
import { useState } from "react";
import type {
  Attachment,
  LabelPosition,
  MarkerShape,
  Milestone,
  PhaseShape,
  PhaseSize,
  RenderableMilestone,
  RenderableProgram,
  Status,
  StyleOverride,
} from "@/components/timeline/types";
import type { Theme } from "@/components/timeline/theme";
import { CushionMarker, PILL_PHASE_HEIGHT } from "@/components/timeline/RoadmapTimeline";
import {
  resolveDateLabelPosition,
  resolveFontScale,
  resolveHidden,
  resolveMarkerColor,
  resolveMarkerScale,
  resolveMarkerShape,
  resolvePhaseShape,
  resolvePhaseSize,
  resolveTitleLabelPosition,
} from "@/components/timeline/style-resolution";
import { buildMilestoneEditOps, milestoneToEditableFields, type EditableMilestoneFields } from "@/lib/corrections/build-milestone-ops";
import type { AttachmentOp, PatchOp } from "@/lib/corrections/schema";
import type { TraceDirection } from "@/lib/critical-path/trace";
import { addDays, formatDateShort } from "@/components/timeline/date-utils";

const STATUS_OPTIONS: Status[] = ["not-started", "on-track", "at-risk", "delayed", "complete"];
const MARKER_SHAPES: MarkerShape[] = ["diamond", "star", "flag", "square", "rectangle", "circle"];
/** wayframe's own default color-override swatch row — no existing shared palette in this codebase to reuse (checked CategoryManager.tsx), so this mirrors prototype/milestone-editor-redesign-102's own fixed six. */
const COLOR_SWATCHES = ["#cf222e", "#b5791f", "#1a7f37", "#0969da", "#8250df", "#57606a"];
/** 3x3 compass layout for title/date label position — corners are never valid LabelPosition values, so they render as inert filler cells (prototype's `pos-cell.na`). */
const POSITION_LAYOUT: (LabelPosition | null)[] = [null, "top", null, "left", "inside", "right", null, "bottom", null];

interface EdgeRef {
  id: string;
  title: string;
}

/**
 * Add/remove one direction of the dependency graph. Both directions use
 * this — a successor is just a predecessor edge read from the other end,
 * so the parent swaps which id it passes as dependent vs dependency.
 *
 * Edits apply immediately rather than on Save, matching wayframe#18: the
 * graph shape drives the cascade and the critical-path recompute, and
 * batching those into the Save button would mean the modal shows a stale
 * critical-path checkbox while you're still editing edges.
 */
function EdgeEditor({
  label,
  hint,
  edges,
  candidates,
  onAdd,
  onRemove,
}: {
  label: string;
  hint: string;
  edges: EdgeRef[];
  candidates: EdgeRef[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-zinc-500">
        {label} <span className="font-normal text-zinc-400">— {hint}</span>
      </p>
      {edges.length === 0 ? (
        <p className="mb-1.5 text-xs text-zinc-400">None</p>
      ) : (
        <ul className="mb-1.5 space-y-1">
          {edges.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              <button
                onClick={() => onRemove(e.id)}
                aria-label={`Remove ${e.title} from ${label.toLowerCase()}`}
                className="shrink-0 rounded border border-zinc-300 px-1.5 text-[11px] text-zinc-500 hover:text-zinc-800 dark:border-zinc-600 dark:hover:text-zinc-200"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <select
        value=""
        aria-label={`Add a ${label.toLowerCase().replace(/s$/, "")}`}
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
        }}
        disabled={candidates.length === 0}
        className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-600"
      >
        <option value="">{candidates.length === 0 ? "Nothing available" : `Add a ${label.toLowerCase().replace(/s$/, "")}…`}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Attachment rows (wayframe#55/#60) — real add/remove/edit, replacing the
 * old "read-only for now" text. Edits apply immediately (mirrors
 * EdgeEditor's pattern above), reading live from `milestone.attachments`
 * rather than modal draft state, so a row's current value is always what's
 * actually saved.
 */
function AttachmentEditor({
  attachments,
  onAdd,
  onRemove,
  onEdit,
}: {
  attachments: Attachment[];
  onAdd: (attachment: Attachment) => void;
  onRemove: (index: number) => void;
  onEdit: (index: number, attachment: Attachment) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-zinc-500">Attachments</p>
      {attachments.length === 0 ? (
        <p className="mb-1.5 text-xs text-zinc-400">None</p>
      ) : (
        <ul className="mb-1.5 space-y-1.5">
          {attachments.map((a, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <select
                aria-label={`Attachment ${i + 1} type`}
                value={a.type}
                onChange={(e) => onEdit(i, { ...a, type: e.target.value as Attachment["type"] })}
                className="shrink-0 rounded border border-zinc-300 bg-transparent px-1 py-1 text-xs dark:border-zinc-600"
              >
                <option value="link">link</option>
                <option value="image">image</option>
              </select>
              <input
                aria-label={`Attachment ${i + 1} URL`}
                value={a.url}
                onChange={(e) => onEdit(i, { ...a, url: e.target.value })}
                placeholder="https://…"
                className="min-w-0 flex-1 rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-600"
              />
              <input
                aria-label={`Attachment ${i + 1} label`}
                value={a.label ?? ""}
                onChange={(e) => onEdit(i, { ...a, label: e.target.value || undefined })}
                placeholder="label (optional)"
                className="w-24 shrink-0 rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-600"
              />
              <button
                onClick={() => onRemove(i)}
                aria-label={`Remove attachment ${i + 1}`}
                className="shrink-0 rounded border border-zinc-300 px-1.5 text-[11px] text-zinc-500 hover:text-zinc-800 dark:border-zinc-600 dark:hover:text-zinc-200"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onAdd({ type: "link", url: "" })}
        className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 hover:border-zinc-500 dark:border-zinc-600 dark:text-zinc-300"
      >
        + Add attachment
      </button>
    </div>
  );
}

/** Number of set keys in a styleOverride — the Appearance section's badge count. `hidden: false` is a meaningful explicit set, same as any other key, so it counts too (mirrors clearMilestoneStyleOverride's own "override count reads accurately" doc). */
function overrideCount(styleOverride?: StyleOverride): number {
  if (!styleOverride) return 0;
  return Object.values(styleOverride).filter((v) => v !== undefined).length;
}

/** Highest Lane Row currently used by any same-lane duration-pill sibling (including this item itself, so its own current row is always a valid select option) — rows 1..max are offered, plus one "+ New row" (max + 1), per lane-rows.ts's bucketRows doc: "start at 2, grow as needed." */
function computeMaxLaneRow(data: RenderableProgram, milestone: RenderableMilestone): number {
  const rows = data.milestones.filter((m) => m.laneId === milestone.laneId && m.endDate).map((m) => m.laneRow ?? 1);
  return Math.max(1, ...rows);
}

/**
 * Collapsible section shell (t34) — real React/Tailwind rebuild of the
 * prototype's vanilla-DOM `collapsibleSection`: uppercase small-caps
 * header, badge pill, chevron that rotates open. Content always renders
 * open (no Section wrapper); only Appearance/Relationships use this, both
 * defaulting closed.
 */
function Section({
  title,
  badgeText,
  badgeActive,
  defaultOpen = false,
  children,
}: {
  title: string;
  badgeText: string;
  badgeActive: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between bg-zinc-50 px-3 py-2 text-left dark:bg-zinc-800/60"
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">{title}</span>
        <span className="flex items-center gap-2">
          <span
            className={
              badgeActive
                ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                : "rounded-full border border-zinc-300 px-2 py-0.5 text-[10px] font-semibold text-zinc-400 dark:border-zinc-600"
            }
          >
            {badgeText}
          </span>
          <span className={`text-[11px] text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        </span>
      </button>
      {open && <div className="space-y-3 p-3">{children}</div>}
    </div>
  );
}

/** Small "override / theme-program default" caption under an Appearance control — t34's answer to "the preview shouldn't lie about what's really active." */
function SourceTag({ source, children }: { source: "override" | "category" | "default"; children?: React.ReactNode }) {
  const color = source === "override" ? "text-violet-600 dark:text-violet-400 font-semibold" : source === "category" ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-zinc-400";
  const label = children ?? (source === "override" ? "your override" : source === "category" ? "from category color" : "theme/program default");
  return <p className={`mt-1 text-[10px] ${color}`}>{label}</p>;
}

function ResetButton({ onClick, children = "Reset" }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:border-zinc-500 dark:border-zinc-600 dark:text-zinc-300"
    >
      {children}
    </button>
  );
}

/**
 * Appearance section body — the 8 StyleOverride fields (wayframe#t19's
 * locked property set) plus the phase-only sub-group. Every control shows
 * its live resolved value via style-resolution.ts's real ladder functions
 * (never re-derived here) and a source tag naming which rung actually won,
 * so this can never drift from what RoadmapTimeline.tsx would draw.
 */
function AppearanceBody({
  milestone,
  data,
  theme,
  legendCategoryFillEnabled,
  hasEndDate,
  onSetStyleOverride,
  onClearStyleOverride,
}: {
  milestone: RenderableMilestone;
  data: RenderableProgram;
  theme: Theme;
  legendCategoryFillEnabled: boolean;
  hasEndDate: boolean;
  onSetStyleOverride: (id: string, patch: Partial<StyleOverride>) => void;
  onClearStyleOverride: (id: string, field: keyof StyleOverride) => void;
}) {
  const so = milestone.styleOverride;
  const category = legendCategoryFillEnabled ? data.legendCategories?.find((c) => c.id === milestone.categoryId) : undefined;

  const markerShape = resolveMarkerShape(milestone, data, theme);
  const markerScale = resolveMarkerScale(milestone, data, theme);
  const fontScale = resolveFontScale(milestone, data);
  const titlePos = resolveTitleLabelPosition(milestone);
  const datePos = resolveDateLabelPosition(milestone);
  const hidden = resolveHidden(milestone, data);
  const { fill: resolvedFill } = resolveMarkerColor(milestone, theme, data, category);
  const phaseShape = resolvePhaseShape(milestone, data, theme);
  const phaseSize = resolvePhaseSize(milestone, data, theme);

  const colorSource: "override" | "category" | "default" = so?.color ? "override" : category ? "category" : "default";

  function positionField(label: string, field: "titleLabelPosition" | "dateLabelPosition", resolved: LabelPosition | undefined) {
    const display = resolved ?? (field === "titleLabelPosition" ? "top" : "bottom");
    const hasOverride = so?.[field] !== undefined;
    return (
      <div>
        <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
        <div className="grid w-fit grid-cols-3 gap-1">
          {POSITION_LAYOUT.map((pos, i) =>
            pos === null ? (
              <div key={i} className="h-[26px] w-[26px]" />
            ) : (
              <button
                key={i}
                type="button"
                title={pos}
                aria-label={`${label}: ${pos}`}
                onClick={() => onSetStyleOverride(milestone.id, { [field]: pos })}
                className={`flex h-[26px] w-[26px] items-center justify-center rounded border text-[9px] font-semibold ${
                  display === pos
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-600 dark:text-zinc-400"
                }`}
              >
                {pos[0].toUpperCase()}
              </button>
            ),
          )}
        </div>
        <SourceTag source={hasOverride ? "override" : "default"} />
        {hasOverride && <ResetButton onClick={() => onClearStyleOverride(milestone.id, field)} />}
      </div>
    );
  }

  return (
    <>
      {hasEndDate && (
        <p className="rounded border border-dashed border-amber-300 bg-amber-50 px-2 py-1.5 text-[10.5px] text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
          This is a duration-pill milestone: marker shape/scale, font scale, label position, color, and hidden don&apos;t yet affect a pill&apos;s on-chart
          appearance — only Phase shape/size (below) do.
        </p>
      )}
      {/* Marker shape */}
      <div>
        <span className="mb-1 block text-xs font-medium text-zinc-500">Marker shape</span>
        <div className="flex flex-wrap gap-1.5">
          {MARKER_SHAPES.map((shape) => {
            // Highlights whichever shape is actually resolved and in effect
            // (override or fallback), not just an explicit override — so the
            // swatch row always shows "this is what's live," matching the
            // preview rail rather than going blank when nothing's overridden.
            const selected = markerShape === shape;
            const isOverride = so?.markerShape === shape;
            return (
              <button
                key={shape}
                type="button"
                title={shape}
                aria-label={`Marker shape: ${shape}`}
                onClick={() => onSetStyleOverride(milestone.id, { markerShape: shape })}
                className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                  isOverride
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950"
                    : selected
                      ? "border-zinc-400 bg-zinc-100 dark:bg-zinc-800"
                      : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-600"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 overflow-visible">
                  <CushionMarker cx={12} cy={12} r={8} shape={shape} fill="#57606a" stroke="none" strokeWidth={0} />
                </svg>
              </button>
            );
          })}
        </div>
        <SourceTag source={so?.markerShape !== undefined ? "override" : "default"} />
        {so?.markerShape !== undefined && <ResetButton onClick={() => onClearStyleOverride(milestone.id, "markerShape")}>Reset to default</ResetButton>}
      </div>

      {/* Marker scale + font scale */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-500">Marker scale</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.6}
              max={2}
              step={0.05}
              value={markerScale}
              onChange={(e) => onSetStyleOverride(milestone.id, { markerScale: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className="w-10 text-right font-mono text-[11px]">{markerScale.toFixed(2)}x</span>
          </div>
          <SourceTag source={so?.markerScale !== undefined ? "override" : "default"} />
          {so?.markerScale !== undefined && <ResetButton onClick={() => onClearStyleOverride(milestone.id, "markerScale")} />}
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-500">Font scale (composes w/ viewer scale)</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.6}
              max={2}
              step={0.05}
              value={fontScale}
              onChange={(e) => onSetStyleOverride(milestone.id, { fontScale: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className="w-10 text-right font-mono text-[11px]">{fontScale.toFixed(2)}x</span>
          </div>
          <SourceTag source={so?.fontScale !== undefined ? "override" : "default"} />
          {so?.fontScale !== undefined && <ResetButton onClick={() => onClearStyleOverride(milestone.id, "fontScale")} />}
        </div>
      </div>

      {/* Title / date label position */}
      <div className="grid grid-cols-2 gap-4">
        {positionField("Title label position", "titleLabelPosition", titlePos)}
        {positionField("Date label position", "dateLabelPosition", datePos)}
      </div>

      {/* Color */}
      <div>
        <span className="mb-1 block text-xs font-medium text-zinc-500">Color override</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => onSetStyleOverride(milestone.id, { color: c })}
              style={{ background: c }}
              className={`h-5 w-5 rounded ${so?.color === c ? "outline outline-2 outline-offset-1 outline-emerald-500" : "border border-black/10"}`}
            />
          ))}
          <span className="ml-1 h-5 w-5 rounded border border-black/10" style={{ background: resolvedFill }} title="Currently resolved color" />
        </div>
        <SourceTag source={colorSource} />
        {so?.color !== undefined && <ResetButton onClick={() => onClearStyleOverride(milestone.id, "color")}>Clear override</ResetButton>}
      </div>

      {/* Hidden — false is a meaningful explicit override here, not "no override," so unchecking never gets conflated with reset. */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`hidden-${milestone.id}`}
          checked={hidden}
          onChange={(e) => onSetStyleOverride(milestone.id, { hidden: e.target.checked })}
        />
        <label htmlFor={`hidden-${milestone.id}`} className="text-xs font-medium text-zinc-500">
          Hide from chart (soft-hide, not deleted)
        </label>
        {so?.hidden !== undefined && <ResetButton onClick={() => onClearStyleOverride(milestone.id, "hidden")}>Reset to default</ResetButton>}
      </div>

      {/* Phase-only sub-group — only rendered once an end date is set, per t19's own doc: phaseShape/phaseSize are only meaningful on a duration-pill milestone. */}
      {hasEndDate && (
        <div className="border-t border-dashed border-zinc-300 pt-3 dark:border-zinc-600">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Phase-only (this item has an end date)</p>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Phase shape</span>
              <select
                className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-600"
                value={phaseShape}
                onChange={(e) => onSetStyleOverride(milestone.id, { phaseShape: e.target.value as PhaseShape })}
              >
                <option value="pill">pill</option>
                <option value="rectangle">rectangle</option>
              </select>
              <SourceTag source={so?.phaseShape !== undefined ? "override" : "default"} />
              {so?.phaseShape !== undefined && <ResetButton onClick={() => onClearStyleOverride(milestone.id, "phaseShape")} />}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Phase size</span>
              <select
                className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-600"
                value={phaseSize}
                onChange={(e) => onSetStyleOverride(milestone.id, { phaseSize: e.target.value as PhaseSize })}
              >
                <option value="lean">lean</option>
                <option value="normal">normal</option>
                <option value="tall">tall</option>
              </select>
              <SourceTag source={so?.phaseSize !== undefined ? "override" : "default"} />
              {so?.phaseSize !== undefined && <ResetButton onClick={() => onClearStyleOverride(milestone.id, "phaseSize")} />}
            </label>
          </div>
        </div>
      )}
    </>
  );
}

const LABEL_POS_OFFSET: Record<LabelPosition, { dx: number; dy: number; anchor: "start" | "middle" | "end" }> = {
  inside: { dx: 0, dy: 0, anchor: "middle" },
  top: { dx: 0, dy: -1, anchor: "middle" },
  bottom: { dx: 0, dy: 1, anchor: "middle" },
  left: { dx: -1, dy: 0, anchor: "end" },
  right: { dx: 1, dy: 0, anchor: "start" },
};

/**
 * Live preview rail (t34) — renders through the exact same resolvers/
 * geometry the real chart uses (style-resolution.ts, CushionMarker,
 * PILL_PHASE_HEIGHT), reading from the in-progress `draft` for
 * Content-tab fields (so typing a title updates it instantly) plus the
 * milestone's live styleOverride/categoryId/laneRow for Appearance fields
 * (those apply on click, not on Save, so they're already live on
 * `milestone` itself, not `draft`).
 */
function MilestonePreview({
  milestone,
  draft,
  data,
  theme,
  legendCategoryFillEnabled,
}: {
  milestone: RenderableMilestone;
  draft: EditableMilestoneFields;
  data: RenderableProgram;
  theme: Theme;
  legendCategoryFillEnabled: boolean;
}) {
  const previewItem: Milestone = {
    ...milestone,
    title: draft.title,
    date: draft.date,
    endDate: draft.endDate || undefined,
    status: draft.status,
    percentComplete: draft.percentComplete,
    shortLabel: draft.shortLabel,
  };
  const category = legendCategoryFillEnabled ? data.legendCategories?.find((c) => c.id === milestone.categoryId) : undefined;
  const markerShape = resolveMarkerShape(previewItem, data, theme);
  const markerScale = resolveMarkerScale(previewItem, data, theme);
  const fontScale = resolveFontScale(previewItem, data);
  const titlePos = resolveTitleLabelPosition(previewItem) ?? "top";
  const datePos = resolveDateLabelPosition(previewItem) ?? "bottom";
  const hidden = resolveHidden(previewItem, data);
  const { fill, stroke, strokeWidth } = resolveMarkerColor(previewItem, theme, data, category);

  const w = 240;
  const h = 190;
  const cx = w / 2;
  const cy = h / 2;
  const isPhase = Boolean(draft.endDate);
  const opacity = hidden ? 0.3 : 1;

  function labelPoint(pos: LabelPosition, reach: number, dyBase: number) {
    const o = LABEL_POS_OFFSET[pos];
    return { x: cx + o.dx * reach, y: cy + o.dy * reach + dyBase, anchor: o.anchor };
  }

  let scene: React.ReactNode;
  if (isPhase) {
    const phaseSize = resolvePhaseSize(previewItem, data, theme);
    const phaseShape = resolvePhaseShape(previewItem, data, theme);
    const pillH = PILL_PHASE_HEIGHT[phaseSize];
    const pillW = w * 0.5;
    const rx = phaseShape === "pill" ? pillH / 2 : 3;
    // Deliberately ignores `fill`/`stroke`/`opacity` (color/hidden ladder) here —
    // the real chart's in-lane duration pill always fills from the lane's own
    // tint and never applies styleOverride.color/hidden (see the render block
    // this pill's height/shape now mirrors in RoadmapTimeline.tsx). Showing a
    // resolved override color/hidden-fade here would be exactly the "preview
    // lies about the real chart" bug this ticket exists to avoid — only
    // phaseShape/phaseSize (now wired for real) and isCriticalPath (drawn
    // unconditionally, not through the ladder) actually affect a pill today.
    scene = (
      <g>
        {draft.isCriticalPath && (
          <rect
            x={cx - pillW / 2 - 4}
            y={cy - pillH / 2 - 4}
            width={pillW + 8}
            height={pillH + 8}
            rx={rx + 4}
            fill="none"
            stroke={theme.criticalPathColor}
            strokeWidth={2}
          />
        )}
        <rect x={cx - pillW / 2} y={cy - pillH / 2} width={pillW} height={pillH} rx={rx} fill={theme.inkMuted} fillOpacity={0.4} stroke={theme.ink} strokeOpacity={0.3} strokeWidth={1} />
      </g>
    );
  } else {
    const r = 11 * markerScale;
    const titleP = labelPoint(titlePos, r + 14, 0);
    const dateP = labelPoint(datePos, r + 14, 12);
    const fs = 10 * fontScale;
    scene = (
      <g opacity={opacity}>
        {draft.isCriticalPath && <CushionMarker cx={cx} cy={cy} r={r + 5} shape={markerShape} fill="none" stroke={theme.criticalPathColor} strokeWidth={2} />}
        <CushionMarker cx={cx} cy={cy} r={r} shape={markerShape} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        <text x={titleP.x} y={titleP.y} textAnchor={titleP.anchor} fontSize={fs} fill={theme.ink}>
          {draft.title.length > 22 ? `${draft.title.slice(0, 21)}…` : draft.title}
        </text>
        <text x={dateP.x} y={dateP.y} textAnchor={dateP.anchor} fontSize={fs * 0.9} fill={theme.inkMuted}>
          {draft.date}
        </text>
      </g>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-visible rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/70" style={{ height: 190 }}>
        <rect x={0} y={h * 0.35} width={w} height={h * 0.3} fill={theme.rowDivider} opacity={0.5} />
        {scene}
      </svg>
      <p className="text-center text-[10px] leading-snug text-zinc-400">
        {isPhase
          ? "Live — matches the real chart's resolved phase shape/size. Color, hidden, and label-position overrides don't yet affect a duration pill's on-chart appearance (see Appearance below)."
          : "Live — matches the real chart's resolved style. Top/bottom label positions shown here only when explicitly set — otherwise the real chart's automatic layout decides placement."}
      </p>
    </div>
  );
}

// Keyed on milestone.id by the wrapper below so a fresh draft mounts per
// selection, rather than resetting local state from an effect.
function ModalForm({
  data,
  theme,
  milestone,
  legendCategoryFillEnabled,
  onSave,
  onClose,
  onDelete,
  onToggleDependency,
  onEditAttachments,
  onAcceptBaseline,
  onTrace,
  onSetCategory,
  onSetStyleOverride,
  onClearStyleOverride,
  onSetLaneRow,
}: {
  data: RenderableProgram;
  theme: Theme;
  milestone: RenderableMilestone;
  legendCategoryFillEnabled: boolean;
  onSave: (ops: PatchOp[]) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onToggleDependency: (dependentId: string, dependencyId: string, add: boolean) => void;
  onEditAttachments: (ops: AttachmentOp[]) => void;
  onAcceptBaseline: (id: string) => void;
  onTrace: (direction: TraceDirection) => void;
  /** Legend category assignment — applies immediately, same as EdgeEditor/AttachmentEditor above, not batched into Save. */
  onSetCategory?: (id: string, categoryId: string | null) => void;
  onSetStyleOverride: (id: string, patch: Partial<StyleOverride>) => void;
  onClearStyleOverride: (id: string, field: keyof StyleOverride) => void;
  onSetLaneRow: (id: string, laneRow: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<EditableMilestoneFields>(() => milestoneToEditableFields(milestone));

  const byId = new Map(data.milestones.map((x) => [x.id, x]));
  const ref = (id: string): EdgeRef => ({ id, title: byId.get(id)?.title ?? id });
  const predecessors = milestone.dependsOn.map((d) => ref(d.id));
  const successors = data.milestones.filter((o) => o.dependsOn.some((d) => d.id === milestone.id)).map((o) => ref(o.id));
  const otherMilestones = data.milestones.filter((o) => o.id !== milestone.id).map((o) => ref(o.id));
  const attachmentCount = milestone.attachments?.length ?? 0;
  const relationshipCount = predecessors.length + successors.length + attachmentCount;
  const appearanceOverrides = overrideCount(milestone.styleOverride);
  const maxLaneRow = computeMaxLaneRow(data, milestone);

  function handleSave() {
    const ops = buildMilestoneEditOps(milestone, draft);
    if (ops.length > 0) onSave(ops);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-700">
          <input
            className="w-full bg-transparent text-lg font-semibold outline-none"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <button onClick={onClose} className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-[1fr_260px]">
          <div className="max-h-[65vh] overflow-y-auto p-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Date{draft.endDate ? " (start)" : ""}</span>
                <input
                  type="date"
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
                {/* The ghost mechanism's baseline (wayframe#29/#30) — "Accept"
                    clears it so this milestone stops reading as slipped, making
                    the current date the new normal (wayframe#62). */}
                {milestone.originalDate && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400">
                    Original: {formatDateShort(milestone.originalDate)}
                    <button
                      type="button"
                      onClick={() => onAcceptBaseline(milestone.id)}
                      className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:border-zinc-500 dark:border-zinc-600 dark:text-zinc-300"
                    >
                      Accept
                    </button>
                  </p>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">End date</span>
                <input
                  type="date"
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.endDate}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  placeholder="blank = milestone"
                />
              </label>
              {/* End date is the whole answer to "is this a milestone or a phase" (wayframe#45) —
                  blank reads as a point milestone, filled-in reads as a lane-scoped duration pill.
                  The convert button is a one-click shortcut for the same toggle, not a separate path. */}
              <div className="col-span-2 -mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] text-zinc-400">Blank reads as a milestone (diamond); a filled-in date reads as a phase (pill).</p>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, endDate: draft.endDate ? "" : addDays(draft.date, 14) })}
                  className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-[11px] dark:border-zinc-600"
                >
                  {draft.endDate ? "Convert to milestone" : "Convert to pill"}
                </button>
              </div>
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Potential {draft.endDate ? "end " : ""}date <span className="font-normal text-zinc-400">— at risk of slipping to</span>
                </span>
                <input
                  type="date"
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.potentialDate}
                  onChange={(e) => setDraft({ ...draft, potentialDate: e.target.value })}
                  placeholder="blank = no projected risk"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Status</span>
                <select
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as Milestone["status"] })}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">% complete</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.percentComplete}
                  onChange={(e) => setDraft({ ...draft, percentComplete: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Owner</span>
                <input
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.owner}
                  onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
                />
              </label>
              {onSetCategory && (data.legendCategories?.length ?? 0) > 0 && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">Category</span>
                  <select
                    className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                    value={milestone.categoryId ?? ""}
                    onChange={(e) => onSetCategory(milestone.id, e.target.value || null)}
                  >
                    <option value="">None</option>
                    {data.legendCategories!.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {/* Lane row — only meaningful for a duration-pill milestone (endDate set); a point marker never stacks, per laneRow's own doc in types.ts. */}
              {draft.endDate && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-500">Lane row</span>
                  <select
                    className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                    value={String(milestone.laneRow ?? 1)}
                    onChange={(e) => {
                      const v = e.target.value;
                      onSetLaneRow(milestone.id, v === "new" ? maxLaneRow + 1 : Number(v));
                    }}
                  >
                    {Array.from({ length: maxLaneRow }, (_, i) => i + 1).map((row) => (
                      <option key={row} value={row}>
                        {row === 1 ? "Row 1 (home)" : `Row ${row}`}
                      </option>
                    ))}
                    <option value="new">+ New row</option>
                  </select>
                </label>
              )}
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Short label (timeline marker)</span>
                <input
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.shortLabel}
                  onChange={(e) => setDraft({ ...draft, shortLabel: e.target.value })}
                  placeholder="auto-derived if blank"
                />
              </label>
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Comment</span>
                <textarea
                  rows={3}
                  className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-600"
                  value={draft.comment}
                  onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                />
              </label>
              <label className="col-span-2 flex items-center gap-2">
                <input type="checkbox" checked={draft.isCriticalPath} onChange={(e) => setDraft({ ...draft, isCriticalPath: e.target.checked })} />
                <span className="text-xs font-medium text-zinc-500">On critical path (override)</span>
              </label>
              <label className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.showReferenceLine}
                  onChange={(e) => setDraft({ ...draft, showReferenceLine: e.target.checked })}
                />
                <span className="text-xs font-medium text-zinc-500">Show reference line on the chart</span>
              </label>
            </div>

            <Section title="Appearance" badgeText={appearanceOverrides > 0 ? `${appearanceOverrides} override${appearanceOverrides === 1 ? "" : "s"}` : "default"} badgeActive={appearanceOverrides > 0}>
              <AppearanceBody
                milestone={milestone}
                data={data}
                theme={theme}
                legendCategoryFillEnabled={legendCategoryFillEnabled}
                hasEndDate={Boolean(draft.endDate)}
                onSetStyleOverride={onSetStyleOverride}
                onClearStyleOverride={onClearStyleOverride}
              />
            </Section>

            <Section title="Relationships" badgeText={relationshipCount > 0 ? `${relationshipCount} linked` : "none"} badgeActive={relationshipCount > 0}>
              <EdgeEditor
                label="Predecessors"
                hint="Must finish before this milestone"
                edges={predecessors}
                candidates={otherMilestones.filter((o) => !predecessors.some((p) => p.id === o.id))}
                onAdd={(otherId) => onToggleDependency(milestone.id, otherId, true)}
                onRemove={(otherId) => onToggleDependency(milestone.id, otherId, false)}
              />
              <EdgeEditor
                label="Successors"
                hint="Wait on this milestone"
                edges={successors}
                candidates={otherMilestones.filter((o) => !successors.some((s) => s.id === o.id))}
                // A successor edge is the same edge read from the other end —
                // it lives on the *other* milestone's dependsOn, so the ids swap.
                onAdd={(otherId) => onToggleDependency(otherId, milestone.id, true)}
                onRemove={(otherId) => onToggleDependency(otherId, milestone.id, false)}
              />
              <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
                <p className="mb-1 text-xs font-semibold text-zinc-500">
                  Highlight on the chart <span className="font-normal text-zinc-400">— a view, nothing is saved</span>
                </p>
                <div className="flex gap-1.5">
                  {(
                    [
                      ["upstream", "Everything feeding this"],
                      ["downstream", "Everything waiting on this"],
                      ["both", "Both directions"],
                    ] as const
                  ).map(([dir, label]) => (
                    <button
                      key={dir}
                      onClick={() => onTrace(dir)}
                      className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 hover:border-zinc-500 dark:border-zinc-600 dark:text-zinc-300"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
                <AttachmentEditor
                  attachments={milestone.attachments ?? []}
                  onAdd={(attachment) => onEditAttachments([{ targetId: milestone.id, action: "add", attachment, reason: "manual edit" }])}
                  onRemove={(index) => onEditAttachments([{ targetId: milestone.id, action: "remove", index, reason: "manual edit" }])}
                  onEdit={(index, attachment) =>
                    onEditAttachments([
                      { targetId: milestone.id, action: "remove", index, reason: "manual edit" },
                      { targetId: milestone.id, action: "add", attachment, index, reason: "manual edit" },
                    ])
                  }
                />
              </div>
            </Section>
          </div>

          <div className="border-l border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <MilestonePreview milestone={milestone} draft={draft} data={data} theme={theme} legendCategoryFillEnabled={legendCategoryFillEnabled} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 p-4 dark:border-zinc-700">
          {/* No confirm dialog — deleting is instant and undoable through the
              same shared undo stack as every other edit (wayframe#38 item 3 /
              #39), so a confirm step would just be friction on a mistake
              that's one Undo away from fixed. */}
          <button
            onClick={() => {
              onDelete(milestone.id);
              onClose();
            }}
            className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600">
              Cancel
            </button>
            <button onClick={handleSave} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MilestoneEditorModal({
  data,
  theme,
  milestone,
  legendCategoryFillEnabled,
  onSave,
  onClose,
  onDelete,
  onToggleDependency,
  onEditAttachments,
  onAcceptBaseline,
  onTrace,
  onSetCategory,
  onSetStyleOverride,
  onClearStyleOverride,
  onSetLaneRow,
}: {
  data: RenderableProgram;
  theme: Theme;
  milestone: RenderableMilestone | null;
  legendCategoryFillEnabled: boolean;
  onSave: (ops: PatchOp[]) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onToggleDependency: (dependentId: string, dependencyId: string, add: boolean) => void;
  onEditAttachments: (ops: AttachmentOp[]) => void;
  onAcceptBaseline: (id: string) => void;
  onTrace: (direction: TraceDirection) => void;
  onSetCategory?: (id: string, categoryId: string | null) => void;
  onSetStyleOverride: (id: string, patch: Partial<StyleOverride>) => void;
  onClearStyleOverride: (id: string, field: keyof StyleOverride) => void;
  onSetLaneRow: (id: string, laneRow: number | undefined) => void;
}) {
  if (!milestone) return null;
  return (
    <ModalForm
      key={milestone.id}
      data={data}
      theme={theme}
      milestone={milestone}
      legendCategoryFillEnabled={legendCategoryFillEnabled}
      onSave={onSave}
      onClose={onClose}
      onDelete={onDelete}
      onToggleDependency={onToggleDependency}
      onEditAttachments={onEditAttachments}
      onAcceptBaseline={onAcceptBaseline}
      onTrace={onTrace}
      onSetCategory={onSetCategory}
      onSetStyleOverride={onSetStyleOverride}
      onClearStyleOverride={onClearStyleOverride}
      onSetLaneRow={onSetLaneRow}
    />
  );
}
